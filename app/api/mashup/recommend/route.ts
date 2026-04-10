import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import Groq from "groq-sdk";
import { searchYouTubeMusic } from "@/lib/youtube";
import { getSpotifyTrackWithFeatures } from "@/lib/spotify";
import { getVideoDetails } from "@/lib/videoDetails";
import { camelotCompatibility, getCamelotPosition } from "@/lib/transitionEngine";

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function keyToName(key: number, mode?: number): string {
  const note = KEY_NAMES[key] || "?";
  if (mode === 0) return `${note} minor`;
  if (mode === 1) return `${note} major`;
  return note;
}

function camelotLabel(key: number, mode: number): string {
  const pos = getCamelotPosition(key, mode);
  return pos ? `${pos.num}${pos.letter}` : "?";
}

/** BPM compatibility: supports half-time / double-time matching */
function calculateBPMCompatibility(bpm1: number, bpm2: number): number {
  if (!bpm1 || !bpm2) return 50;
  const ratio = bpm2 / bpm1;
  // Normalise to within one octave
  const normRatio = ratio > 1.75 ? ratio / 2 : ratio < 0.57 ? ratio * 2 : ratio;
  const deviation = Math.abs(normRatio - 1);
  if (deviation < 0.03) return 100;
  if (deviation < 0.07) return 90;
  if (deviation < 0.13) return 75;
  if (deviation < 0.20) return 55;
  if (deviation < 0.30) return 35;
  return 20;
}

/**
 * Pre-filter using the AI's own declared BPM/camelot before hitting any APIs.
 * Returns true if the candidate passes minimum thresholds.
 */
function aiPreFilter(
  currentBpm: number | undefined,
  currentCamelot: string,
  rec: { bpm?: number; camelot?: string }
): boolean {
  if (currentBpm && rec.bpm) {
    const ratio = rec.bpm / currentBpm;
    const normRatio = ratio > 1.75 ? ratio / 2 : ratio < 0.57 ? ratio * 2 : ratio;
    if (Math.abs(normRatio - 1) > 0.30) return false;
  }
  if (currentCamelot !== "?" && rec.camelot) {
    const match = rec.camelot.match(/^(\d{1,2})([AB])$/i);
    const curMatch = currentCamelot.match(/^(\d{1,2})([AB])$/i);
    if (match && curMatch) {
      const num = parseInt(match[1]);
      const letter = match[2].toUpperCase();
      const curNum = parseInt(curMatch[1]);
      const curLetter = curMatch[2].toUpperCase();
      const dist = Math.min(Math.abs(num - curNum), 12 - Math.abs(num - curNum));
      if (dist > 3) return false;
      if (dist === 3 && letter !== curLetter) return false;
    }
  }
  return true;
}

function scoreCandidateFeatures(currentFeatures: any, candidateFeatures: any): number {
  if (!currentFeatures || !candidateFeatures) return 0;
  const bpmScore = calculateBPMCompatibility(currentFeatures.tempo, candidateFeatures.tempo);
  const keyScore = (currentFeatures.key != null && candidateFeatures.key != null &&
                    currentFeatures.mode != null && candidateFeatures.mode != null)
    ? camelotCompatibility(currentFeatures.key, currentFeatures.mode, candidateFeatures.key, candidateFeatures.mode)
    : 50;
  const energyDiff = Math.abs((currentFeatures.energy || 0.5) - (candidateFeatures.energy || 0.5));
  const energyScore = Math.max(0, 100 - energyDiff * 150);
  // BPM is most important for mixing, then key (Camelot), then energy
  return bpmScore * 0.45 + keyScore * 0.35 + energyScore * 0.2;
}

export async function POST(request: Request) {
  try {
    const { track, skipCache, excludedSongs = [] } = await request.json();
    if (!track) {
      return NextResponse.json({ error: "Track is required" }, { status: 400 });
    }

    const cacheKey = `recommend-${track.id}-${Math.floor(Date.now() / 60000)}`;
    if (!skipCache) {
      const cached = getCached(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const currentBpm = track.audioFeatures?.tempo;
    const currentKey = track.audioFeatures?.key;
    const currentMode = track.audioFeatures?.mode;
    const currentEnergy = track.audioFeatures?.energy;
    const keyName = currentKey != null ? keyToName(currentKey, currentMode) : "unknown";
    const camelot = (currentKey != null && currentMode != null)
      ? camelotLabel(currentKey, currentMode)
      : "?";

    const excludedList = excludedSongs.length > 0
      ? `\nDO NOT suggest: ${excludedSongs.map((s: any) => `"${s.name}" by ${s.artist}`).join(", ")}`
      : "";

    const prompt = `You are a professional DJ assistant selecting the single best next track to mix.

CURRENT TRACK: "${track.name}" by ${track.artists[0]?.name}
- BPM: ${currentBpm ?? "unknown"}${currentBpm ? ` (ideal range: ${Math.round(currentBpm * 0.93)}–${Math.round(currentBpm * 1.07)} BPM, or half/double-time)` : ""}
- Camelot key: ${camelot} (${keyName})
- Energy: ${currentEnergy != null ? Math.round(currentEnergy * 100) + "%" : "unknown"}

STRICT RULES (DO NOT BREAK):
1. BPM must be within ±10% OR a valid half/double-time match
2. Camelot key must be compatible: same key, ±1 step on wheel, or relative major/minor
3. Avoid large energy jumps (>30 out of 100)
4. Songs must be real, well-known tracks — no hallucinations
5. DO NOT repeat artists — each suggestion must be a different artist
6. DO NOT suggest meme songs, novelty tracks, or overly experimental music
${excludedList}

Return EXACTLY 8 candidates (more than needed — best will be selected by scoring algorithm).

OUTPUT — JSON ONLY:
{"recommendations":[{"artist":"name","song":"name","bpm":number,"camelot":"e.g. 8A","energy":number (0-100),"reason":"Compare BPM, key, and energy numerically to the current track"}]}`;

    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.1-8b-instant",
      temperature: 0.5,
      max_tokens: 800,
      seed: Math.floor(Math.random() * 1_000_000),
      response_format: { type: "json_object" },
    });

    const responseText = response.choices[0]?.message?.content || "";

    let aiResponse: any;
    try {
      aiResponse = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse AI response");
      const cleaned = jsonMatch[0].replace(/\}[^}]*$/, "}");
      aiResponse = JSON.parse(cleaned);
    }
    const allRecs: any[] = aiResponse.recommendations || [];

    // Pre-filter using AI's own declared BPM/camelot before any expensive API calls
    const recs = allRecs.filter((rec) => aiPreFilter(currentBpm, camelot, rec));
    console.log(`[recommend] AI returned ${allRecs.length}, pre-filter kept ${recs.length}`);

    let bestCandidate: { track: any; reason: string; score: number } | null = null;

    for (const rec of recs) {
      try {
        const isExcluded = excludedSongs.some(
          (ex: any) =>
            ex.name?.toLowerCase() === rec.song?.toLowerCase() &&
            ex.artist?.toLowerCase() === rec.artist?.toLowerCase()
        );
        if (isExcluded) continue;

        const results = await searchYouTubeMusic(`${rec.song} ${rec.artist}`, 1);
        const song = results?.[0];
        if (!song) continue;
        if (excludedSongs.some((ex: any) => ex.id === song.videoId)) continue;

        const spotifyData = await getSpotifyTrackWithFeatures(rec.song, rec.artist);
        let audioFeatures: any;
        let albumImage = "";

        if (spotifyData?.features) {
          audioFeatures = spotifyData.features;
          albumImage = spotifyData.track?.album?.images?.[0]?.url || "";
        } else {
          audioFeatures = await getVideoDetails(song.videoId);
        }

        const score = scoreCandidateFeatures(track.audioFeatures, audioFeatures);

        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = {
            track: {
              id: song.videoId,
              name: song.name,
              artists: [{ name: song.artist.name }],
              album: { images: [{ url: albumImage || song.thumbnails?.[0]?.url || "" }] },
              audioFeatures,
            },
            reason: rec.reason,
            score,
          };
        }
      } catch (error) {
        console.error(`Failed to process "${rec.song}":`, error);
      }
    }

    if (!bestCandidate) {
      return NextResponse.json(
        { error: "Could not find a recommendation" },
        { status: 404 }
      );
    }

    const result = {
      recommendedTrack: bestCandidate.track,
      reason: bestCandidate.reason,
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Recommendation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get recommendation" },
      { status: 500 }
    );
  }
}

