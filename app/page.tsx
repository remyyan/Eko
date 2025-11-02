"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import TrackCard from "@/components/TrackCard";
import MashupCreator from "@/components/MashupCreator";

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
  const [selectedTrack1, setSelectedTrack1] = useState<Track | null>(null);
  const [selectedTrack2, setSelectedTrack2] = useState<Track | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const searchTracks = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/spotify/search?q=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();
      setSearchResults(data.tracks?.items || []);
    } catch (error) {
      console.error("Search failed:", error);
    }
    setLoading(false);
  };

  const selectTrack = async (track: Track, slot: 1 | 2) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/spotify/audio-features?id=${track.id}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const audioFeatures = await response.json();

      console.log(`Audio features response for "${track.name}":`, audioFeatures);

      // Check if Spotify returned null (track has no audio features)
      if (audioFeatures === null) {
        alert(`Audio features not available for "${track.name}". This track may not have analysis data. Please try another song.`);
        setLoading(false);
        return;
      }

      // Validate that we have the required fields
      if (!audioFeatures || audioFeatures.error || typeof audioFeatures.tempo !== 'number') {
        console.error("Invalid audio features:", audioFeatures);
        alert(`Could not load audio features for "${track.name}". Please try another song.`);
        setLoading(false);
        return;
      }

      const trackWithFeatures = { ...track, audioFeatures };
      if (slot === 1) {
        setSelectedTrack1(trackWithFeatures);
      } else {
        setSelectedTrack2(trackWithFeatures);
      }
    } catch (error) {
      console.error("Failed to fetch audio features:", error);
      alert(`Failed to load track data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const analyzeMashup = async () => {
    if (!selectedTrack1 || !selectedTrack2) return;

    try {
      const response = await fetch("/api/mashup/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track1: selectedTrack1,
          track2: selectedTrack2,
        }),
      });
      const data = await response.json();

      // Only set analysis if the response is successful
      if (response.ok && data.details) {
        setAnalysis(data);
      } else {
        console.error("Analysis error:", data.error || "Unknown error");
        setAnalysis(null);
      }
    } catch (error) {
      console.error("Analysis failed:", error);
      setAnalysis(null);
    }
  };

  useEffect(() => {
    if (selectedTrack1 && selectedTrack2) {
      analyzeMashup();
    } else {
      setAnalysis(null);
    }
  }, [selectedTrack1, selectedTrack2]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
        <div className="text-center">
          <h1 className="mb-4 text-6xl font-bold text-white">
            🎧 DJ Mashup Assistant
          </h1>
          <p className="mb-8 text-xl text-gray-300">
            AI-powered tool to find perfect song combinations
          </p>
          <button
            onClick={() => signIn("spotify")}
            className="rounded-full bg-green-500 px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-green-600 hover:scale-105"
          >
            Connect with Spotify
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-bold text-white">
              🎧 DJ Mashup Assistant
            </h1>
            <button
              onClick={() => signOut()}
              className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600"
            >
              Sign Out
            </button>
          </div>
          <p className="mt-2 text-sm text-yellow-300">
            ℹ️ Using estimated audio features (Spotify restricted API access for development apps as of Nov 2024)
          </p>
        </div>

        {/* Search */}
        <div className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchTracks()}
              placeholder="Search for tracks..."
              className="flex-1 rounded-lg border-2 border-purple-500 bg-gray-900 px-4 py-3 text-white placeholder-gray-400 focus:border-purple-400 focus:outline-none"
            />
            <button
              onClick={searchTracks}
              disabled={loading}
              className="rounded-lg bg-purple-500 px-6 py-3 font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* Selected Tracks */}
        {(selectedTrack1 || selectedTrack2) && (
          <div className="mb-8 rounded-lg bg-gray-900/50 p-6">
            <h2 className="mb-4 text-2xl font-bold text-white">
              Selected Tracks
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-purple-400">
                  TRACK 1
                </h3>
                {selectedTrack1 ? (
                  <TrackCard
                    track={selectedTrack1}
                    onSelect={() => setSelectedTrack1(null)}
                    isSelected={true}
                    showFeatures={true}
                  />
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-gray-600 p-8 text-center text-gray-400">
                    Select first track
                  </div>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-blue-400">
                  TRACK 2
                </h3>
                {selectedTrack2 ? (
                  <TrackCard
                    track={selectedTrack2}
                    onSelect={() => setSelectedTrack2(null)}
                    isSelected={true}
                    showFeatures={true}
                  />
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-gray-600 p-8 text-center text-gray-400">
                    Select second track
                  </div>
                )}
              </div>
            </div>

            {/* Analysis Results */}
            {analysis && (
              <div className="mt-6 rounded-lg bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-white">
                    Mashup Analysis
                  </h3>
                  <div className="text-right">
                    <div className="text-sm text-gray-400">
                      Compatibility Score
                    </div>
                    <div
                      className={`text-4xl font-bold ${
                        analysis.compatibilityScore >= 80
                          ? "text-green-400"
                          : analysis.compatibilityScore >= 60
                          ? "text-yellow-400"
                          : "text-red-400"
                      }`}
                    >
                      {analysis.compatibilityScore}%
                    </div>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
                  <div className="rounded-lg bg-black/30 p-3">
                    <div className="text-gray-400">BPM Difference</div>
                    <div className="text-xl font-semibold text-white">
                      {Math.round(analysis.details.bpmDiff)} BPM
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/30 p-3">
                    <div className="text-gray-400">Track 1 Key</div>
                    <div className="text-xl font-semibold text-white">
                      {analysis.details.track1Key}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/30 p-3">
                    <div className="text-gray-400">Track 2 Key</div>
                    <div className="text-xl font-semibold text-white">
                      {analysis.details.track2Key}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-black/30 p-4">
                  <h4 className="mb-2 font-semibold text-purple-400">
                    AI Recommendation
                  </h4>
                  <p className="text-gray-300">{analysis.aiAnalysis}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div>
            <h2 className="mb-4 text-2xl font-bold text-white">
              Search Results
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {searchResults.map((track) => (
                <div key={track.id}>
                  <div className="mb-2 flex gap-2">
                    <button
                      onClick={() => selectTrack(track, 1)}
                      className="flex-1 rounded bg-purple-500 px-2 py-1 text-xs text-white hover:bg-purple-600"
                    >
                      Track 1
                    </button>
                    <button
                      onClick={() => selectTrack(track, 2)}
                      className="flex-1 rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
                    >
                      Track 2
                    </button>
                  </div>
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
  );
}
