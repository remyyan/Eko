import { NextResponse } from "next/server";
import { getSongStructure } from "@/lib/songStructure";
import { getCached, setCache } from "@/lib/cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const track = searchParams.get("track");
  const artist = searchParams.get("artist");
  const durationMs = Number(searchParams.get("duration") || 0);

  if (!track || !artist) {
    return NextResponse.json({ error: "track and artist required" }, { status: 400 });
  }

  const cacheKey = `structure-${track}-${artist}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const result = await getSongStructure(track, artist, durationMs);

  const response = {
    sections: result.sections.map((s) => ({
      ...s,
      color: result.colorForType(s.type),
    })),
    source: result.source,
  };

  setCache(cacheKey, response);
  return NextResponse.json(response);
}
