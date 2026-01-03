import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube API key not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&type=video&videoCategoryId=10&videoDuration=medium&maxResults=20&q=${encodeURIComponent(
          query + " official audio music"
        )}&key=${apiKey}`
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("YouTube API error:", error);
      return NextResponse.json(
        { error: "YouTube API request failed" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Filter out shorts and non-music content
    const filteredItems = data.items.filter((item: any) => {
      const title = item.snippet.title.toLowerCase();
      const channelTitle = item.snippet.channelTitle.toLowerCase();

      // Exclude shorts, live streams, and non-music content
      if (title.includes('#shorts') ||
          title.includes('short') && title.length < 30 ||
          title.includes('live stream') ||
          title.includes('podcast') ||
          title.includes('interview') ||
          title.includes('reaction')) {
        return false;
      }

      return true;
    });

    // Transform YouTube results to match our Track interface
    const tracks = filteredItems.map((item: any) => ({
      id: item.id.videoId,
      name: item.snippet.title,
      artists: [{ name: item.snippet.channelTitle }],
      album: {
        images: [
          { url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url }
        ],
      },
      // We'll fetch audio features separately when needed
      audioFeatures: null,
    }));

    return NextResponse.json({ tracks: { items: tracks } });
  } catch (error) {
    console.error("YouTube search error:", error);
    return NextResponse.json(
      { error: "Failed to search YouTube" },
      { status: 500 }
    );
  }
}

