import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { checkRateLimit } from "@/lib/rate-limiter";

export async function POST(request: Request) {
  try {
    const { track } = await request.json();
    if (!track) {
      return NextResponse.json(
        { error: "Track is required" },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = `recommend-${track.id}`;
    const cached = getCached(cacheKey);
    if (cached) {
      console.log("Returning cached recommendation");
      return NextResponse.json(cached);
    }

    // Check rate limit before calling Gemini
    const rateLimit = checkRateLimit("gemini-recommend");
    if (!rateLimit.allowed) {
      console.log(`Rate limit exceeded. Retry after ${rateLimit.retryAfter}s`);
      return NextResponse.json(
        { error: `Rate limit exceeded. Please wait ${rateLimit.retryAfter} seconds.` },
        { status: 429 }
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

    // Search for the recommended track on YouTube
    const searchQuery = `${recommendation.song} ${recommendation.artist} official audio`;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    if (!youtubeApiKey) {
      throw new Error("YouTube API key not configured");
    }

    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&type=video&videoCategoryId=10&videoDuration=medium&maxResults=5&q=${encodeURIComponent(searchQuery)}&key=${youtubeApiKey}`
    );

    if (!searchResponse.ok) {
      throw new Error("YouTube search failed");
    }

    const searchData = await searchResponse.json();

    // Filter and score results to get the best music match
    const filteredVideos = searchData.items?.filter((item: any) => {
      const title = item.snippet.title.toLowerCase();

      // Exclude non-music content
      if (title.includes('#shorts') ||
          title.includes('live stream') ||
          title.includes('podcast') ||
          title.includes('interview') ||
          title.includes('reaction') ||
          title.includes('tutorial') ||
          title.includes('cover') && title.includes('tutorial')) {
        return false;
      }

      return true;
    }) || [];

    // Score results
    const scoredVideos = filteredVideos.map((item: any) => {
      const title = item.snippet.title.toLowerCase();
      const channelTitle = item.snippet.channelTitle.toLowerCase();
      let score = 0;

      if (title.includes('official')) score += 10;
      if (title.includes('audio')) score += 8;
      if (channelTitle.includes('vevo')) score += 15;
      if (channelTitle.includes('official')) score += 10;
      if (channelTitle.includes('records')) score += 8;

      return { item, score };
    });

    // Get the best match
    const video = scoredVideos.sort((a: any, b: any) => b.score - a.score)[0]?.item;

    if (!video) {
      return NextResponse.json(
        { error: "Could not find recommended track on YouTube" },
        { status: 404 }
      );
    }

    // Get audio features for recommended track
    const featuresResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/youtube/video-details?id=${video.id.videoId}`
    );

    const audioFeatures = await featuresResponse.json();

    const trackWithFeatures = {
      id: video.id.videoId,
      name: video.snippet.title,
      artists: [{ name: video.snippet.channelTitle }],
      album: {
        images: [
          { url: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default.url }
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
      {
        error: error instanceof Error ? error.message : "Failed to get recommendation",
      },
      { status: 500 }
    );
  }
}

