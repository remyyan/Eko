import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import Groq from "groq-sdk";
import { searchYouTubeMusic } from "@/lib/youtube";
import { getSpotifyTrackWithFeatures } from "@/lib/spotify";
import { getVideoDetails } from "@/lib/videoDetails";

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function keyToName(key: number, mode?: number): string {
  const note = KEY_NAMES[key] || "?";
  if (mode === 0) return `${note} minor`;
  if (mode === 1) return `${note} major`;
  return note;
}

function calculateBPMCompatibility(bpm1: number, bpm2: number): number {
  const diff = Math.abs(bpm1 - bpm2);
  if (diff === 0) return 100;
  const ratio = bpm1 / bpm2;
  if (Math.abs(ratio - 2) < 0.1 || Math.abs(ratio - 0.5) < 0.1) return 95;
  if (diff <= 3) return 95;
  if (diff <= 6) return 85;
  if (diff <= 10) return 75;
  if (diff <= 15) return 60;
  if (diff <= 20) return 45;
  return Math.max(20, 100 - diff * 2);
}

function calculateKeyCompatibility(key1: number, key2: number): number {
  if (key1 === key2) return 100;
  const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  const pos1 = circleOfFifths.indexOf(key1);
  const pos2 = circleOfFifths.indexOf(key2);
  if (pos1 === -1 || pos2 === -1) return 50;
  const distance = Math.min(Math.abs(pos1 - pos2), 12 - Math.abs(pos1 - pos2));
  if (distance === 1) return 90;
  if (distance === 2) return 70;
  if (distance === 3) return 50;
  return Math.max(30, 100 - distance * 15);
}

function scoreCandidateFeatures(currentFeatures: any, candidateFeatures: any): number {
  if (!currentFeatures || !candidateFeatures) return 0;
  const bpm = calculateBPMCompatibility(currentFeatures.tempo, candidateFeatures.tempo);
  const key = calculateKeyCompatibility(currentFeatures.key, candidateFeatures.key);
  const energyDiff = Math.abs(currentFeatures.energy - candidateFeatures.energy);
  const energy = Math.round(Math.max(0, 100 - energyDiff * 150));
  return bpm * 0.45 + key * 0.35 + energy * 0.2;
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

    const excludedList = excludedSongs.length > 0
      ? `\nDO NOT suggest: ${excludedSongs.map((s: any) => `"${s.name}" by ${s.artist}`).join(", ")}`
      : "";

    const prompt = `DJ mix: 6 songs similar vibe to "${track.name}" by ${track.artists[0]?.name} (${currentBpm || "?"}BPM, ${keyName}, ${currentEnergy != null ? Math.round(currentEnergy * 100) + "%" : "?"} energy). Different artists, variety.${excludedList}
JSON only: {"recommendations":[{"artist":"name","song":"name","reason":"brief reason"}]}`;

    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.1-8b-instant",
      temperature: 1.0,
      max_tokens: 500,
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
    const recs = aiResponse.recommendations || [];

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

