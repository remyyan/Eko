/**
 * DJ Recommendation List API
 * 
 * This endpoint provides multiple song recommendations optimized for smooth DJ transitions.
 * 
 * How it works:
 * 1. Uses AI (Groq) to generate diverse song recommendations based on the current track
 * 2. Searches for each recommendation on YouTube Music
 * 3. Fetches audio features (BPM, key, energy) for each track
 * 4. Calculates transition compatibility scores based on:
 *    - BPM matching (45% weight) - checks for close BPM or double/half time relationships
 *    - Key compatibility (35% weight) - uses circle of fifths for harmonic matching
 *    - Energy matching (20% weight) - ensures smooth energy transitions
 * 5. Returns sorted list with detailed transition metrics
 * 
 * Transition Score Calculation:
 * - 80-100%: Excellent transition - very compatible tracks
 * - 65-79%: Good transition - compatible with minor adjustments
 * - 50-64%: Fair transition - requires more DJ skill
 * - <50%: Difficult transition - may sound jarring
 */

import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import Groq from "groq-sdk";
import { getSpotifyTrackWithFeatures } from "@/lib/spotify";
import { searchYouTubeMusic } from "@/lib/youtube";

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

// Calculate how well two keys match (using circle of fifths)
function calculateKeyCompatibility(key1: number, key2: number): number {
  if (key1 === key2) return 100; // Perfect match
  
  // Circle of fifths compatibility
  const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  const pos1 = circleOfFifths.indexOf(key1);
  const pos2 = circleOfFifths.indexOf(key2);
  
  if (pos1 === -1 || pos2 === -1) return 50;
  
  const distance = Math.min(
    Math.abs(pos1 - pos2),
    12 - Math.abs(pos1 - pos2)
  );
  
  // Adjacent keys in circle of fifths are very compatible
  if (distance === 1) return 90;
  if (distance === 2) return 70;
  if (distance === 3) return 50;
  return Math.max(30, 100 - distance * 15);
}

// Calculate BPM compatibility
function calculateBPMCompatibility(bpm1: number, bpm2: number): number {
  const diff = Math.abs(bpm1 - bpm2);
  
  // Perfect match
  if (diff === 0) return 100;
  
  // Check for double-time or half-time relationships
  const ratio = bpm1 / bpm2;
  if (Math.abs(ratio - 2) < 0.1 || Math.abs(ratio - 0.5) < 0.1) {
    return 95; // Double/half time is great for transitions
  }
  
  // Within 5 BPM is excellent
  if (diff <= 5) return 90;
  if (diff <= 10) return 75;
  if (diff <= 15) return 60;
  if (diff <= 20) return 45;
  return Math.max(20, 100 - diff * 2);
}

// Calculate energy match (closer is better for smooth transitions)
function calculateEnergyMatch(energy1: number, energy2: number): number {
  const diff = Math.abs(energy1 - energy2);
  return Math.max(0, 100 - diff * 100);
}

// Calculate overall transition score
function calculateTransitionScore(
  currentTrack: Track,
  candidateTrack: Track
): {
  score: number;
  bpmMatch: number;
  keyMatch: number;
  energyMatch: number;
} {
  const current = currentTrack.audioFeatures;
  const candidate = candidateTrack.audioFeatures;
  
  if (!current || !candidate) {
    return { score: 50, bpmMatch: 50, keyMatch: 50, energyMatch: 50 };
  }
  
  const bpmMatch = calculateBPMCompatibility(current.tempo, candidate.tempo);
  const keyMatch = calculateKeyCompatibility(current.key, candidate.key);
  const energyMatch = calculateEnergyMatch(current.energy, candidate.energy);
  
  // Weighted average: BPM is most important for DJs, then key, then energy
  const score = (bpmMatch * 0.45) + (keyMatch * 0.35) + (energyMatch * 0.20);
  
  return {
    score: Math.round(score),
    bpmMatch: Math.round(bpmMatch),
    keyMatch: Math.round(keyMatch),
    energyMatch: Math.round(energyMatch),
  };
}

export async function POST(request: Request) {
  try {
    const { track, count = 5 } = await request.json();
    
    if (!track) {
      return NextResponse.json(
        { error: "Track is required" },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = `recommend-list-${track.id}-${count}`;
    const cached = getCached(cacheKey);
    if (cached) {
      console.log("Returning cached recommendation list");
      return NextResponse.json(cached);
    }

    // Get AI recommendations using Groq
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const prompt = `You are a professional DJ. Recommend ${count} songs that would transition well from this track:

Current Track: "${track.name}" by ${track.artists[0]?.name}
- BPM: ${track.audioFeatures?.tempo || "unknown"}
- Key: ${track.audioFeatures?.key || "unknown"} (0-11 scale)
- Energy: ${track.audioFeatures?.energy || "unknown"} (0-1 scale)
- Danceability: ${track.audioFeatures?.danceability || "unknown"}

Provide ${count} DIVERSE recommendations that:
1. Have compatible BPM (within ±10 BPM or double/half time)
2. Have compatible musical keys (same key, or adjacent in circle of fifths)
3. Have similar or complementary energy levels
4. Would create smooth, professional DJ transitions

Respond ONLY with JSON (no markdown):
{
  "recommendations": [
    {
      "artist": "artist name",
      "song": "song name",
      "reason": "why this transition works"
    }
  ]
}`;

    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.9, // Higher temperature for more variety
      max_tokens: 800,
    });

    const responseText = response.choices[0]?.message?.content || "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("Could not parse AI response");
    }

    const aiResponse = JSON.parse(jsonMatch[0]);
    const recommendations: RecommendedTrack[] = [];

    for (const rec of aiResponse.recommendations) {
      try {
        // Try to get real audio features first (ReccoBeats via Spotify ID)
        console.log(`Fetching real features for "${rec.song}" by ${rec.artist}...`);
        const spotifyData = await getSpotifyTrackWithFeatures(rec.song, rec.artist);
        
        let audioFeatures: any;
        let albumImage = "";

        if (spotifyData?.features) {
          console.log(`✓ Got real features (${spotifyData.features.source})`);
          audioFeatures = spotifyData.features;
          albumImage = spotifyData.track?.album?.images?.[0]?.url || "";
        } else {
          console.log(`✗ No real features, will use YouTube estimates`);
          audioFeatures = null;
        }

        // Search on YouTube for playback
        const searchQuery = `${rec.song} ${rec.artist}`;
        const results = await searchYouTubeMusic(searchQuery, 1);
        const song = results?.[0];

        if (!song) {
          console.log(`Could not find "${rec.song}" on YouTube`);
          continue;
        }

        // If we didn't get real features, use YouTube estimates
        if (!audioFeatures) {
          const featuresResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/youtube/video-details?id=${song.videoId}`
          );
          audioFeatures = await featuresResponse.json();
        }

        const recommendedTrack: Track = {
          id: song.videoId,
          name: rec.song,
          artists: [{ name: rec.artist }],
          album: {
            images: [{ url: albumImage || song.thumbnails?.[0]?.url || "" }],
          },
          audioFeatures,
        };

        // Calculate transition compatibility
        const transitionAnalysis = calculateTransitionScore(track, recommendedTrack);

        recommendations.push({
          ...recommendedTrack,
          transitionScore: transitionAnalysis.score,
          transitionReason: rec.reason,
          bpmMatch: transitionAnalysis.bpmMatch,
          keyMatch: transitionAnalysis.keyMatch,
          energyMatch: transitionAnalysis.energyMatch,
        });
      } catch (error) {
        console.error(`Failed to process recommendation for ${rec.song}:`, error);
      }
    }

    // Sort by transition score (highest first)
    recommendations.sort((a, b) => b.transitionScore - a.transitionScore);

    const result = {
      recommendations,
      currentTrack: {
        name: track.name,
        artist: track.artists[0]?.name,
        bpm: track.audioFeatures?.tempo,
        key: track.audioFeatures?.key,
        energy: track.audioFeatures?.energy,
      },
    };

    // Cache the result
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
