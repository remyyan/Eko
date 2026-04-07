import { YTMusic, type SearchResult } from "ytmusic-ts";

export type { SearchResult };

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

/**
 * Search YouTube Music for songs. Uses the YouTube Music internal API
 * which returns proper song results (no lyric videos, fan edits, etc.).
 */
export async function searchYouTubeMusic(
  query: string,
  maxResults = 5
): Promise<YouTubeSearchResult[]> {
  const ytmusic = getYTMusic();
  const results = await ytmusic.search(query, "songs", null, maxResults);

  return results.map((song: SearchResult) => ({
    videoId: song.videoId || "",
    name: song.title || "",
    artist: {
      name: song.artists?.[0]?.name || "Unknown Artist",
    },
    thumbnails: (song.thumbnails || []).map((t) => ({ url: t.url })),
  }));
}
