import { NextResponse } from "next/server";
import YTMusic from "ytmusic-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  try {
    // Initialize YouTube Music API
    const ytmusic = new YTMusic();
    await ytmusic.initialize();

    // Search for songs on YouTube Music
    const results = await ytmusic.searchSongs(query);

    // Transform YouTube Music results to match our Track interface
    const tracks = results.map((song: any) => ({
      id: song.videoId,
      name: song.name,
      artists: song.artist ? [{ name: song.artist.name }] : [{ name: "Unknown Artist" }],
      album: {
        images: [
          { url: song.thumbnails?.[0]?.url || "" }
        ],
      },
      // We'll fetch audio features separately when needed
      audioFeatures: null,
    }));

    return NextResponse.json({ tracks: { items: tracks } });
  } catch (error) {
    console.error("YouTube Music search error:", error);
    return NextResponse.json(
      { error: "Failed to search YouTube Music" },
      { status: 500 }
    );
  }
}

