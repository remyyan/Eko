import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import Groq from "groq-sdk";
import { searchYouTubeMusic } from "@/lib/youtube";

export async function POST(request: Request) {
  try {
    const { track, skipCache, excludedSongs = [] } = await request.json();
    if (!track) {
      return NextResponse.json(
        { error: "Track is required" },
        { status: 400 }
      );
    }

    // Check cache first (unless skipCache is true)
    const cacheKey = `recommend-${track.id}`;
    if (!skipCache) {
      const cached = getCached(cacheKey);
      if (cached) {
        console.log("Returning cached recommendation");
        return NextResponse.json(cached);
      }
    } else {
      console.log("Skipping cache, fetching new recommendation");
    }

    // Get AI recommendation using Groq (much higher free tier limits!)
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    // Build excluded songs list for prompt
    const excludedList = excludedSongs.length > 0
      ? `\n\nDO NOT recommend any of these songs (already suggested):\n${excludedSongs.map((s: any) => `- "${s.name}" by ${s.artist}`).join('\n')}`
      : '';

    const prompt = `You are a professional DJ. A DJ is about to mix "${track.name}" by ${track.artists[0]?.name}.

Track Details:
- BPM: ${track.audioFeatures?.tempo || "unknown"}
- Key: ${track.audioFeatures?.key || "unknown"}
- Energy: ${track.audioFeatures?.energy || "unknown"}
- Danceability: ${track.audioFeatures?.danceability || "unknown"}

Recommend a SPECIFIC song that would transition well into this track. Consider:
1. Similar or complementary BPM (±5-10 BPM is ideal)
2. Compatible musical key
3. Similar energy level or a good build-up
4. Same or similar genre
${excludedList}

${skipCache ? "IMPORTANT: Provide a DIFFERENT recommendation than you might have given before. Be creative and suggest an alternative track that also works well." : ""}

Respond ONLY with JSON (no markdown):
{"artist": "artist name", "song": "song name", "reason": "brief reason why this transition works"}`;

    // Try up to 5 times to get a unique recommendation
    let attempts = 0;
    let song: any = null;
    let recommendation: any = null;

    while (attempts < 5 && !song) {
      attempts++;
      console.log(`Recommendation attempt ${attempts}`);

      const response = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: prompt + (attempts > 1 ? `\n\nAttempt ${attempts}: Please suggest something COMPLETELY DIFFERENT from your previous suggestions.` : ''),
          },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: skipCache ? Math.min(1.2, 0.7 + (attempts * 0.2)) : 0.7, // Increase temperature with each attempt
        max_tokens: 200,
        seed: skipCache ? Math.floor(Math.random() * 1000000) : undefined, // Random seed for variety
      });

      const responseText = response.choices[0]?.message?.content || "";

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("Could not parse AI recommendation");
        continue;
      }

      recommendation = JSON.parse(jsonMatch[0]);

      // Check if this song is in the excluded list
      const isExcluded = excludedSongs.some((excluded: any) =>
        excluded.name.toLowerCase() === recommendation.song.toLowerCase() &&
        excluded.artist.toLowerCase() === recommendation.artist.toLowerCase()
      );

      if (isExcluded) {
        console.log(`Song "${recommendation.song}" by ${recommendation.artist} is excluded, trying again...`);
        continue;
      }

      // Search for the recommended track on YouTube
      const searchQuery = `${recommendation.song} ${recommendation.artist}`;
      const results = await searchYouTubeMusic(searchQuery, 1);
      song = results?.[0];

      if (!song) {
        console.log(`Could not find "${recommendation.song}" on YouTube, trying again...`);
        continue;
      }

      // Check if the found song is in the excluded list (by video ID)
      const foundSongExcluded = excludedSongs.some((excluded: any) =>
        excluded.id === song.videoId
      );

      if (foundSongExcluded) {
        console.log(`Found song is excluded (by ID), trying again...`);
        song = null;
        continue;
      }

      // Success!
      break;
    }

    if (!song || !recommendation) {
      return NextResponse.json(
        { error: "Could not find a unique recommendation after multiple attempts" },
        { status: 404 }
      );
    }

    // Get audio features for recommended track
    const featuresResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/youtube/video-details?id=${song.videoId}`
    );

    const audioFeatures = await featuresResponse.json();

    const trackWithFeatures = {
      id: song.videoId,
      name: song.name,
      artists: song.artist ? [{ name: song.artist.name }] : [{ name: "Unknown Artist" }],
      album: {
        images: [
          { url: song.thumbnails?.[0]?.url || "" }
        ],
      },
      audioFeatures,
    };

    const result = {
      recommendedTrack: trackWithFeatures,
      reason: recommendation.reason,
    };

    // Cache the result
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

