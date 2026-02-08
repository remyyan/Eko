import { NextResponse } from "next/server";
import { getSpotifyTrackWithFeatures } from "@/lib/spotify";

/**
 * Get audio features - ReccoBeats only, no Spotify fallback
 *
 * Priority chain:
 * 1. ReccoBeats (using Spotify ID as resource identifier)
 * 2. YouTube estimates (only if ReccoBeats doesn't have it)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("id");
  const trackName = searchParams.get("name");
  const artistName = searchParams.get("artist");

  if (!videoId) {
    return NextResponse.json({ error: "Video ID required" }, { status: 400 });
  }

  try {
    // Try ReccoBeats (using Spotify ID as resource identifier)
    if (trackName && artistName) {
      console.log(`Fetching ReccoBeats features for "${trackName}" by ${artistName}`);
      
      const data = await getSpotifyTrackWithFeatures(trackName, artistName);
      
      if (data?.features) {
        console.log(`✓ Got ReccoBeats audio features`);
        return NextResponse.json(data.features);
      }
      
      console.log(`✗ ReccoBeats doesn't have this track, using YouTube estimates`);
    }

    // Fallback: YouTube estimates only
    const youtubeResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/youtube/video-details?id=${videoId}`
    );

    if (!youtubeResponse.ok) {
      throw new Error("YouTube video details failed");
    }

    const features = await youtubeResponse.json();
    
    return NextResponse.json({
      ...features,
      source: "youtube_estimate",
    });
  } catch (error) {
    console.error("Audio features error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audio features" },
      { status: 500 }
    );
  }
}
