import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import Groq from "groq-sdk";
import { getSpotifyTrackWithFeatures } from "@/lib/spotify";
import { searchYouTubeMusic } from "@/lib/youtube";

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function keyToName(key: number, mode?: number): string {
  const note = KEY_NAMES[key] || "?";
  if (mode === 0) return `${note} minor`;
  if (mode === 1) return `${note} major`;
  return note;
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

function calculateKeyCompatibility(key1: number, key2: number): number {
  if (key1 === key2) return 100;

  const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  const pos1 = circleOfFifths.indexOf(key1);
  const pos2 = circleOfFifths.indexOf(key2);

  if (pos1 === -1 || pos2 === -1) return 50;

  const distance = Math.min(
    Math.abs(pos1 - pos2),
    12 - Math.abs(pos1 - pos2)
  );

  if (distance === 1) return 90;
  if (distance === 2) return 70;
  if (distance === 3) return 50;
  return Math.max(30, 100 - distance * 15);
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
  const keyMatch = calculateKeyCompatibility(current.key, candidate.key);
  const energyMatch = calculateEnergyMatch(current.energy, candidate.energy);

  const score = bpmMatch * 0.45 + keyMatch * 0.35 + energyMatch * 0.2;

  return {
    score: Math.round(score),
    bpmMatch: Math.round(bpmMatch),
    keyMatch: Math.round(keyMatch),
    energyMatch: Math.round(energyMatch),
  };
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
  const resp = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/youtube/video-details?id=${videoId}`
  );
  return { features: await resp.json(), albumImage: "" };
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
    const { track, count = 5, skipCache = false } = await request.json();

    if (!track) {
      return NextResponse.json({ error: "Track is required" }, { status: 400 });
    }

    const cacheKey = `recommend-list-${track.id}-${count}`;
    if (!skipCache) {
      const cached = getCached(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const currentBpm = track.audioFeatures?.tempo;
    const currentKey = track.audioFeatures?.key;
    const currentMode = track.audioFeatures?.mode;
    const currentEnergy = track.audioFeatures?.energy;

    const keyName = currentKey != null ? keyToName(currentKey, currentMode) : "unknown";
    const genrePool = GENRE_POOLS[Math.floor(Math.random() * GENRE_POOLS.length)];
    const overGenerateCount = Math.max(count * 3, 12);

    const prompt = `You are a professional DJ building a set. I need ${overGenerateCount} song suggestions that could work after:

"${track.name}" by ${track.artists[0]?.name}
- BPM: ${currentBpm || "unknown"}
- Key: ${keyName}
- Energy: ${currentEnergy != null ? Math.round(currentEnergy * 100) + "%" : "unknown"}

Give me a MIX of songs — some from ${genrePool}, and some from other genres that share a similar vibe or energy. Prioritize variety: different artists, different eras, different subgenres. Include both well-known and lesser-known tracks.

DO NOT focus on matching exact BPM or key — I will verify that myself. Just suggest songs with a similar feel, mood, or danceability that a DJ might mix together.

Respond ONLY with JSON (no markdown):
{
  "recommendations": [
    { "artist": "artist name", "song": "song name", "reason": "brief vibe/mood reason" }
  ]
}`;

    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 1.1,
      max_tokens: 1500,
      seed: Math.floor(Math.random() * 1_000_000),
    });

    const responseText = response.choices[0]?.message?.content || "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response");

    const aiResponse = JSON.parse(jsonMatch[0]);
    const candidates: RecommendedTrack[] = [];

    const processBatch = async (recs: any[]) => {
      return Promise.allSettled(
        recs.map(async (rec) => {
          const results = await searchYouTubeMusic(`${rec.song} ${rec.artist}`, 1);
          const song = results?.[0];
          if (!song) return null;

          const { features, albumImage } = await fetchTrackFeatures(
            rec.song,
            rec.artist,
            song.videoId
          );

          const recommendedTrack: Track = {
            id: song.videoId,
            name: rec.song,
            artists: [{ name: rec.artist }],
            album: {
              images: [{ url: albumImage || song.thumbnails?.[0]?.url || "" }],
            },
            audioFeatures: features,
          };

          const analysis = calculateTransitionScore(track, recommendedTrack);

          return {
            ...recommendedTrack,
            transitionScore: analysis.score,
            transitionReason: rec.reason,
            bpmMatch: analysis.bpmMatch,
            keyMatch: analysis.keyMatch,
            energyMatch: analysis.energyMatch,
          } as RecommendedTrack;
        })
      );
    };

    const allRecs = aiResponse.recommendations || [];
    const BATCH_SIZE = 4;
    for (let i = 0; i < allRecs.length; i += BATCH_SIZE) {
      const batch = allRecs.slice(i, i + BATCH_SIZE);
      const results = await processBatch(batch);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          candidates.push(r.value);
        }
      }
      if (candidates.length >= count * 2) break;
    }

    // Deduplicate by video ID
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    // Sort by transition score and take the best ones
    unique.sort((a, b) => b.transitionScore - a.transitionScore);
    const recommendations = unique.slice(0, count);

    const result = {
      recommendations,
      currentTrack: {
        name: track.name,
        artist: track.artists[0]?.name,
        bpm: currentBpm,
        key: currentKey,
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
