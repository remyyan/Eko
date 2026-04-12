"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import { getPublicMixes, type SavedMix } from "@/lib/saveMix";
import DJPlayer from "@/components/DJPlayer";

// Mirror of the Track interface DJPlayer expects
interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  audioFeatures?: any;
}

function savedMixToTracks(mix: SavedMix): Track[] {
  return mix.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    artists: [{ name: t.artist }],
    album: { images: t.albumArt ? [{ url: t.albumArt }] : [] },
    audioFeatures: {
      tempo: t.bpm,
      camelot: t.key,
      energy: t.energy / 100,
      outgoingCueMs: t.outgoingCueMs,
      incomingStartSec: t.incomingStartSec,
    },
  }));
}

// ─── Spectate Player ──────────────────────────────────────────────────────────

const CROSSFADE_SEC = 15;

function SpectatePlayer({ mix, onClose }: { mix: SavedMix; onClose: () => void }) {
  const tracks = mix.tracks;
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  const activePlayerRef = useRef<"A" | "B">("A");
  const currentIdxRef = useRef(0);
  const playerARef = useRef<any>(null);
  const playerBRef = useRef<any>(null);
  const playerAContainerRef = useRef<HTMLDivElement>(null);
  const playerBContainerRef = useRef<HTMLDivElement>(null);
  const posIntervalRef = useRef<any>(null);
  const transitionFiredRef = useRef(false);
  const playersReadyRef = useRef({ A: false, B: false });

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Init YouTube dual players
  useEffect(() => {
    const initPlayers = () => {
      if (!playerAContainerRef.current || !playerBContainerRef.current) return;
      new window.YT.Player(playerAContainerRef.current, {
        height: "0", width: "0",
        videoId: tracks[0].id,
        playerVars: { autoplay: 1, controls: 0 },
        events: {
          onReady: (e: any) => {
            playerARef.current = e.target;
            playersReadyRef.current.A = true;
            startPolling();
          },
          onStateChange: (e: any) => {
            if (activePlayerRef.current === "A" && e.data === window.YT?.PlayerState?.PLAYING) {
              setDuration(e.target.getDuration());
            }
          },
        },
      });
      new window.YT.Player(playerBContainerRef.current, {
        height: "0", width: "0",
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: (e: any) => {
            playerBRef.current = e.target;
            playersReadyRef.current.B = true;
          },
          onStateChange: (e: any) => {
            if (activePlayerRef.current === "B" && e.data === window.YT?.PlayerState?.PLAYING) {
              setDuration(e.target.getDuration());
            }
          },
        },
      });
    };

    const startPolling = () => {
      clearInterval(posIntervalRef.current);
      posIntervalRef.current = setInterval(() => {
        const active = activePlayerRef.current === "A" ? playerARef.current : playerBRef.current;
        if (!active) return;
        try {
          const pos = active.getCurrentTime() as number;
          const dur = active.getDuration() as number;
          setPosition(pos);
          if (dur > 0) setDuration(dur);
          const nextIdx = currentIdxRef.current + 1;
          if (!transitionFiredRef.current && dur > 0 && nextIdx < tracks.length) {
            const savedCueMs = tracks[currentIdxRef.current]?.outgoingCueMs;
            const cuePoint = savedCueMs != null
              ? savedCueMs / 1000  // convert ms → seconds
              : Math.max(dur - CROSSFADE_SEC, dur * 0.78);
            if (pos >= cuePoint) {
              transitionFiredRef.current = true;
              doTransition(nextIdx);
            }
          }
        } catch { /* player not ready */ }
      }, 500);
    };

    const doTransition = async (nextIdx: number) => {
      const outPlayer = activePlayerRef.current === "A" ? playerARef.current : playerBRef.current;
      const inPlayer = activePlayerRef.current === "A" ? playerBRef.current : playerARef.current;
      if (!outPlayer || !inPlayer || !tracks[nextIdx]) return;
      setIsTransitioning(true);
      inPlayer.loadVideoById(tracks[nextIdx].id);
      inPlayer.setVolume(0);
      await new Promise(r => setTimeout(r, 800));
      // Seek incoming track to saved start offset if the mix creator set one
      const incomingStartSec = tracks[nextIdx]?.incomingStartSec;
      if (incomingStartSec && incomingStartSec > 0) {
        inPlayer.seekTo(incomingStartSec, true);
        await new Promise(r => setTimeout(r, 200));
      }
      inPlayer.playVideo();
      const steps = CROSSFADE_SEC * 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        outPlayer.setVolume(Math.round((1 - t) * 100));
        inPlayer.setVolume(Math.round(t * 100));
        setTransitionProgress(t);
        await new Promise(r => setTimeout(r, 100));
      }
      outPlayer.setVolume(0);
      outPlayer.pauseVideo();
      inPlayer.setVolume(100);
      const newActive = activePlayerRef.current === "A" ? "B" : "A";
      activePlayerRef.current = newActive;
      currentIdxRef.current = nextIdx;
      setCurrentIdx(nextIdx);
      transitionFiredRef.current = false;
      setIsTransitioning(false);
      setTransitionProgress(0);
      try { setDuration(inPlayer.getDuration()); } catch { /* ignore */ }
    };

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevReady) prevReady();
      initPlayers();
    };
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    } else if (window.YT.Player) {
      initPlayers();
    }
    return () => {
      clearInterval(posIntervalRef.current);
      try { playerARef.current?.destroy(); } catch { /* ignore */ }
      try { playerBRef.current?.destroy(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTrack = tracks[currentIdx];
  const nextTrack = currentIdx < tracks.length - 1 ? tracks[currentIdx + 1] : null;
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  // where the crossfade fires, as a 0-1 fraction of the bar
  const cueFraction = duration > 0 && nextTrack
    ? (() => {
        const savedCueMs = tracks[currentIdx]?.outgoingCueMs;
        const cuePointSec = savedCueMs != null
          ? savedCueMs / 1000
          : Math.max(duration - CROSSFADE_SEC, duration * 0.78);
        return cuePointSec / duration;
      })()
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={playerAContainerRef} style={{ display: "none" }} />
      <div ref={playerBContainerRef} style={{ display: "none" }} />

      <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#181818] flex-shrink-0">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-semibold text-white truncate">{mix.title}</p>
            {mix.authorName && <p className="text-[10px] text-[#555]">by {mix.authorName}</p>}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-[9px] text-red-400/70 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 tracking-wider uppercase">Spectating</span>
            <button onClick={onClose} className="text-[#444] hover:text-white transition-colors text-lg leading-none">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Now playing */}
          <div className="flex-1 flex flex-col items-center gap-5 p-6">
            <div className={`relative transition-all duration-500 ${isTransitioning ? "opacity-70 scale-95" : "opacity-100 scale-100"}`}>
              {currentTrack.albumArt ? (
                <img src={currentTrack.albumArt} alt="" className="w-44 h-44 rounded-2xl object-cover shadow-2xl" />
              ) : (
                <div className="w-44 h-44 rounded-2xl bg-[#1a1a1a]" />
              )}
              {isTransitioning && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40">
                  <div className="text-[10px] text-white/70 text-center px-2">mixing…</div>
                </div>
              )}
            </div>

            <div className="text-center w-full max-w-xs">
              <p className="text-sm font-semibold text-white truncate">{currentTrack.name}</p>
              <p className="text-xs text-[#555] truncate mt-0.5">{currentTrack.artist}</p>
              <div className="flex gap-2 justify-center mt-2">
                {currentTrack.key && (
                  <span className="text-[9px] text-[#555] bg-[#161616] border border-[#222] px-1.5 py-0.5 rounded font-mono">{currentTrack.key}</span>
                )}
                {currentTrack.bpm > 0 && (
                  <span className="text-[9px] text-[#555] bg-[#161616] border border-[#222] px-1.5 py-0.5 rounded font-mono">{Math.round(currentTrack.bpm)} bpm</span>
                )}
              </div>
            </div>

            {/* Progress */}
            <div className="w-full max-w-xs space-y-2">
              <div
                className="relative h-2 bg-[#1a1a1a] rounded-full cursor-pointer group/bar hover:h-3 transition-all duration-150"
                onClick={(e) => {
                  if (!duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const seekTo = fraction * duration;
                  const active = activePlayerRef.current === "A" ? playerARef.current : playerBRef.current;
                  if (active) {
                    active.seekTo(seekTo, true);
                    setPosition(seekTo);
                    transitionFiredRef.current = false;
                  }
                }}
              >
                <div className="h-full bg-red-500/60 group-hover/bar:bg-red-500/80 rounded-full transition-all duration-100 overflow-hidden" style={{ width: `${progress * 100}%` }} />
                {cueFraction !== null && !isTransitioning && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-orange-400/70 rounded-full pointer-events-none"
                    style={{ left: `calc(${cueFraction * 100}% - 1px)` }}
                    title="Mix transition starts here"
                  />
                )}
              </div>
              {isTransitioning && nextTrack && (
                <div className="space-y-1">
                  <p className="text-[9px] text-[#444] text-center">transitioning → <span className="text-[#666]">{nextTrack.name}</span></p>
                  <div className="h-0.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className="h-full bg-red-500/30 rounded-full transition-all" style={{ width: `${transitionProgress * 100}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Next up */}
            {nextTrack && !isTransitioning && (
              <div className="flex items-center gap-2 w-full max-w-xs bg-[#111] border border-[#1a1a1a] rounded-lg px-3 py-2">
                {nextTrack.albumArt && <img src={nextTrack.albumArt} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />}
                <span className="text-[9px] text-[#444] flex-shrink-0">Next:</span>
                <span className="text-[10px] text-[#666] truncate">{nextTrack.name}</span>
              </div>
            )}
          </div>

          {/* Queue sidebar */}
          <div className="w-48 border-l border-[#181818] flex flex-col flex-shrink-0">
            <p className="text-[9px] text-[#333] px-3 pt-3 pb-2 uppercase tracking-wider flex-shrink-0">Queue</p>
            <div className="flex-1 overflow-y-auto">
              {tracks.map((t, i) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 px-3 py-2 ${i === currentIdx ? "bg-[#161616]" : ""}`}
                >
                  <span className={`text-[9px] w-3 font-mono flex-shrink-0 ${i === currentIdx ? "text-red-400" : "text-[#333]"}`}>{i + 1}</span>
                  {t.albumArt && <img src={t.albumArt} alt="" className="w-5 h-5 rounded flex-shrink-0 object-cover" />}
                  <span className={`text-[10px] truncate ${i === currentIdx ? "text-white" : i < currentIdx ? "text-[#2a2a2a] line-through" : "text-[#555]"}`}>
                    {t.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EkoLogo({ size = 8 }: { size?: number }) {
  return (
    <div className={`w-${size} h-${size} rounded bg-red-500/20 flex items-center justify-center flex-shrink-0`}>
      <svg className={`w-${Math.round(size / 2)} h-${Math.round(size / 2)} text-red-500`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
      </svg>
    </div>
  );
}

function MixCard({ mix, onSpectate, onFullPlayer }: { mix: SavedMix; onSpectate: () => void; onFullPlayer: () => void }) {
  return (
    <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl p-5 flex flex-col gap-4 hover:border-[#2a2a2a] hover:bg-[#111] transition-all group">
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

      {/* Title + author + meta */}
      <div>
        <p className="text-sm font-semibold text-white truncate mb-0.5">{mix.title}</p>
        {mix.authorName && (
          <p className="text-[10px] text-[#555] mb-1">by {mix.authorName}</p>
        )}
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

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSpectate}
          className="flex-1 text-[10px] py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          ▶ Spectate
        </button>
        <button
          onClick={onFullPlayer}
          className="flex-1 text-[10px] py-1.5 rounded-lg bg-[#161616] border border-[#222] text-[#666] hover:text-white hover:border-[#333] transition-colors"
        >
          ⚡ Full Mix
        </button>
      </div>
    </div>
  );
}



export default function CommunityPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [mixes, setMixes] = useState<SavedMix[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullPlayerMix, setFullPlayerMix] = useState<SavedMix | null>(null);
  const [spectateMix, setSpectateMix] = useState<SavedMix | null>(null);

  useEffect(() => {
    getPublicMixes()
      .then((m) => { setMixes(m); setLoading(false); })
      .catch((err) => { console.error(err); setError("Could not load community mixes."); setLoading(false); });
  }, []);

  // Full-screen DJPlayer overlay
  if (fullPlayerMix) {
    const tracks = savedMixToTracks(fullPlayerMix);
    return (
      <div className="fixed inset-0 z-50">
        <DJPlayer
          initialTrack={tracks[0]}
          initialQueue={tracks}
          onStop={() => setFullPlayerMix(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8] flex flex-col">
      {/* Spectate popup overlay (rendered on top of community page) */}
      {spectateMix && <SpectatePlayer mix={spectateMix} onClose={() => setSpectateMix(null)} />}
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
          <h1 className="text-2xl font-bold text-white mb-1">Community Mixes BETA</h1>
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
              <MixCard key={mix.id} mix={mix} onSpectate={() => setSpectateMix(mix)} onFullPlayer={() => setFullPlayerMix(mix)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
