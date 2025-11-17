import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { track } = await request.json();
    if (!track) {
      return NextResponse.json(
        { error: "Track is required" },
        { status: 400 }
      );
    }

    // Get AI recommendation using Gemini
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

Respond ONLY with JSON (no markdown):
{"artist": "artist name", "song": "song name", "reason": "brief reason why this transition works"}`;

    const response = await model.generateContent(prompt);
    const responseText = response.response.text();

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse AI recommendation");
    }

    const recommendation = JSON.parse(jsonMatch[0]);

    // Search for the recommended track on Spotify
    const searchQuery = `${recommendation.song} ${recommendation.artist}`;
    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      }
    );

    const searchData = await searchResponse.json();
    const recommendedTrack = searchData.tracks?.items?.[0];

    if (!recommendedTrack) {
      return NextResponse.json(
        { error: "Could not find recommended track on Spotify" },
        { status: 404 }
      );
    }

    // Get audio features for recommended track
    const featuresResponse = await fetch(
      `https://api.spotify.com/v1/audio-features/${recommendedTrack.id}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      }
    );

    const audioFeatures = await featuresResponse.json();

    const trackWithFeatures = {
      id: recommendedTrack.id,
      name: recommendedTrack.name,
      artists: recommendedTrack.artists,
      album: recommendedTrack.album,
      audioFeatures,
    };

    return NextResponse.json({
      recommendedTrack: trackWithFeatures,
      reason: recommendation.reason,
    });
  } catch (error) {
    console.error("Recommendation error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get recommendation",
      },
      { status: 500 }
    );
  }
}

