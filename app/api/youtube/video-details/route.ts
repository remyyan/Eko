import { NextResponse } from "next/server";
import { getVideoDetails } from "@/lib/videoDetails";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("id");

  if (!videoId) {
    return NextResponse.json({ error: "Video ID required" }, { status: 400 });
  }

  try {
    const features = await getVideoDetails(videoId);
    return NextResponse.json(features);
  } catch (error) {
    console.error("YouTube video details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch video details" },
      { status: 500 }
    );
  }
}
