import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import YTMusic from "ytmusic-api";
import Groq from "groq-sdk";

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

    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.3-70b-versatile", // Fast and accurate
      temperature: skipCache ? 1.0 : 0.7, // Higher temperature for more variety when skipping cache
      max_tokens: 200,
    });

    const responseText = response.choices[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse AI recommendation");
    }

    const recommendation = JSON.parse(jsonMatch[0]);

    // Search for the recommended track on YouTube Music
    const searchQuery = `${recommendation.song} ${recommendation.artist}`;

    const ytmusic = new YTMusic();
    await ytmusic.initialize();

    const results = await ytmusic.searchSongs(searchQuery);
    const song = results?.[0];

    if (!song) {
      return NextResponse.json(
        { error: "Could not find recommended track on YouTube Music" },
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

