import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import Groq from "groq-sdk";
import { getSpotifyTrackWithFeatures } from "@/lib/spotify";
import { searchYouTubeMusic } from "@/lib/youtube";
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

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  audioFeatures?: any;
}

interface RecommendedTrack extends Track {
  transitionScore: number;
  transitionReason: string;
  bpmMatch: number;
  keyMatch: number;
  energyMatch: number;
}

/** BPM compatibility supporting half/double-time. Returns 0-100. */
function calculateBPMCompatibility(bpm1: number, bpm2: number): number {
  if (!bpm1 || !bpm2) return 50;
  const ratio = bpm2 / bpm1;
  const normRatio = ratio > 1.75 ? ratio / 2 : ratio < 0.57 ? ratio * 2 : ratio;
  const deviation = Math.abs(normRatio - 1);
  if (deviation < 0.03) return 100;
  if (deviation < 0.07) return 90;
  if (deviation < 0.13) return 75;
  if (deviation < 0.20) return 55;
  if (deviation < 0.30) return 35;
  return 20;
}

function calculateEnergyMatch(energy1: number, energy2: number): number {
  const diff = Math.abs(energy1 - energy2);
  return Math.round(Math.max(0, 100 - diff * 150));
}

function calculateTransitionScore(
  currentTrack: Track,
  candidateTrack: Track
): { score: number; bpmMatch: number; keyMatch: number; energyMatch: number } {
  const current = currentTrack.audioFeatures;
  const candidate = candidateTrack.audioFeatures;

  if (!current || !candidate) {
    return { score: 50, bpmMatch: 50, keyMatch: 50, energyMatch: 50 };
  }

  const bpmMatch = calculateBPMCompatibility(current.tempo, candidate.tempo);
  const keyMatch = (current.key != null && candidate.key != null &&
                    current.mode != null && candidate.mode != null)
    ? camelotCompatibility(current.key, current.mode, candidate.key, candidate.mode)
    : 50;
  const energyMatch = calculateEnergyMatch(current.energy, candidate.energy);

  const score = bpmMatch * 0.45 + keyMatch * 0.35 + energyMatch * 0.2;

  return {
    score: Math.round(score),
    bpmMatch: Math.round(bpmMatch),
    keyMatch: Math.round(keyMatch),
    energyMatch: Math.round(energyMatch),
  };
}

/**
 * Pre-filter using the AI's own declared BPM/camelot before hitting any APIs.
 * Returns true if the candidate passes minimum thresholds.
 */
function aiPreFilter(
  currentBpm: number | undefined,
  currentCamelot: string,
  rec: { bpm?: number; camelot?: string; energy?: number }
): boolean {
  // BPM check
  if (currentBpm && rec.bpm) {
    const ratio = rec.bpm / currentBpm;
    const normRatio = ratio > 1.75 ? ratio / 2 : ratio < 0.57 ? ratio * 2 : ratio;
    if (Math.abs(normRatio - 1) > 0.30) return false; // too far even with half/double time
  }
  // Camelot check: parse "8A" style strings
  if (currentCamelot !== "?" && rec.camelot) {
    const match = rec.camelot.match(/^(\d{1,2})([AB])$/i);
    const curMatch = currentCamelot.match(/^(\d{1,2})([AB])$/i);
    if (match && curMatch) {
      const num = parseInt(match[1]);
      const letter = match[2].toUpperCase();
      const curNum = parseInt(curMatch[1]);
      const curLetter = curMatch[2].toUpperCase();
      const dist = Math.min(Math.abs(num - curNum), 12 - Math.abs(num - curNum));
      // Drop anything further than 3 steps on the wheel — too clashing
      if (dist > 3) return false;
      // If 3 steps away, require same letter (less harmonic risk)
      if (dist === 3 && letter !== curLetter) return false;
    }
  }
  // Energy check: drop if AI says energy gap is massive (>35 out of 100)
  if (rec.energy != null) {
    // We don't have a normalised energy 0-100 from the current track easily here,
    // so just guard against clearly wrong values
    if (rec.energy < 0 || rec.energy > 100) return false;
  }
  return true;
}

async function fetchTrackFeatures(
  songName: string,
  artistName: string,
  videoId: string
): Promise<any> {
  const spotifyData = await getSpotifyTrackWithFeatures(songName, artistName);
  if (spotifyData?.features) {
    return { features: spotifyData.features, albumImage: spotifyData.track?.album?.images?.[0]?.url || "" };
  }
  const features = await getVideoDetails(videoId);
  return { features, albumImage: "" };
}

/**
 * Try to extract a specific artist name from the user's vibe prompt.
 * Returns lowercase artist name if detected, null otherwise.
 */
function extractArtistFilter(prompt: string): string | null {
  const lower = prompt.toLowerCase().trim();

  // Patterns: "only X songs", "X songs only", "only X", "just X", "X only"
  const patterns = [
    /only\s+(.+?)\s+songs/,
    /(.+?)\s+songs\s+only/,
    /only\s+(.+?)$/,
    /just\s+(.+?)\s+songs/,
    /(.+?)\s+only$/,
    /^(.+?)\s+songs$/,
    /i\s+want\s+(?:an?\s+)?(.+?)\s+(?:concert|set|songs|playlist|mix)/,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      const artist = match[1].replace(/['"]/g, "").trim();
      if (artist.length >= 2 && artist.length <= 40) return artist;
    }
  }

  return null;
}

const GENRE_POOLS = [
  "K-pop, J-pop, and Asian pop",
  "Western pop and electropop",
  "R&B, neo-soul, and hip-hop",
  "EDM, house, and dance music",
  "Latin pop, reggaeton, and Afrobeats",
  "indie pop, alternative, and rock",
];

export async function POST(request: Request) {
  try {
    const { track, count = 5, skipCache = false, excludeIds = [], vibePrompt } = await request.json();

    if (!track) {
      return NextResponse.json({ error: "Track is required" }, { status: 400 });
    }

    const cacheKey = `recommend-list-${track.id}-${count}-${vibePrompt ?? ""}`;
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
    const genrePool = GENRE_POOLS[Math.floor(Math.random() * GENRE_POOLS.length)];
    // Over-generate so pre-filter + dedup still yield enough results
    const overGenerateCount = Math.max(count * 3, 12);

    const excludedList = excludeIds.length > 0
      ? `\nDO NOT suggest tracks with these IDs (already played): ${excludeIds.join(", ")}`
      : "";

    const vibeSection = vibePrompt
      ? `\nUSER REQUEST: "${vibePrompt}"\nINTERPRETATION RULES:\n- If artist specified → ONLY songs by that artist\n- If genre specified → prioritize that genre\n- If mood/era specified → match energy + style\n- STILL obey all DJ compatibility rules above`
      : `\nMix from ${genrePool} and similar genres. Use variety — different artists and eras.`;

    const prompt = `You are a professional DJ assistant selecting songs that can be CLEANLY MIXED into the current track.

CURRENT TRACK: "${track.name}" by ${track.artists[0]?.name}
- BPM: ${currentBpm ?? "unknown"}
- Camelot key: ${camelot} (${keyName})
- Energy: ${currentEnergy != null ? Math.round(currentEnergy * 100) + "%" : "unknown"}

STRICT RULES (DO NOT BREAK):
1. BPM must be within ±10% OR a valid half/double-time match
2. Camelot key must be compatible: same key, ±1 step on wheel, or relative major/minor (same number, different letter)
3. Avoid large energy jumps (>30 out of 100)
4. Songs must be real, well-known tracks — no hallucinations
5. DO NOT repeat artists
6. DO NOT suggest meme songs, novelty tracks, or overly experimental music
${excludedList}${vibeSection}

SELECTION STRATEGY:
1. Filter by BPM compatibility first
2. Then filter by Camelot key compatibility
3. Then choose for best energy flow
4. Prefer tracks DJs would realistically play together

Return EXACTLY ${overGenerateCount} candidates (more than needed — they will be filtered and scored).

OUTPUT — JSON ONLY (reason MUST be a plain text string sentence, NOT an object):
{"recommendations":[{"artist":"name","song":"name","bpm":128,"camelot":"9A","energy":75,"reason":"128 BPM matches within 1%, 9A is one step from 8A on Camelot wheel, similar energy"}]}`;

    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.1-8b-instant",
      temperature: 0.5,
      max_tokens: 1200,
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
      aiResponse = JSON.parse(jsonMatch[0]);
    }

    const allRecs: any[] = aiResponse.recommendations || [];

    // ── Pre-filter using AI's own declared BPM/camelot before any API calls ──
    const preFiltered = allRecs.filter((rec) => aiPreFilter(currentBpm, camelot, rec));
    console.log(`[recommend-list] AI returned ${allRecs.length}, pre-filter kept ${preFiltered.length}`);

    // Extract artist name from vibe prompt for post-filtering
    const artistFilter = vibePrompt ? extractArtistFilter(vibePrompt) : null;

    const candidates: RecommendedTrack[] = [];
    const seenArtists = new Set<string>();

    const processBatch = async (recs: any[]) => {
      return Promise.allSettled(
        recs.map(async (rec) => {
          // Deduplicate artists even before hitting YouTube
          const artistKey = rec.artist?.toLowerCase().trim();
          if (artistKey && seenArtists.has(artistKey)) return null;

          const results = await searchYouTubeMusic(`${rec.song} ${rec.artist}`, 1);
          const song = results?.[0];
          if (!song) return null;

          // Artist filter from vibe prompt
          if (artistFilter) {
            const resultArtist = song.artist.name.toLowerCase();
            if (!resultArtist.includes(artistFilter)) {
              console.log(`[recommend-list] Filtered out "${song.name}" — doesn't match "${artistFilter}"`);
              return null;
            }
          }

          if (artistKey) seenArtists.add(artistKey);

          const { features, albumImage } = await fetchTrackFeatures(rec.song, rec.artist, song.videoId);

          const recommendedTrack: Track = {
            id: song.videoId,
            name: song.name,
            artists: [{ name: song.artist.name }],
            album: { images: [{ url: albumImage || song.thumbnails?.[0]?.url || "" }] },
            audioFeatures: features,
          };

          const analysis = calculateTransitionScore(track, recommendedTrack);

          return {
            ...recommendedTrack,
            transitionScore: analysis.score,
            transitionReason: typeof rec.reason === "string" ? rec.reason : JSON.stringify(rec.reason),
            bpmMatch: analysis.bpmMatch,
            keyMatch: analysis.keyMatch,
            energyMatch: analysis.energyMatch,
          } as RecommendedTrack;
        })
      );
    };

    const BATCH_SIZE = 4;
    for (let i = 0; i < preFiltered.length; i += BATCH_SIZE) {
      const batch = preFiltered.slice(i, i + BATCH_SIZE);
      const results = await processBatch(batch);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) candidates.push(r.value);
      }
      if (candidates.length >= count * 2) break;
    }

    // Deduplicate by video ID and exclude already-played tracks
    const excludeSet = new Set<string>(excludeIds);
    const seenIds = new Set<string>();
    const unique = candidates.filter((c) => {
      if (seenIds.has(c.id) || excludeSet.has(c.id)) return false;
      seenIds.add(c.id);
      return true;
    });

    unique.sort((a, b) => b.transitionScore - a.transitionScore);
    const recommendations = unique.slice(0, count);

    const result = {
      recommendations,
      currentTrack: {
        name: track.name,
        artist: track.artists[0]?.name,
        bpm: currentBpm,
        key: currentKey,
        camelot,
        energy: currentEnergy,
      },
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Recommendation list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get recommendations" },
      { status: 500 }
    );
  }
}
