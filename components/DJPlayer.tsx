"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import {
  crossfadeSchedule,
  beatMatchSchedule,
  echoFadeSchedule,
  filterSweepSchedule,
  type TransitionSchedule,
} from "@/lib/transitionEngine";
import TransitionWaveform from "@/components/TransitionWaveform";
import CuePointBar, { generateCuePoints, type CuePoint } from "@/components/CuePointBar";

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  audioFeatures?: any;
}

interface RecommendedTrack extends Track {
  transitionScore: number;
  transitionReason: string;
  bpmMatch: number;
  keyMatch: number;
  energyMatch: number;
}

interface DJPlayerProps {
  initialTrack: Track;
  onStop: () => void;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export default function DJPlayer({ initialTrack, onStop }: DJPlayerProps) {
  const [queue, setQueue] = useState<Track[]>([initialTrack]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Dual players for crossfading
  const [playerA, setPlayerA] = useState<any>(null);
  const [playerB, setPlayerB] = useState<any>(null);
  const [activePlayer, setActivePlayer] = useState<'A' | 'B'>('A');
  const [playersReady, setPlayersReady] = useState({ A: false, B: false });

  const [autoNextTrack, setAutoNextTrack] = useState<Track | null>(null);
  const [autoNextReason, setAutoNextReason] = useState<string>("");
  const [recommendedTracks, setRecommendedTracks] = useState<RecommendedTrack[]>([]);

  // nextTrack is derived: queued track takes priority, then AI recommendation
  const hasQueuedNext = currentIndex < queue.length - 1;
  const nextTrack = hasQueuedNext ? queue[currentIndex + 1] : autoNextTrack;
  const nextReason = hasQueuedNext ? "Next in queue" : autoNextReason;

  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [activeTransitionType, setActiveTransitionType] = useState<string>("Crossfade");
  const [transitionRecommendations, setTransitionRecommendations] = useState<any[]>([]);
  const [selectedTransition, setSelectedTransition] = useState<any | null>(null);
  const [excludedRecommendations, setExcludedRecommendations] = useState<any[]>([]);
  const [selectedCuePoint, setSelectedCuePoint] = useState<CuePoint | null>(null);
  const [incomingStartSec, setIncomingStartSec] = useState(0);
  const [incomingSections, setIncomingSections] = useState<CuePoint[]>([]);
  const [incomingStructureSource, setIncomingStructureSource] = useState("none");
  const [vibePrompt, setVibePrompt] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<Track[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const lastTransitionPairRef = useRef<string>("");
  const playerAContainerRef = useRef<HTMLDivElement>(null);
  const playerBContainerRef = useRef<HTMLDivElement>(null);
  const positionIntervalRef = useRef<any>(null);
  const audioAnalyzerRef = useRef<any>(null);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const currentTrack = queue[currentIndex];
  const player = activePlayer === 'A' ? playerA : playerB;
  const playerReady = playersReady[activePlayer];

  const [songSections, setSongSections] = useState<CuePoint[]>([]);
  const [structureSource, setStructureSource] = useState<string>("none");

  // Fetch real song structure from lyrics when track changes
  useEffect(() => {
    if (!currentTrack || !duration) return;

    const trackName = currentTrack.name;
    const artistName = currentTrack.artists?.[0]?.name || "";

    const fetchStructure = async () => {
      try {
        const res = await fetch(
          `/api/song-structure?track=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artistName)}&duration=${Math.round(duration)}`
        );
        if (!res.ok) throw new Error("Failed to fetch structure");
        const data = await res.json();

        if (data.sections && data.sections.length > 0) {
          const sec = Math.round(duration / 1000);
          setSongSections(
            data.sections.map((s: any) => ({
              positionMs: s.startMs,
              label: `${s.label} · ${Math.floor(s.startMs / 60000)}:${(Math.floor(s.startMs / 1000) % 60).toString().padStart(2, "0")}`,
              type: s.type,
              color: s.color,
              score: s.score,
            }))
          );
          setStructureSource(data.source);
          console.log(`Got song structure (${data.source}): ${data.sections.length} sections`);
        } else {
          setSongSections([]);
          setStructureSource("none");
        }
      } catch {
        setSongSections([]);
        setStructureSource("none");
      }
    };

    fetchStructure();
  }, [currentTrack?.id, duration > 0]);

  // Use real sections if available, otherwise fall back to phrase math
  const cuePoints = songSections.length > 0
    ? songSections
    : generateCuePoints(duration, currentTrack?.audioFeatures?.tempo || 120);

  // Fetch incoming track's song structure
  useEffect(() => {
    if (!nextTrack) {
      setIncomingSections([]);
      setIncomingStructureSource("none");
      return;
    }

    const trackName = nextTrack.name;
    const artistName = nextTrack.artists?.[0]?.name || "";
    // Use a rough duration estimate — incoming track hasn't loaded yet
    const estDurationMs = 210_000; // 3.5 min default

    const fetchIncoming = async () => {
      try {
        const res = await fetch(
          `/api/song-structure?track=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artistName)}&duration=${estDurationMs}`
        );
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        if (data.sections?.length > 0) {
          setIncomingSections(
            data.sections.map((s: any) => ({
              positionMs: s.startMs,
              label: s.label,
              type: s.type,
              color: s.color,
              score: s.score,
            }))
          );
          setIncomingStructureSource(data.source);
        } else {
          setIncomingSections([]);
          setIncomingStructureSource("none");
        }
      } catch {
        setIncomingSections([]);
        setIncomingStructureSource("none");
      }
    };

    fetchIncoming();
  }, [nextTrack?.id]);

  // Load YouTube IFrame API and initialize dual players
  useEffect(() => {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    window.onYouTubeIframeAPIReady = () => {
      if (!playerAContainerRef.current || !playerBContainerRef.current) return;

      // Initialize Player A
      new window.YT.Player(playerAContainerRef.current, {
        height: "0",
        width: "0",
        videoId: initialTrack.id,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event: any) => {
            console.log("YouTube Player A ready");
            setPlayerA(event.target);
            setPlayersReady(prev => ({ ...prev, A: true }));
            setDuration(event.target.getDuration() * 1000);
          },
          onStateChange: (event: any) => {
            if (activePlayer === 'A') {
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
                setDuration(event.target.getDuration() * 1000);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              } else if (event.data === window.YT.PlayerState.ENDED) {
                skipToNext();
              }
            }
          },
          onError: (event: any) => {
            console.error("YouTube Player A error:", event.data);
          },
        },
      });

      // Initialize Player B
      new window.YT.Player(playerBContainerRef.current, {
        height: "0",
        width: "0",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event: any) => {
            console.log("YouTube Player B ready");
            setPlayerB(event.target);
            setPlayersReady(prev => ({ ...prev, B: true }));
          },
          onStateChange: (event: any) => {
            if (activePlayer === 'B') {
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
                setDuration(event.target.getDuration() * 1000);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              } else if (event.data === window.YT.PlayerState.ENDED) {
                skipToNext();
              }
            }
          },
          onError: (event: any) => {
            console.error("YouTube Player B error:", event.data);
          },
        },
      });
    };

    // If YT is already loaded, initialize players
    if (window.YT && window.YT.Player) {
      window.onYouTubeIframeAPIReady();
    }

    return () => {
      if (playerA && playerA.destroy) {
        playerA.destroy();
      }
      if (playerB && playerB.destroy) {
        playerB.destroy();
      }
      if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
      }
    };
  }, []);

  // Update position regularly while playing
  useEffect(() => {
    if (!player || !playerReady) return;

    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
    }

    console.log(`Starting position tracking for player ${activePlayer}`);

    positionIntervalRef.current = setInterval(() => {
      try {
        if (player && player.getCurrentTime && isPlaying) {
          const currentTime = player.getCurrentTime();
          setPosition(currentTime * 1000);
        }
      } catch (error) {
        // Silently ignore errors - player might not be ready yet
      }
    }, 100);

    return () => {
      if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
      }
    };
  }, [player, playerReady, isPlaying, activePlayer]);

  // Get next track recommendations (multiple tracks with ratings)
  useEffect(() => {
    const getRecommendations = async () => {
    const current = queue[currentIndex];
    if (!current) return;

      // Fetch AI recommendations (nextTrack is derived automatically)
      fetchRecommendationList();
    };
    getRecommendations();
  }, [currentIndex, queue]);

  const searchManualTrack = async () => {
    const q = manualSearch.trim();
    if (!q) return;

    setManualLoading(true);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      const items: Track[] = data.tracks?.items || [];

      // Fetch audio features for each result in parallel
      const withFeatures = await Promise.all(
        items.slice(0, 6).map(async (track) => {
          try {
            const artistName = track.artists?.[0]?.name || "";
            const featRes = await fetch(
              `/api/audio-features?id=${track.id}&name=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(artistName)}`
            );
            if (featRes.ok) {
              const features = await featRes.json();
              return { ...track, audioFeatures: features };
            }
          } catch {}
          return track;
        })
      );
      setManualResults(withFeatures);
    } catch (error) {
      console.error("Manual search failed:", error);
    } finally {
      setManualLoading(false);
    }
  };

  const fetchRecommendationList = async (skipCache = false) => {
    const current = queue[currentIndex];
    if (!current) return;

    setLoadingRecommendations(true);
    console.log("Fetching recommendation list for:", current.name, skipCache ? "(fresh)" : "");

    try {
      const playedIds = queue.map(q => q.id);
      const res = await fetch("/api/mashup/recommend-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: current,
          count: 8,
          skipCache,
          excludeIds: playedIds,
          vibePrompt: vibePrompt.trim() || undefined,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setRecommendedTracks(data.recommendations || []);
        
        // Set top recommendation as auto-next (only used when queue is empty)
        if (data.recommendations.length > 0) {
          setAutoNextTrack(data.recommendations[0]);
          setAutoNextReason(data.recommendations[0].transitionReason);
        }
      }
    } catch (error) {
      console.error("Failed to get recommendations:", error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  // Get transition recommendations when we have both tracks (only once per pair)
  useEffect(() => {
    const getTransitionRecommendations = async () => {
      if (!currentTrack || !nextTrack) {
        setTransitionRecommendations([]);
        return;
      }

      // Create a unique key for this track pair
      const pairKey = `${currentTrack.id}-${nextTrack.id}`;

      // Skip if we already fetched recommendations for this pair
      if (lastTransitionPairRef.current === pairKey) {
        return;
      }

      console.log("Fetching transition recommendations for:", currentTrack.name, "→", nextTrack.name);
      lastTransitionPairRef.current = pairKey;

      try {
        const response = await fetch("/api/mashup/transition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentTrack, nextTrack }),
        });

        if (response.ok) {
          const data = await response.json();
          setTransitionRecommendations(data.transitions || []);
        }
      } catch (error) {
        console.error("Failed to get transition recommendations:", error);
      }
    };

    getTransitionRecommendations();
  }, [currentTrack, nextTrack]);

  const playTrack = async (track: Track) => {
    if (!player || !playerReady) {
      console.error("Player not ready");
      return;
    }
    try {
      console.log("Loading video:", track.id);
      player.loadVideoById(track.id);
      player.playVideo();
      setDuration(player.getDuration() * 1000);
    } catch (error) {
      console.error("Failed to play track:", error);
      alert("Failed to play track.");
    }
  };

  const togglePlayPause = async () => {
    if (!player || !playerReady) {
      console.error("Player not ready", { player: !!player, playerReady });
      return;
    }

    try {
      const playerState = player.getPlayerState();
      console.log("Current player state:", playerState);

      if (playerState === window.YT.PlayerState.PLAYING) {
        // Track is playing, pause it
        console.log("Pausing playback");
        player.pauseVideo();
      } else {
        // Track is paused or not started, play it
        console.log("Resuming/starting playback");
        player.playVideo();
      }
    } catch (error) {
      console.error("Toggle play/pause failed:", error);
    }
  };

  const stopPlayback = async () => {
    if (!player) return;

    try {
      player.pauseVideo();
      player.seekTo(0, true);
      setPosition(0);
      setIsPlaying(false);
    } catch (error) {
      console.error("Stop failed:", error);
    }
  };

  const addToQueue = (track: Track) => {
    setQueue(prev => [...prev, track]);
  };

  const playNext = (track: Track) => {
    setQueue(prev => {
      const next = [...prev];
      next.splice(currentIndex + 1, 0, track);
      return next;
    });
  };

  const moveInQueue = (fromIndex: number, direction: "up" | "down") => {
    const minIndex = currentIndex + 1;
    if (fromIndex <= currentIndex) return;
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < minIndex || toIndex >= queue.length) return;
    setQueue(prev => {
      const next = [...prev];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
  };

  const skipToNext = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(currentIndex + 1);
      playTrack(queue[currentIndex + 1]);
    } else if (autoNextTrack) {
      // If at end of queue, add the AI recommendation and play it
      setQueue([...queue, autoNextTrack]);
      setCurrentIndex(queue.length);
      playTrack(autoNextTrack);
    }
  };

  const removeFromQueue = (index: number) => {
    if (index <= currentIndex) return; // Can't remove current or past tracks
    setQueue(queue.filter((_, i) => i !== index));
  };

  const seek = async (positionMs: number) => {
    if (!player || !playerReady) return;
    try {
      player.seekTo(positionMs / 1000, true);
      setPosition(positionMs);
    } catch (error) {
      console.error("Seek failed:", error);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getColorForRating = (rating: number) => {
    if (rating >= 80) return "bg-green-600";
    if (rating >= 65) return "bg-yellow-600";
    if (rating >= 50) return "bg-orange-600";
    return "bg-red-600";
  };

  const handleTransitionClick = (transition: any) => {
    // First click: select and show insight
    if (!selectedTransition || selectedTransition.name !== transition.name) {
      setSelectedTransition(transition);
      return;
    }

    // Second click: execute transition
    executeTransition(transition);
  };

  const executeTransition = async (transition: any) => {
    if (!nextTrack || !playerA || !playerB || !playersReady.A || !playersReady.B) return;

    setIsTransitioning(true);
    setTransitionProgress(0);
    setActiveTransitionType(transition.name);
    setSelectedTransition(null);
    console.log(`Executing ${transition.name} transition`);

    try {
      let trackToPlay = nextTrack;
      if (currentIndex < queue.length - 1) {
        trackToPlay = queue[currentIndex + 1];
      }

      const currentPlayer = activePlayer === 'A' ? playerA : playerB;
      const nextPlayer = activePlayer === 'A' ? playerB : playerA;
      const currentTrack = queue[currentIndex];

      // Use BPM for beat-synced timing (fall back to 120 if unknown)
      const bpm = currentTrack?.audioFeatures?.tempo || 120;

      // Build the volume schedule from the transition engine
      let schedule: TransitionSchedule;
      switch (transition.name) {
        case "Beat Match":
          schedule = beatMatchSchedule(bpm);
          break;
        case "Echo Fade":
          schedule = echoFadeSchedule(bpm);
          break;
        case "Filter Sweep":
          schedule = filterSweepSchedule(bpm);
          break;
        case "Crossfade":
        default:
          schedule = crossfadeSchedule(bpm);
          break;
      }

      // Determine where the transition starts:
      // If a cue point is selected, start there; otherwise start so transition ends at track end
      const transitionSec = schedule.totalDurationMs / 1000;
      let seekTarget: number;

      if (selectedCuePoint) {
        seekTarget = selectedCuePoint.positionMs / 1000;
        console.log(`Starting transition at cue point: ${seekTarget.toFixed(1)}s (${selectedCuePoint.label})`);
      } else {
        seekTarget = (duration / 1000) - transitionSec;
        console.log(`Starting transition ${transitionSec.toFixed(1)}s before end`);
      }

      if (position / 1000 < seekTarget - 1) {
        currentPlayer.seekTo(seekTarget, true);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Load + cue the incoming track
      console.log("Loading next track:", trackToPlay.name);
      nextPlayer.loadVideoById(trackToPlay.id);
      nextPlayer.setVolume(0);
      await new Promise(resolve => setTimeout(resolve, 600));

      // Seek incoming track past its intro if the DJ set a start offset
      const inCueOffset = incomingStartSec > 0 ? incomingStartSec : schedule.incomingCueOffsetMs / 1000;
      if (inCueOffset > 0) {
        console.log(`Incoming track starting at ${inCueOffset}s`);
        nextPlayer.seekTo(inCueOffset, true);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Start the incoming track
      nextPlayer.playVideo();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Execute the frame-by-frame volume schedule
      const startTime = performance.now();
      let frameIdx = 0;

      while (frameIdx < schedule.frames.length) {
        const elapsed = performance.now() - startTime;
        // Advance to the frame that matches current elapsed time
        while (
          frameIdx < schedule.frames.length - 1 &&
          schedule.frames[frameIdx + 1].timeMs <= elapsed
        ) {
          frameIdx++;
        }

        const frame = schedule.frames[frameIdx];
        currentPlayer.setVolume(frame.outVol);
        nextPlayer.setVolume(frame.inVol);
        setTransitionProgress(frame.progress);

        if (frameIdx >= schedule.frames.length - 1) break;

        // Wait until next frame
        const nextFrame = schedule.frames[Math.min(frameIdx + 1, schedule.frames.length - 1)];
        const waitMs = Math.max(10, nextFrame.timeMs - elapsed);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        frameIdx++;
      }

      // Clean finish
      currentPlayer.setVolume(0);
      nextPlayer.setVolume(100);
      currentPlayer.pauseVideo();
      currentPlayer.seekTo(0, true);

      // Update queue state
      if (currentIndex < queue.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else if (nextTrack) {
        setQueue(prevQueue => [...prevQueue, nextTrack]);
        setCurrentIndex(prevIdx => prevIdx + 1);
      }

      setActivePlayer(activePlayer === 'A' ? 'B' : 'A');
      setDuration(nextPlayer.getDuration() * 1000);

      try {
        setPosition(nextPlayer.getCurrentTime() * 1000);
      } catch {
        setPosition(0);
      }

      console.log(`Transition complete (${schedule.transitionBeats} beats, ${(schedule.totalDurationMs / 1000).toFixed(1)}s)`);
      setIsTransitioning(false);
      setTransitionProgress(0);
      setSelectedCuePoint(null);
      setIncomingStartSec(0);
    } catch (error) {
      console.error("Transition failed:", error);
      try {
        playerA.setVolume(100);
        playerB.setVolume(0);
      } catch {
        // ignore
      }
      setIsTransitioning(false);
      setTransitionProgress(0);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Hidden YouTube Players for crossfading */}
      <div ref={playerAContainerRef} style={{ display: "none" }}></div>
      <div ref={playerBContainerRef} style={{ display: "none" }}></div>

      {/* Left Section: AI Prompt + Manual Search */}
      <div className="w-72 border-r border-gray-700 flex flex-col">
        {/* AI Prompt */}
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-bold mb-2 text-gray-300">AI Prompt</h2>
          <textarea
            value={vibePrompt}
            onChange={(e) => setVibePrompt(e.target.value)}
            placeholder="e.g., 'k-pop', 'chill R&B', '90s hip hop'..."
            className="w-full h-16 bg-gray-800 border border-gray-700 p-2.5 text-sm resize-none focus:outline-none focus:border-purple-600 rounded placeholder:text-gray-600"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => fetchRecommendationList(true)}
              disabled={loadingRecommendations}
              className="flex-1 bg-purple-600 text-white px-3 py-1.5 text-xs font-semibold rounded hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingRecommendations ? "..." : "Apply"}
            </button>
            {vibePrompt.trim() && (
              <button
                onClick={() => {
                  setVibePrompt("");
                  fetchRecommendationList(true);
                }}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Manual Song Search */}
        <div className="p-4 flex-1 flex flex-col min-h-0">
          <h2 className="text-sm font-bold mb-2 text-gray-300">Search Songs</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchManualTrack()}
              placeholder="Search by title or artist..."
              className="flex-1 bg-gray-800 border border-gray-700 px-3 py-2 text-sm rounded focus:outline-none focus:border-purple-600 placeholder:text-gray-600"
            />
            <button
              onClick={searchManualTrack}
              disabled={manualLoading || !manualSearch.trim()}
              className="px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {manualLoading ? "..." : "Go"}
            </button>
          </div>

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
            {manualResults.map((track) => {
              const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
              const af = track.audioFeatures;

              return (
                <div
                  key={track.id}
                  className="bg-gray-800/60 rounded-lg p-2.5 border border-gray-700/50 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    {track.album?.images?.[0]?.url && (
                      <img
                        src={track.album.images[0].url}
                        alt=""
                        className="w-10 h-10 rounded flex-shrink-0 object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{track.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {track.artists?.map(a => a.name).join(", ")}
                      </p>
                    </div>
                  </div>

                  {/* Audio Features */}
                  {af && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-gray-400">
                      {af.tempo && (
                        <span>{Math.round(af.tempo)} BPM</span>
                      )}
                      {af.key != null && (
                        <span>Key: {KEY_NAMES[af.key] || "?"}{af.mode === 0 ? "m" : ""}</span>
                      )}
                      {af.energy != null && (
                        <span>Energy: {Math.round(af.energy * 100)}%</span>
                      )}
                      {af.danceability != null && (
                        <span>Dance: {Math.round(af.danceability * 100)}%</span>
                      )}
                      {af.source && (
                        <span className={af.source === "reccobeats" ? "text-green-500" : "text-yellow-600"}>
                          {af.source === "reccobeats" ? "✓ Real" : "~ Est."}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-1.5 mt-2">
                    <button
                      onClick={() => addToQueue(track)}
                      className="flex-1 px-2 py-1 text-xs font-medium rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors"
                    >
                      + Queue
                    </button>
                    <button
                      onClick={() => playNext(track)}
                      className="flex-1 px-2 py-1 text-xs font-medium rounded bg-purple-600/80 text-white hover:bg-purple-500 transition-colors"
                    >
                      Play Next
                    </button>
                  </div>
                </div>
              );
            })}
            {manualResults.length === 0 && !manualLoading && (
              <p className="text-xs text-gray-600 text-center py-4">
                Search for a song to add it to your queue
              </p>
            )}
            {manualLoading && (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center Section */}
      <div className="flex-1 flex flex-col">
        {/* Top: Album photo/name + Music player */}
        <div className="border-b border-gray-700 p-6 flex items-start gap-6">
          {/* Album Art */}
          {currentTrack?.album?.images?.[0]?.url && (
            <img
              src={currentTrack.album.images[0].url}
              alt={currentTrack.name}
              className="w-40 h-40 rounded"
            />
          )}

          {/* Track Info & Player Controls */}
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-1">{currentTrack?.name}</h2>
            <p className="text-lg text-gray-400 mb-2">
              {currentTrack?.artists.map(a => a.name).join(", ")}
            </p>

            {/* Audio Features Display */}
            {currentTrack?.audioFeatures && (
              <div className="mb-4">
                <div className="flex gap-4 text-xs mb-1">
                  <div className="bg-gray-800 px-3 py-1.5 rounded">
                    <span className="text-gray-400">BPM:</span>{" "}
                    <span className="text-white font-semibold">
                      {Math.round(currentTrack.audioFeatures.tempo)}
                    </span>
                  </div>
                  <div className="bg-gray-800 px-3 py-1.5 rounded">
                    <span className="text-gray-400">Key:</span>{" "}
                    <span className="text-white font-semibold">
                      {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][currentTrack.audioFeatures.key] || currentTrack.audioFeatures.key}
                    </span>
                  </div>
                  <div className="bg-gray-800 px-3 py-1.5 rounded">
                    <span className="text-gray-400">Energy:</span>{" "}
                    <span className="text-white font-semibold">
                      {Math.round(currentTrack.audioFeatures.energy * 100)}%
                    </span>
                  </div>
                  <div className="bg-gray-800 px-3 py-1.5 rounded">
                    <span className="text-gray-400">Dance:</span>{" "}
                    <span className="text-white font-semibold">
                      {Math.round(currentTrack.audioFeatures.danceability * 100)}%
                    </span>
                  </div>
                </div>
                {/* Source indicator */}
                {currentTrack.audioFeatures.source && (
                  <div className="text-xs">
                    {currentTrack.audioFeatures.source === 'reccobeats' ? (
                      <span className="text-green-400">✓ ReccoBeats audio analysis</span>
                    ) : (
                      <span className="text-yellow-400">⚠ Estimated features</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Playback Controls */}
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={togglePlayPause}
                disabled={!playerReady}
                className="bg-white text-black px-6 py-2 font-semibold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                onClick={skipToNext}
                disabled={!nextTrack}
                className="bg-gray-800 text-white px-6 py-2 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                Skip
              </button>
              <button
                onClick={async () => {
                  await stopPlayback();
                  onStop();
                }}
                className="bg-gray-800 text-white px-6 py-2 hover:bg-gray-700 rounded"
              >
                Stop
              </button>
              {!playerReady && (
                <span className="text-sm text-gray-400">Initializing...</span>
              )}
              {isTransitioning && (
                <span className="text-sm text-gray-400">Transitioning...</span>
              )}
            </div>

            {/* Playback Bar with Cue Points */}
            <div className="flex items-center justify-end mb-0.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                structureSource === "synced_lyrics" ? "text-green-400 bg-green-950" :
                structureSource === "plain_lyrics" ? "text-yellow-400 bg-yellow-950" :
                "text-gray-500 bg-gray-800"
              }`}>
                {structureSource === "synced_lyrics" ? "✓ Real sections (synced lyrics)" :
                 structureSource === "plain_lyrics" ? "~ Sections (lyrics)" :
                 "~ Estimated phrases"}
              </span>
            </div>
            <CuePointBar
              position={position}
              duration={duration}
              bpm={currentTrack?.audioFeatures?.tempo || 120}
              cuePoints={cuePoints}
              selectedCuePoint={selectedCuePoint}
              onSeek={(ms) => seek(ms)}
              onSelectCue={(cue) => setSelectedCuePoint(
                selectedCuePoint?.positionMs === cue.positionMs ? null : cue
              )}
              onSetCustomCue={(ms) => {
                const sec = Math.round(ms / 1000);
                const min = Math.floor(sec / 60);
                const s = sec % 60;
                setSelectedCuePoint({
                  positionMs: ms,
                  label: `Custom (${min}:${s.toString().padStart(2, "0")})`,
                  type: "custom",
                  color: "#f472b6",
                });
              }}
            />
          </div>
        </div>

        {/* Bottom: Spotify Mix-Style Transition Interface */}
        <div className="flex-1 p-6 overflow-y-auto bg-gray-950">
          <h2 className="text-xl font-bold mb-4">Mix Transition</h2>

          {!nextTrack ? (
            <div className="text-center text-gray-400 py-12">
              <p className="mb-2">Add a track to the queue to see mix options</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Waveform Visualization — shows preview when a type is selected, live during transition */}
              {nextTrack && (
                <div className="space-y-2">
                  <TransitionWaveform
                    currentTrackName={currentTrack?.name || ""}
                    nextTrackName={nextTrack?.name || ""}
                    bpm={currentTrack?.audioFeatures?.tempo || 120}
                    transitionType={
                      isTransitioning
                        ? activeTransitionType
                        : selectedTransition?.name || transitionRecommendations[0]?.name || "Crossfade"
                    }
                    progress={transitionProgress}
                    isLive={isTransitioning}
                    outgoingCuePct={selectedCuePoint ? selectedCuePoint.positionMs / (duration || 1) : undefined}
                    outgoingDurationSec={duration ? duration / 1000 : undefined}
                    incomingStartSec={incomingStartSec}
                  />
                  {/* Incoming track cue — section-based picker */}
                  {!isTransitioning && (
                    <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-800/50">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-gray-500">
                          Start <span className="text-emerald-400">{nextTrack?.name}</span> at:
                        </span>
                        {incomingStructureSource !== "none" && (
                          <span className={`text-[9px] px-1 py-0.5 rounded ${
                            incomingStructureSource === "synced_lyrics"
                              ? "text-green-400 bg-green-950"
                              : "text-yellow-400 bg-yellow-950"
                          }`}>
                            {incomingStructureSource === "synced_lyrics" ? "✓ Real" : "~ Lyrics"}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => setIncomingStartSec(0)}
                          className={`px-2 py-1 text-[10px] rounded transition-colors ${
                            incomingStartSec === 0
                              ? "bg-emerald-600 text-white"
                              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                          }`}
                        >
                          Start
                        </button>
                        {(incomingSections.length > 0
                          ? incomingSections
                          : (() => {
                              // Fallback to phrase boundaries
                              const inBpm = nextTrack?.audioFeatures?.tempo || 120;
                              const phraseMs = (60_000 / inBpm) * 16;
                              return [1, 2, 3].map(i => ({
                                positionMs: i * phraseMs,
                                label: `Phrase ${i}`,
                                type: "phrase" as const,
                                color: "#60a5fa",
                                score: 40,
                              }));
                            })()
                        ).map((section, i) => {
                          const sec = Math.round(section.positionMs / 1000);
                          const m = Math.floor(sec / 60);
                          const s = sec % 60;
                          const isSelected = incomingStartSec === sec;

                          return (
                            <button
                              key={i}
                              onClick={() => setIncomingStartSec(sec)}
                              className={`px-2 py-1 text-[10px] rounded transition-colors flex items-center gap-1 ${
                                isSelected
                                  ? "bg-emerald-600 text-white"
                                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                              }`}
                              title={`${section.label} — ${section.score || 50}% transition quality`}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: section.color }}
                              />
                              <span>{section.label}</span>
                              <span className="text-gray-500">{m}:{s.toString().padStart(2, "0")}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Transition Controls */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                <h3 className="text-sm font-semibold mb-3 text-gray-400">Transition Type</h3>
                <div className="grid grid-cols-4 gap-2">
                  {transitionRecommendations.map((transition: any, index: number) => {
                    const isSelected = selectedTransition?.name === transition.name;
                    const isRecommended = index === 0;

                    return (
                      <button
                        key={index}
                        onClick={() => handleTransitionClick(transition)}
                        disabled={isTransitioning}
                        className={`px-4 py-3 rounded-lg text-sm font-medium transition-all relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900'
                            : isRecommended
                            ? 'bg-white text-black hover:bg-gray-200'
                            : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span>{transition.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${getColorForRating(transition.rating)}`}>
                            {transition.rating}%
                          </span>
                        </div>
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-blue-600/90 text-white text-xs font-bold">
                            Click to Execute
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {!isTransitioning && !selectedTransition && (
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    Click a transition type to see AI insight, click again to execute
                  </p>
                )}
              </div>

              {/* AI Insight */}
              {transitionRecommendations.length > 0 && (
                <div className={`rounded-lg p-4 border transition-all ${
                  selectedTransition
                    ? 'bg-blue-900 border-blue-600'
                    : 'bg-gray-900 border-gray-800'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      selectedTransition ? 'bg-blue-500' : 'bg-blue-600'
                    }`}>
                      <span className="text-xs font-bold">AI</span>
                    </div>
                    <div className="flex-1">
                      {selectedTransition ? (
                        <>
                          <p className="text-sm font-semibold mb-1 text-white">
                            Selected: {selectedTransition.name}
                          </p>
                          <p className="text-xs text-blue-200">{selectedTransition.reason}</p>
                          <p className="text-xs text-blue-300 mt-1">
                            {selectedCuePoint
                              ? `Starts at ${selectedCuePoint.label}`
                              : `Starts ${selectedTransition.startTime}s before track ends`
                            }
                          </p>
                          <p className="text-xs text-blue-100 mt-2 font-semibold">
                            Click the button again to execute
                            {!selectedCuePoint && " · Select a cue point on the timeline for a custom start"}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold mb-1">Recommended: {transitionRecommendations[0]?.name}</p>
                          <p className="text-xs text-gray-400">{transitionRecommendations[0]?.reason}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {selectedCuePoint
                              ? `Cue point: ${selectedCuePoint.label}`
                              : "Select a cue point on the timeline, or it'll transition before the end"
                            }
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Queue Sidebar */}
      <div className="w-96 border-l border-gray-800 bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-bold">Up Next</h2>
          <p className="text-sm text-gray-400">
            {queue.length - currentIndex - 1} in queue
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Upcoming queue */}
          {queue.length - currentIndex - 1 === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              Queue is empty — add songs or let AI recommend
            </div>
          )}
          {queue.slice(currentIndex + 1).map((track, relativeIndex) => {
            const actualIndex = currentIndex + 1 + relativeIndex;
            const isFirst = relativeIndex === 0;
            const isLast = actualIndex === queue.length - 1;

            return (
              <div
                key={`${track.id}-${actualIndex}`}
                className={`group p-3 border-b border-gray-800 hover:bg-gray-800/60 transition-colors ${
                  isFirst ? "bg-gray-800/30" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-4 text-right flex-shrink-0">
                    {relativeIndex + 1}
                  </span>
                  {track.album?.images?.[0]?.url && (
                    <img
                      src={track.album.images[0].url}
                      alt={track.name}
                      className="h-10 w-10 rounded flex-shrink-0 object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{track.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {track.artists.map(a => a.name).join(", ")}
                    </p>
                    {track.audioFeatures && (
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {Math.round(track.audioFeatures.tempo)} BPM · {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][track.audioFeatures.key] || "?"} · {Math.round(track.audioFeatures.energy * 100)}%
                      </p>
                    )}
                  </div>
                  {/* Controls */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => moveInQueue(actualIndex, "up")}
                      disabled={isFirst}
                      className="p-1 text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                      onClick={() => moveInQueue(actualIndex, "down")}
                      disabled={isLast}
                      className="p-1 text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button
                      onClick={() => removeFromQueue(actualIndex)}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Recommended Tracks Section */}
          <div className="border-t border-gray-700 mt-2">
            <div className="p-3 bg-gray-800 sticky top-0">
              <h3 className="text-sm font-bold text-gray-300 mb-1">
                🎵 AI Recommendations
              </h3>
              <p className="text-xs text-gray-500">
                Optimized for smooth transitions
              </p>
            </div>

            {loadingRecommendations ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <div className="animate-pulse">Analyzing transitions...</div>
              </div>
            ) : recommendedTracks.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                No recommendations available
              </div>
            ) : (
              <div className="space-y-1">
                {recommendedTracks.map((track, index) => {
                  return (
                    <div
                      key={track.id}
                      className="p-3 border-b border-gray-800 hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {track.album?.images?.[0]?.url && (
                          <img
                            src={track.album.images[0].url}
                            alt={track.name}
                            className="h-14 w-14 rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-sm">{track.name}</p>
                              <p className="text-xs text-gray-400 truncate">
                                {track.artists.map(a => a.name).join(", ")}
                              </p>
                </div>
                            <div className={`flex-shrink-0 px-2 py-1 rounded text-xs font-bold ${
                              track.transitionScore >= 80 ? 'bg-green-600 text-white' :
                              track.transitionScore >= 65 ? 'bg-yellow-600 text-white' :
                              track.transitionScore >= 50 ? 'bg-orange-600 text-white' :
                              'bg-red-600 text-white'
                            }`}>
                              {track.transitionScore}%
              </div>
                          </div>

                          {/* Transition metrics */}
                          <div className="flex gap-3 mb-2 text-xs">
                            <div className="flex items-center gap-1" title="BPM Match">
                              <span className="text-gray-500">🎵</span>
                              <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${track.bpmMatch >= 80 ? 'bg-green-500' : track.bpmMatch >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                                  style={{ width: `${track.bpmMatch}%` }}
                                />
                              </div>
                              <span className="text-gray-400 text-xs">{track.bpmMatch}%</span>
                            </div>
                            <div className="flex items-center gap-1" title="Key Match">
                              <span className="text-gray-500">🎹</span>
                              <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${track.keyMatch >= 80 ? 'bg-green-500' : track.keyMatch >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                                  style={{ width: `${track.keyMatch}%` }}
                                />
                              </div>
                              <span className="text-gray-400 text-xs">{track.keyMatch}%</span>
                            </div>
                            <div className="flex items-center gap-1" title="Energy Match">
                              <span className="text-gray-500">⚡</span>
                              <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${track.energyMatch >= 80 ? 'bg-green-500' : track.energyMatch >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                                  style={{ width: `${track.energyMatch}%` }}
                                />
                              </div>
                              <span className="text-gray-400 text-xs">{track.energyMatch}%</span>
                            </div>
                          </div>

                          <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                            {track.transitionReason}
                          </p>

                          {/* Track audio features */}
                          {track.audioFeatures && (
                            <div className="flex gap-2 mb-2 text-xs text-gray-500">
                              <span>{Math.round(track.audioFeatures.tempo)} BPM</span>
                              <span>•</span>
                              <span>Key: {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][track.audioFeatures.key] || track.audioFeatures.key}</span>
                              <span>•</span>
                              <span>Energy: {Math.round(track.audioFeatures.energy * 100)}%</span>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => addToQueue(track)}
                              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                index === 0
                                  ? 'bg-white text-black hover:bg-gray-200'
                                  : 'bg-gray-700 text-white hover:bg-gray-600'
                              }`}
                            >
                              + Queue
                            </button>
                            <button
                              onClick={() => playNext(track)}
                              className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 rounded transition-colors"
                            >
                              Play Next
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Refresh button */}
            {!loadingRecommendations && recommendedTracks.length > 0 && (
              <div className="p-3 border-t border-gray-800 bg-gray-900">
              <button
                  onClick={() => fetchRecommendationList(true)}
                  className="w-full bg-gray-800 text-white px-3 py-2 text-sm font-medium hover:bg-gray-700 border border-gray-600 rounded"
              >
                  🔄 Get New Recommendations
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

