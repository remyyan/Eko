"use client";

import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import { useState } from "react";
import DJPlayer from "@/components/DJPlayer";

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name?: string; images: { url: string }[] };
  audioFeatures?: any;
}

// ─── Logo mark ───────────────────────────────────────────────────────────────
function EkoLogo({ size = 8 }: { size?: number }) {
  return (
    <div className={`w-${size} h-${size} rounded bg-red-500/20 flex items-center justify-center flex-shrink-0`}>
      <svg className={`w-${Math.round(size / 2)} h-${Math.round(size / 2)} text-red-500`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
      </svg>
    </div>
  );
}

// ─── Shared top nav ───────────────────────────────────────────────────────────
function TopNav({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <div className="border-b border-[#1a1a1a] bg-[#0d0d0d] sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-6 py-3.5 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <EkoLogo size={8} />
          <div>
            <span className="text-base font-bold tracking-tight text-white">EKO</span>
            <span className="ml-2 text-[10px] text-[#444] uppercase tracking-widest hidden sm:inline">AI DJ Assistant</span>
          </div>
        </div>

        {/* Nav links — future sections */}
        <nav className="hidden md:flex items-center gap-6 text-xs text-[#555]">
          <span className="text-white/80 cursor-default">Mix</span>
          <span className="flex items-center gap-1.5 cursor-default opacity-40">
            Blog
            <span className="text-[8px] bg-[#1a1a1a] border border-[#2a2a2a] text-[#444] px-1.5 py-0.5 rounded-full uppercase tracking-wider">Soon</span>
          </span>
          <span className="flex items-center gap-1.5 cursor-default opacity-40">
            Community
            <span className="text-[8px] bg-[#1a1a1a] border border-[#2a2a2a] text-[#444] px-1.5 py-0.5 rounded-full uppercase tracking-wider">Soon</span>
          </span>
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {isSignedIn ? (
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-7 h-7",
                  userButtonPopoverCard: "bg-[#111] border border-[#222]",
                },
              }}
            />
          ) : (
            <SignInButton mode="modal">
              <button className="text-xs px-4 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
                Sign In
              </button>
            </SignInButton>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Guest landing page ───────────────────────────────────────────────────────
function LandingPage() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center text-center px-6 pt-24 pb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/15 text-red-400 text-[10px] uppercase tracking-widest mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          AI-Powered DJ Mixing
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4 max-w-2xl leading-tight">
          {/* Mix smarter with <span className="text-red-500">EKO</span> */}
          insert some catchy line here
        </h1>
        <p className="text-sm text-[#666] max-w-md mb-10 leading-relaxed">
          AI-generated transitions, BPM matching, Camelot key analysis, and smart track recommendations — all in your browser.
        </p>
        <SignInButton mode="modal">
          <button className="px-8 py-3 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-colors shadow-lg shadow-red-500/20">
            Start Mixing
          </button>
        </SignInButton>
      </div>

      {/* Feature cards */}
      <div className="mx-auto w-full max-w-4xl px-6 pb-20 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
            title: "BPM Matching",
            desc: "Automatic tempo alignment with half-time and double-time awareness.",
          },
          {
            icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
            title: "Camelot Key Mixing",
            desc: "Harmonic compatibility scored across the full Camelot Wheel.",
          },
          {
            icon: "M13 10V3L4 14h7v7l9-11h-7z",
            title: "AI Transitions",
            desc: "Groq-powered recommendations scored by BPM, key, and energy.",
          },
        ].map((f) => (
          <div key={f.title} className="p-5 rounded-xl bg-[#0f0f0f] border border-[#1a1a1a] flex flex-col gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
              </svg>
            </div>
            <p className="text-sm font-semibold text-white">{f.title}</p>
            <p className="text-xs text-[#555] leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-[#111] py-4 text-center">
        <span className="text-[10px] text-[#333]">Powered by YouTube Music · AI transitions by Groq</span>
      </div>
    </div>
  );
}

// ─── Signed-in app (search + player) ─────────────────────────────────────────
function DJApp() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(false);

  const searchTracks = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.tracks?.items || []);
    } catch (e) {
      console.error("Search failed:", e);
    }
    setLoading(false);
  };

  const startPlayback = async (track: Track) => {
    setLoading(true);
    try {
      const artist = track.artists?.[0]?.name || "";
      const res = await fetch(
        `/api/audio-features?id=${track.id}&name=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(artist)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const af = await res.json();
      if (!af || af.error || typeof af.tempo !== "number") {
        alert(`Could not load audio features for "${track.name}". Please try another song.`);
        setLoading(false);
        return;
      }
      setCurrentTrack({ ...track, audioFeatures: af });
      setIsPlaying(true);
    } catch (e) {
      alert(`Failed to load track: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    setLoading(false);
  };

  if (isPlaying && currentTrack) {
    return <DJPlayer initialTrack={currentTrack} onStop={() => setIsPlaying(false)} />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-16 px-6 pb-10">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white mb-1">Start a Mix</h2>
          <p className="text-xs text-[#555]">Search for a track to load into the deck</p>
        </div>

        {/* Search bar */}
        <div className="flex bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden focus-within:border-red-500/40 transition-colors mb-6">
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
            className="px-5 py-3.5 bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 disabled:opacity-40 transition-colors border-l border-[#2a2a2a]"
          >
            {loading ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : "Search"}
          </button>
        </div>

        {/* Results */}
        {searchResults.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-[#555] uppercase tracking-wider font-medium">Results</span>
              <span className="text-[10px] text-[#444]">{searchResults.length} tracks</span>
            </div>
            <div className="space-y-1">
              {searchResults.map((track, i) => (
                <button
                  key={track.id}
                  onClick={() => startPlayback(track)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#111] border border-[#1a1a1a] hover:border-[#2a2a2a] hover:bg-[#161616] disabled:opacity-40 transition-all group text-left"
                >
                  <span className="text-[10px] text-[#333] w-5 text-right font-mono flex-shrink-0">{i + 1}</span>
                  {track.album?.images?.[0]?.url ? (
                    <img src={track.album.images[0].url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-[#1a1a1a] flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate group-hover:text-red-400 transition-colors">{track.name}</p>
                    <p className="text-xs text-[#666] truncate">{track.artists.map((a) => a.name).join(", ")}</p>
                  </div>
                  <span className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-red-400 font-medium px-2 py-1 rounded bg-red-500/10">
                    LOAD
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────
export default function Home() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8] flex flex-col">
      <TopNav isSignedIn={!!isSignedIn} />
      {isSignedIn ? <DJApp /> : <LandingPage />}
    </div>
  );
}

