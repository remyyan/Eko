import { NextResponse } from "next/server";
import { searchYouTubeMusic } from "@/lib/youtube";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  try {
    const results = await searchYouTubeMusic(query, 20);

    const tracks = results.map((song) => ({
      id: song.videoId,
      name: song.name,
      artists: [{ name: song.artist.name }],
      album: {
        images: song.thumbnails.length > 0
          ? [{ url: song.thumbnails[song.thumbnails.length - 1].url }]
          : [{ url: "" }],
      },
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

