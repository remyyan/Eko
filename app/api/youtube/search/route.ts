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
        `part=snippet&type=video&videoCategoryId=10&videoDuration=medium&maxResults=25&q=${encodeURIComponent(
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

    // Filter out shorts, non-music content, and low-quality results
    const filteredItems = data.items.filter((item: any) => {
      const title = item.snippet.title.toLowerCase();
      const channelTitle = item.snippet.channelTitle.toLowerCase();
      const description = item.snippet.description?.toLowerCase() || '';

      // Exclude shorts and vertical videos
      if (title.includes('#shorts') ||
          title.includes('#short') ||
          (title.includes('short') && title.length < 30)) {
        return false;
      }

      // Exclude live streams and premieres
      if (title.includes('live stream') ||
          title.includes('livestream') ||
          title.includes('premiere') ||
          description.includes('live stream')) {
        return false;
      }

      // Exclude non-music content
      if (title.includes('podcast') ||
          title.includes('interview') ||
          title.includes('reaction') ||
          title.includes('review') ||
          title.includes('tutorial') ||
          title.includes('how to') ||
          title.includes('cover') && title.includes('tutorial') ||
          title.includes('lesson') ||
          title.includes('behind the scenes') ||
          title.includes('making of') ||
          title.includes('documentary')) {
        return false;
      }

      // Exclude gaming and meme content
      if (title.includes('gameplay') ||
          title.includes('gaming') ||
          title.includes('meme') ||
          title.includes('compilation') && !title.includes('album')) {
        return false;
      }

      // Prefer official channels and verified content
      const hasOfficialIndicators =
        title.includes('official') ||
        title.includes('audio') ||
        title.includes('music video') ||
        channelTitle.includes('vevo') ||
        channelTitle.includes('official') ||
        channelTitle.includes('records') ||
        channelTitle.includes('music');

      // Exclude channels that are clearly not music-focused
      const isSuspiciousChannel =
        channelTitle.includes('gaming') ||
        channelTitle.includes('vlog') ||
        channelTitle.includes('podcast');

      if (isSuspiciousChannel) {
        return false;
      }

      return true;
    });

    // Score and sort results by music quality
    const scoredItems = filteredItems.map((item: any) => {
      const title = item.snippet.title.toLowerCase();
      const channelTitle = item.snippet.channelTitle.toLowerCase();
      let score = 0;

      // Boost official content
      if (title.includes('official')) score += 10;
      if (title.includes('audio')) score += 8;
      if (title.includes('music video')) score += 7;

      // Boost verified music channels
      if (channelTitle.includes('vevo')) score += 15;
      if (channelTitle.includes('official')) score += 10;
      if (channelTitle.includes('records')) score += 8;
      if (channelTitle.includes('music')) score += 5;

      // Penalize low-quality indicators
      if (title.includes('lyric')) score -= 3;
      if (title.includes('cover') && !channelTitle.includes('official')) score -= 5;
      if (title.includes('remix') && !title.includes('official')) score -= 2;
      if (title.includes('edit')) score -= 3;
      if (title.includes('fan made')) score -= 10;

      return { item, score };
    });

    // Sort by score (highest first) and take top 20
    const sortedItems = scoredItems
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ item }) => item);

    // Transform YouTube results to match our Track interface
    const tracks = sortedItems.map((item: any) => ({
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

