"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import { getPublicMixes, type SavedMix } from "@/lib/saveMix";

function EkoLogo({ size = 8 }: { size?: number }) {
  return (
    <div className={`w-${size} h-${size} rounded bg-red-500/20 flex items-center justify-center flex-shrink-0`}>
      <svg className={`w-${Math.round(size / 2)} h-${Math.round(size / 2)} text-red-500`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
      </svg>
    </div>
  );
}

function MixCard({ mix }: { mix: SavedMix }) {
  return (
    <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl p-5 flex flex-col gap-4 hover:border-[#2a2a2a] transition-colors">
      {/* Album art strip */}
      <div className="flex gap-1.5">
        {mix.tracks.slice(0, 5).map((t, i) => (
          t.albumArt ? (
            <img key={i} src={t.albumArt} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
          ) : (
            <div key={i} className="w-10 h-10 rounded bg-[#1a1a1a] flex-shrink-0" />
          )
        ))}
        {mix.tracks.length > 5 && (
          <div className="w-10 h-10 rounded bg-[#161616] border border-[#222] flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] text-[#555]">+{mix.tracks.length - 5}</span>
          </div>
        )}
      </div>

      {/* Title + meta */}
      <div>
        <p className="text-sm font-semibold text-white mb-1 truncate">{mix.title}</p>
        <p className="text-[10px] text-[#444]">
          {mix.tracks.length} tracks · {mix.transitionType} · {mix.transitionBeats} beats
        </p>
        <p className="text-[10px] text-[#333] mt-0.5">{mix.createdAt.toLocaleDateString()}</p>
      </div>

      {/* Track list */}
      <div className="flex flex-col gap-1">
        {mix.tracks.slice(0, 4).map((t, i) => (
          <div key={t.id} className="flex items-center gap-2 min-w-0">
            <span className="text-[9px] text-[#333] w-3 font-mono flex-shrink-0">{i + 1}</span>
            <span className="text-[10px] text-[#666] truncate">{t.name}</span>
            {t.key && (
              <span className="text-[9px] text-[#444] bg-[#161616] border border-[#1e1e1e] px-1 rounded font-mono flex-shrink-0">{t.key}</span>
            )}
            {t.bpm > 0 && (
              <span className="text-[9px] text-[#444] flex-shrink-0">{Math.round(t.bpm)} bpm</span>
            )}
          </div>
        ))}
        {mix.tracks.length > 4 && (
          <p className="text-[9px] text-[#333] pl-5">+{mix.tracks.length - 4} more tracks</p>
        )}
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [mixes, setMixes] = useState<SavedMix[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPublicMixes()
      .then((m) => { setMixes(m); setLoading(false); })
      .catch((err) => { console.error(err); setError("Could not load community mixes."); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8] flex flex-col">
      {/* Nav */}
      <div className="border-b border-[#1a1a1a] bg-[#0d0d0d] sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <EkoLogo size={8} />
            <span className="text-base font-bold tracking-tight text-white">EKO</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-xs text-[#555]">
            <Link href="/" className="hover:text-white transition-colors">Mix</Link>
            <span className="text-white/80 cursor-default">Community</span>
          </nav>
          <div className="flex items-center gap-3">
            {isLoaded && (isSignedIn ? (
              <UserButton appearance={{ elements: { avatarBox: "w-7 h-7" } }} />
            ) : (
              <SignInButton mode="modal">
                <button className="text-xs px-4 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
                  Sign In
                </button>
              </SignInButton>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-white mb-1">Community Mixes</h1>
          <p className="text-xs text-[#555]">Public mixes shared by the EKO community</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="text-center text-red-400 text-sm py-32">{error}</div>
        )}

        {!loading && !error && mixes.length === 0 && (
          <div className="text-center py-32">
            <p className="text-[#444] text-sm mb-2">No public mixes yet.</p>
            <p className="text-[#333] text-xs">
              Save a mix in the player and hit{" "}
              <span className="text-white">Make Public</span> in My Mixes to share it here.
            </p>
          </div>
        )}

        {!loading && !error && mixes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mixes.map((mix) => (
              <MixCard key={mix.id} mix={mix} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
