"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import TrackCard from "@/components/TrackCard";
import DJPlayer from "@/components/DJPlayer";

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
  audioFeatures?: any;
}

export default function Home() {
  const { data: session, status } = useSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(false);

  const searchTracks = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();
      setSearchResults(data.tracks?.items || []);
    } catch (error) {
      console.error("Search failed:", error);
    }
    setLoading(false);
  };

  const startPlayback = async (track: Track) => {
    setLoading(true);
    try {
      const artistName = track.artists?.[0]?.name || "";
      const response = await fetch(
        `/api/audio-features?id=${track.id}&name=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(artistName)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const audioFeatures = await response.json();

      if (audioFeatures === null || !audioFeatures || audioFeatures.error || typeof audioFeatures.tempo !== 'number') {
        alert(`Could not load audio features for "${track.name}". Please try another song.`);
        setLoading(false);
        return;
      }

      if (audioFeatures.source === 'spotify') {
        console.log(`✓ Using real Spotify audio features for "${track.name}"`);
      } else {
        console.log(`⚠ Using estimated audio features for "${track.name}"`);
      }

      const trackWithFeatures = { ...track, audioFeatures };
      setCurrentTrack(trackWithFeatures);
      setIsPlaying(true);
    } catch (error) {
      console.error("Failed to start playback:", error);
      alert(`Failed to load track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#888]">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8]">
      {isPlaying && currentTrack ? (
        <DJPlayer initialTrack={currentTrack} onStop={() => setIsPlaying(false)} />
      ) : (
        <div className="flex flex-col min-h-screen">
          {/* Header bar */}
          <div className="border-b border-[#222] bg-[#0d0d0d]">
            <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                  </svg>
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight text-white">EKO</h1>
                  <p className="text-[10px] text-[#555] uppercase tracking-widest">AI DJ Assistant</p>
                </div>
              </div>
              {session && (
                <button
                  onClick={() => signOut()}
                  className="text-xs text-[#555] hover:text-[#888] transition-colors"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col items-center justify-start pt-20 px-6">
            <div className="w-full max-w-2xl">
              {/* Title area */}
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold tracking-tight text-white mb-2">
                  Start a Mix
                </h2>
                <p className="text-sm text-[#555]">
                  Search for a track to load into the deck
                </p>
              </div>

              {/* Search bar */}
              <div className="relative mb-8">
                <div className="flex bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden focus-within:border-red-500/50 transition-colors">
                  <div className="flex items-center pl-4 pr-2">
                    <svg className="w-4 h-4 text-[#555]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchTracks()}
                    placeholder="Track name, artist, or genre..."
                    className="flex-1 bg-transparent px-2 py-3.5 text-sm text-white placeholder-[#444] focus:outline-none"
                  />
                  <button
                    onClick={searchTracks}
                    disabled={loading}
                    className="px-5 py-3.5 bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border-l border-[#2a2a2a]"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Search"
                    )}
                  </button>
                </div>
              </div>

              {/* Results */}
              {searchResults.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-medium text-[#555] uppercase tracking-wider">
                      Results
                    </h3>
                    <span className="text-[10px] text-[#444]">
                      {searchResults.length} tracks
                    </span>
                  </div>

                  <div className="space-y-1">
                    {searchResults.map((track, index) => (
                      <button
                        key={track.id}
                        onClick={() => startPlayback(track)}
                        disabled={loading}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#111] border border-[#1a1a1a] hover:border-[#2a2a2a] hover:bg-[#161616] disabled:opacity-40 disabled:cursor-not-allowed transition-all group text-left"
                      >
                        <span className="text-[10px] text-[#333] w-5 text-right font-mono flex-shrink-0">
                          {index + 1}
                        </span>
                        {track.album?.images?.[0]?.url ? (
                          <img
                            src={track.album.images[0].url}
                            alt=""
                            className="w-10 h-10 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-[#1a1a1a] flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate group-hover:text-red-400 transition-colors">
                            {track.name}
                          </p>
                          <p className="text-xs text-[#666] truncate">
                            {track.artists.map((a) => a.name).join(", ")}
                          </p>
                        </div>
                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-red-400 font-medium px-2 py-1 rounded bg-red-500/10">
                            LOAD
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-[#161616] py-3 text-center">
            <span className="text-[10px] text-[#333]">
              Powered by YouTube Music · AI transitions by Groq
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
