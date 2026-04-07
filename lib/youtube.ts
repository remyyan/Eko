import { YTMusic } from "ytmusic-ts";

export interface YouTubeSearchResult {
  videoId: string;
  name: string;
  artist: { name: string };
  thumbnails: { url: string }[];
}

let ytmusicInstance: YTMusic | null = null;

function getYTMusic(): YTMusic {
  if (!ytmusicInstance) {
    ytmusicInstance = new YTMusic();
  }
  return ytmusicInstance;
}

export async function searchYouTubeMusic(
  query: string,
  maxResults = 5
): Promise<YouTubeSearchResult[]> {
  const ytmusic = getYTMusic();
  const results = await ytmusic.search(query, "songs", null, maxResults);

  return (results as any[]).map((song) => ({
    videoId: song.videoId || "",
    name: song.title || "",
    artist: {
      name: song.artists?.[0]?.name || "Unknown Artist",
    },
    thumbnails: (song.thumbnails || []).map((t: any) => ({ url: t.url })),
  }));
}
