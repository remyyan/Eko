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
    const overGenerateCount = vibePrompt ? Math.max(count * 3, 15) : Math.max(count + 3, 8);

    const prompt = vibePrompt
      ? `DJ set: ${overGenerateCount} songs to mix after "${track.name}" by ${track.artists[0]?.name} (${currentBpm || "?"}BPM, ${keyName}). USER REQUEST: "${vibePrompt}" — follow this EXACTLY. If they ask for a specific artist, ONLY list songs by that artist. JSON only:\n{"recommendations":[{"artist":"name","song":"name","reason":"brief reason"}]}`
      : `DJ set: ${overGenerateCount} songs to mix after "${track.name}" by ${track.artists[0]?.name} (${currentBpm || "?"}BPM, ${keyName}, ${currentEnergy != null ? Math.round(currentEnergy * 100) + "%" : "?"} energy). Mix from ${genrePool} and similar genres. Variety: different artists/eras. JSON only:\n{"recommendations":[{"artist":"name","song":"name","reason":"brief reason"}]}`;

    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.1-8b-instant",
      temperature: 1.0,
      max_tokens: 800,
      seed: Math.floor(Math.random() * 1_000_000),
      response_format: { type: "json_object" },
    });

    const responseText = response.choices[0]?.message?.content || "";

    let aiResponse: any;
    try {
      aiResponse = JSON.parse(responseText);
    } catch {
      // Fallback: try extracting JSON from mixed text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse AI response");
      // Clean trailing garbage after the last ]
      const cleaned = jsonMatch[0].replace(/\}[^}]*$/, "}");
      aiResponse = JSON.parse(cleaned);
    }
    const candidates: RecommendedTrack[] = [];

    // Extract artist name from vibe prompt for post-filtering
    // Detects patterns like "nmixx songs only", "only twice", "blackpink songs"
    const artistFilter = vibePrompt
      ? extractArtistFilter(vibePrompt)
      : null;

    const processBatch = async (recs: any[]) => {
      return Promise.allSettled(
        recs.map(async (rec) => {
          const results = await searchYouTubeMusic(`${rec.song} ${rec.artist}`, 1);
          const song = results?.[0];
          if (!song) return null;

          // If the user requested a specific artist, verify the YouTube result matches
          if (artistFilter) {
            const resultArtist = song.artist.name.toLowerCase();
            if (!resultArtist.includes(artistFilter)) {
              console.log(`Filtered out "${song.name}" by ${song.artist.name} (doesn't match "${artistFilter}")`);
              return null;
            }
          }

          const { features, albumImage } = await fetchTrackFeatures(
            rec.song,
            rec.artist,
            song.videoId
          );

          const recommendedTrack: Track = {
            id: song.videoId,
            name: song.name,
            artists: [{ name: song.artist.name }],
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

    // Deduplicate and exclude already-played tracks
    const excludeSet = new Set<string>(excludeIds);
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      if (seen.has(c.id) || excludeSet.has(c.id)) return false;
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
