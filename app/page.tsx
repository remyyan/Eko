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
      const response = await fetch(
        `/api/youtube/video-details?id=${track.id}`
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
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div>Loading...</div>
      </div>
    );
  }

  // No authentication needed for YouTube
  // if (!session) {
  //   return (
  //     <div className="flex min-h-screen items-center justify-center bg-black text-white">
  //       <div className="text-center">
  //         <h1 className="mb-4 text-4xl font-bold">
  //           DJ Mix Assistant
  //         </h1>
  //         <p className="mb-8 text-gray-400">
  //           AI-powered tool to find perfect song combinations
  //         </p>
  //         <button
  //           onClick={() => signIn("spotify")}
  //           className="bg-white text-black px-8 py-3 font-semibold hover:bg-gray-200"
  //         >
  //           Connect with Spotify
  //         </button>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="min-h-screen bg-black text-white">
      {isPlaying && currentTrack ? (
        <DJPlayer initialTrack={currentTrack} onStop={() => setIsPlaying(false)} />
      ) : (
        <div className="p-8">
          <div className="mx-auto max-w-7xl">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">
                  DJ Mix Assistant
                </h1>
                {session && (
                  <button
                    onClick={() => signOut()}
                    className="bg-gray-800 px-4 py-2 hover:bg-gray-700"
                  >
                    Sign Out
                  </button>
                )}
              </div>
            </div>

            {/* Search Section */}
            <div className="mb-8">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchTracks()}
                  placeholder="Search for a track to start mixing..."
                  className="flex-1 border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
                />
                <button
                  onClick={searchTracks}
                  disabled={loading}
                  className="bg-white text-black px-6 py-3 font-semibold hover:bg-gray-200 disabled:opacity-50"
                >
                  {loading ? "Searching..." : "Search"}
                </button>
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div>
                <h2 className="mb-4 text-xl font-bold">
                  Search Results
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {searchResults.map((track) => (
                    <div key={track.id}>
                      <button
                        onClick={() => startPlayback(track)}
                        disabled={loading}
                        className="mb-2 w-full bg-white text-black px-4 py-2 font-semibold hover:bg-gray-200 disabled:opacity-50"
                      >
                        {loading ? "Loading..." : "Start Mix"}
                      </button>
                      <TrackCard
                        track={track}
                        onSelect={() => {}}
                        isSelected={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
