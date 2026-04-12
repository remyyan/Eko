"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import {
  crossfadeSchedule,
  beatMatchSchedule,
  echoFadeSchedule,
  filterSweepSchedule,
  type TransitionSchedule,
} from "@/lib/transitionEngine";
import TransitionWaveform from "@/components/TransitionWaveform";
import CuePointBar, { generateCuePoints, type CuePoint } from "@/components/CuePointBar";
import { saveMix, type SavedTrack } from "@/lib/saveMix";

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
  initialQueue?: Track[];
  onStop: () => void;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export default function DJPlayer({ initialTrack, initialQueue, onStop }: DJPlayerProps) {
  const { user } = useUser();
  const MIN_TRANSITION_BEATS = 4;
  const MAX_TRANSITION_BEATS = 64;
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const [queue, setQueue] = useState<Track[]>(initialQueue ?? [initialTrack]);
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
  const [transitionLengthBeats, setTransitionLengthBeats] = useState(16);
  const [transitionRecommendations, setTransitionRecommendations] = useState<any[]>([]);
  const [selectedTransition, setSelectedTransition] = useState<any | null>(null);
  const [excludedRecommendations, setExcludedRecommendations] = useState<any[]>([]);
  const [selectedCuePoint, setSelectedCuePoint] = useState<CuePoint | null>(null);
  const [incomingStartSec, setIncomingStartSec] = useState(0);
  const [selectedIncomingCue, setSelectedIncomingCue] = useState<CuePoint | null>(null);
  const [incomingSections, setIncomingSections] = useState<CuePoint[]>([]);
  const [incomingStructureSource, setIncomingStructureSource] = useState("none");
  const [incomingDurationMs, setIncomingDurationMs] = useState(210_000);
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

  const clampTransitionBeats = (beats: number) =>
    Math.max(MIN_TRANSITION_BEATS, Math.min(MAX_TRANSITION_BEATS, Math.round(beats)));

  const buildTransitionSchedule = (
    transitionName: string,
    bpm: number,
    beatsOverride?: number
  ): TransitionSchedule => {
    const beats = clampTransitionBeats(
      beatsOverride ?? transitionLengthBeats ?? 16
    );
    switch (transitionName) {
      case "Beat Match":
        return beatMatchSchedule(bpm, beats);
      case "Echo Fade":
        return echoFadeSchedule(bpm, beats);
      case "Filter Sweep":
        return filterSweepSchedule(bpm, beats);
      case "Crossfade":
      default:
        return crossfadeSchedule(bpm, beats);
    }
  };

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

  const incomingCuePoints = incomingSections.length > 0
    ? incomingSections
    : generateCuePoints(incomingDurationMs, nextTrack?.audioFeatures?.tempo || 120);

  // Fetch incoming track's song structure
  useEffect(() => {
    if (!nextTrack) {
      setIncomingSections([]);
      setIncomingStructureSource("none");
      setSelectedIncomingCue(null);
      setIncomingStartSec(0);
      setIncomingDurationMs(210_000);
      return;
    }

    setSelectedIncomingCue(null);
    setIncomingStartSec(0);

    const trackName = nextTrack.name;
    const artistName = nextTrack.artists?.[0]?.name || "";
    const estDurationMs = 210_000;
    setIncomingDurationMs(estDurationMs);

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
                if (!autoTransitionFiredRef.current) skipToNext();
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
                if (!autoTransitionFiredRef.current) skipToNext();
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

  // Update position regularly — always poll, don't gate on isPlaying
  useEffect(() => {
    if (!player || !playerReady) return;

    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
    }

    positionIntervalRef.current = setInterval(() => {
      try {
        if (player?.getCurrentTime) {
          const t = player.getCurrentTime();
          if (typeof t === "number" && t >= 0) setPosition(t * 1000);
        }
        if (player?.getDuration) {
          const d = player.getDuration();
          if (typeof d === "number" && d > 0) setDuration(d * 1000);
        }
      } catch {
        // Player might not be ready yet
      }
    }, 150);

    return () => {
      if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
      }
    };
  }, [player, playerReady, activePlayer]);

  // Auto-transition: trigger a smooth crossfade when approaching the end of the track
  const autoTransitionFiredRef = useRef(false);

  useEffect(() => {
    // Reset the flag when the track changes
    autoTransitionFiredRef.current = false;
  }, [currentIndex]);

  useEffect(() => {
    if (!isPlaying || isTransitioning || !nextTrack || !duration || autoTransitionFiredRef.current) return;
    if (!playerA || !playerB || !playersReady.A || !playersReady.B) return;

    const transition = selectedTransition || transitionRecommendations[0] || { name: "Crossfade", beats: 16 };
    const beatsForTransition = transitionLengthBeats || transition.beats || 16;
    const currentBpm = queue[currentIndex]?.audioFeatures?.tempo || 120;
    const defaultSchedule = buildTransitionSchedule(transition.name, currentBpm, beatsForTransition);
    const autoLeadMs = defaultSchedule.totalDurationMs + 2000;
    const fallbackTriggerMs = Math.max(0, duration - autoLeadMs);
    const triggerMs = selectedCuePoint ? selectedCuePoint.positionMs : fallbackTriggerMs;
    const shouldAutoTransition = position >= triggerMs;

    if (shouldAutoTransition) {
      autoTransitionFiredRef.current = true;
      const triggerLabel = selectedCuePoint
        ? `${selectedCuePoint.label} (${Math.round(triggerMs / 1000)}s)`
        : `${Math.round((duration - position) / 1000)}s remaining`;
      console.log(`Auto-transition at ${triggerLabel}, using ${transition.name}`);
      executeTransition(transition);
    }
  }, [position, duration, isPlaying, isTransitioning, nextTrack, currentIndex, selectedCuePoint, selectedTransition, transitionRecommendations, transitionLengthBeats]);

  useEffect(() => {
    if (!nextTrack) {
      setTransitionLengthBeats(16);
      return;
    }
    const fallbackBeats = selectedTransition?.beats || transitionRecommendations[0]?.beats || 16;
    setTransitionLengthBeats(clampTransitionBeats(fallbackBeats));
  }, [nextTrack?.id, transitionRecommendations]);

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
      if (typeof transition?.beats === "number") {
        setTransitionLengthBeats(clampTransitionBeats(transition.beats));
      }
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
      const schedule = buildTransitionSchedule(
        transition.name,
        bpm,
        transitionLengthBeats || transition?.beats || 16
      );

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

  const handleSaveMix = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      const tracks: SavedTrack[] = queue.map((t) => ({
        id: t.id,
        name: t.name,
        artist: t.artists?.[0]?.name ?? "",
        albumArt: t.album?.images?.[0]?.url ?? "",
        bpm: t.audioFeatures?.tempo ?? 0,
        key: t.audioFeatures?.camelot ?? "",
        energy: Math.round((t.audioFeatures?.energy ?? 0) * 100),
      }));
      const transition = selectedTransition || transitionRecommendations[0];
      await saveMix(user.id, {
        title: `${queue[0]?.name ?? "Mix"} + ${queue.length - 1} more`,
        isPublic: false,
        tracks,
        transitionBeats: transitionLengthBeats,
        transitionType: transition?.name ?? "Crossfade",
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      console.error("Save mix failed:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
    setIsSaving(false);
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-[#e8e8e8]">
      {/* Hidden YouTube Players for crossfading */}
      <div ref={playerAContainerRef} style={{ display: "none" }}></div>
      <div ref={playerBContainerRef} style={{ display: "none" }}></div>

      {/* Left Section: AI Prompt + Manual Search */}
      <div className="w-72 border-r border-[#1c1c1c] flex flex-col bg-[#0d0d0d]">
        {/* AI Prompt */}
        <div className="p-4 border-b border-[#1c1c1c]">
          <h2 className="text-[10px] font-semibold mb-2 text-[#666] uppercase tracking-wider">AI Prompt</h2>
          <textarea
            value={vibePrompt}
            onChange={(e) => setVibePrompt(e.target.value)}
            placeholder="e.g., 'chill R&B', '90s hip hop'..."
            className="w-full h-16 bg-[#111] border border-[#222] p-2.5 text-sm rounded resize-none focus:outline-none focus:border-red-500/50 placeholder:text-[#444] text-[#ccc]"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => fetchRecommendationList(true)}
              disabled={loadingRecommendations}
              className="flex-1 bg-red-500/15 text-red-400 px-3 py-1.5 text-xs font-semibold rounded hover:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-red-500/20"
            >
              {loadingRecommendations ? "..." : "Apply"}
            </button>
            {vibePrompt.trim() && (
              <button
                onClick={() => {
                  setVibePrompt("");
                  fetchRecommendationList(true);
                }}
                className="px-3 py-1.5 text-xs text-[#555] hover:text-[#888] bg-[#161616] rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Manual Song Search */}
        <div className="p-4 flex-1 flex flex-col min-h-0">
          <h2 className="text-[10px] font-semibold mb-2 text-[#666] uppercase tracking-wider">Search Songs</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchManualTrack()}
              placeholder="Title or artist..."
              className="flex-1 bg-[#111] border border-[#222] px-3 py-2 text-sm rounded focus:outline-none focus:border-red-500/50 placeholder:text-[#444] text-[#ccc]"
            />
            <button
              onClick={searchManualTrack}
              disabled={manualLoading || !manualSearch.trim()}
              className="px-3 py-2 bg-[#1a1a1a] text-[#888] text-sm rounded hover:bg-[#222] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-[#222]"
            >
              {manualLoading ? "..." : "Go"}
            </button>
          </div>

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {manualResults.map((track) => {
              const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
              const af = track.audioFeatures;

              return (
                <div
                  key={track.id}
                  className="bg-[#111] rounded p-2.5 border border-[#1a1a1a] hover:border-[#2a2a2a] transition-colors"
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
                      <p className="text-xs font-medium truncate text-[#ddd]">{track.name}</p>
                      <p className="text-[10px] text-[#666] truncate">
                        {track.artists?.map(a => a.name).join(", ")}
                      </p>
                    </div>
                  </div>

                  {af && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-[#555] font-mono">
                      {af.tempo && <span>{Math.round(af.tempo)} BPM</span>}
                      {af.key != null && <span>{KEY_NAMES[af.key] || "?"}{af.mode === 0 ? "m" : ""}</span>}
                      {af.energy != null && <span>{Math.round(af.energy * 100)}% E</span>}
                      {af.source && (
                        <span className={af.source === "reccobeats" ? "text-green-500/70" : "text-yellow-500/50"}>
                          {af.source === "reccobeats" ? "✓" : "~"}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-1.5 mt-2">
                    <button
                      onClick={() => addToQueue(track)}
                      className="flex-1 px-2 py-1 text-[10px] font-medium rounded bg-[#1a1a1a] text-[#888] hover:bg-[#222] hover:text-white transition-colors border border-[#222]"
                    >
                      + Queue
                    </button>
                    <button
                      onClick={() => playNext(track)}
                      className="flex-1 px-2 py-1 text-[10px] font-medium rounded bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors border border-cyan-500/20"
                    >
                      Play Next
                    </button>
                  </div>
                </div>
              );
            })}
            {manualResults.length === 0 && !manualLoading && (
              <p className="text-[10px] text-[#444] text-center py-4">
                Search for a song to add to your queue
              </p>
            )}
            {manualLoading && (
              <div className="flex justify-center py-6">
                <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center Section */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
        {/* Top: Album photo/name + Music player */}
        <div className="border-b border-[#1c1c1c] p-5">
          <div className="flex items-start gap-5 mb-4">
            {/* Album Art */}
            {currentTrack?.album?.images?.[0]?.url && (
              <img
                src={currentTrack.album.images[0].url}
                alt={currentTrack.name}
                className="w-28 h-28 rounded flex-shrink-0"
              />
            )}

            {/* Track Info & Player Controls */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold mb-0.5 truncate text-white">{currentTrack?.name}</h2>
              <p className="text-sm text-[#888] mb-3 truncate">
                {currentTrack?.artists.map(a => a.name).join(", ")}
              </p>

              {currentTrack?.audioFeatures && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-1.5 text-xs mb-1 font-mono">
                    <div className="bg-[#161616] px-2.5 py-1 rounded border border-[#222]">
                      <span className="text-[#555]">BPM</span>{" "}
                      <span className="text-red-400 font-semibold">
                        {Math.round(currentTrack.audioFeatures.tempo)}
                      </span>
                    </div>
                    <div className="bg-[#161616] px-2.5 py-1 rounded border border-[#222]">
                      <span className="text-[#555]">KEY</span>{" "}
                      <span className="text-cyan-400 font-semibold">
                        {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][currentTrack.audioFeatures.key] || currentTrack.audioFeatures.key}
                      </span>
                    </div>
                    <div className="bg-[#161616] px-2.5 py-1 rounded border border-[#222]">
                      <span className="text-[#555]">NRG</span>{" "}
                      <span className="text-orange-400 font-semibold">
                        {Math.round(currentTrack.audioFeatures.energy * 100)}%
                      </span>
                    </div>
                    <div className="bg-[#161616] px-2.5 py-1 rounded border border-[#222]">
                      <span className="text-[#555]">DNC</span>{" "}
                      <span className="text-emerald-400 font-semibold">
                        {Math.round(currentTrack.audioFeatures.danceability * 100)}%
                      </span>
                    </div>
                  </div>
                  {currentTrack.audioFeatures.source && (
                    <div className="text-[9px] font-mono">
                      {currentTrack.audioFeatures.source === 'reccobeats' ? (
                        <span className="text-green-500/60">✓ ReccoBeats</span>
                      ) : (
                        <span className="text-yellow-500/50">~ Estimated</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Playback Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlayPause}
                  disabled={!playerReady}
                  className="bg-red-500 text-white px-5 py-1.5 text-sm font-semibold hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={skipToNext}
                  disabled={!nextTrack}
                  className="bg-[#1a1a1a] text-[#888] px-5 py-1.5 text-sm hover:bg-[#222] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors border border-[#222]"
                >
                  Skip
                </button>
                <button
                  onClick={async () => {
                    await stopPlayback();
                    onStop();
                  }}
                  className="bg-[#1a1a1a] text-[#888] px-5 py-1.5 text-sm hover:bg-[#222] hover:text-white rounded transition-colors border border-[#222]"
                >
                  Stop
                </button>
                {user && (
                  <button
                    onClick={handleSaveMix}
                    disabled={isSaving || queue.length === 0}
                    className={`px-4 py-1.5 text-sm rounded transition-colors border disabled:opacity-50 disabled:cursor-not-allowed ${
                      saveStatus === "saved"
                        ? "bg-green-500/10 border-green-500/30 text-green-400"
                        : saveStatus === "error"
                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                        : "bg-[#1a1a1a] border-[#222] text-[#888] hover:bg-[#222] hover:text-white"
                    }`}
                  >
                    {isSaving ? "Saving…" : saveStatus === "saved" ? "✓ Saved" : saveStatus === "error" ? "Error" : "Save Mix"}
                  </button>
                )}
                {!playerReady && (
                  <span className="text-[10px] text-[#555]">Initializing...</span>
                )}
                {isTransitioning && (
                  <span className="text-[10px] text-red-400 animate-pulse">Transitioning...</span>
                )}
              </div>
            </div>
          </div>

          {/* Playback Bar — full width below album art row */}
          <div className="flex items-center justify-end mb-0.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
              structureSource === "synced_lyrics" ? "text-green-500/70 bg-green-500/5 border border-green-500/10" :
              structureSource === "plain_lyrics" ? "text-yellow-500/60 bg-yellow-500/5 border border-yellow-500/10" :
              "text-[#444] bg-[#111] border border-[#1a1a1a]"
            }`}>
              {structureSource === "synced_lyrics" ? "✓ Synced lyrics" :
               structureSource === "plain_lyrics" ? "~ Lyrics" :
               "~ Estimated"}
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

        {/* Bottom: Transition Interface */}
        <div className="flex-1 p-5 overflow-y-auto bg-[#0a0a0a]">
          <h2 className="text-sm font-semibold mb-4 text-[#666] uppercase tracking-wider">Mix Transition</h2>

          {!nextTrack ? (
            <div className="text-center text-[#444] py-12">
              <p className="text-sm">Add a track to the queue to see mix options</p>
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
                    transitionBeats={transitionLengthBeats}
                    progress={transitionProgress}
                    isLive={isTransitioning}
                    outgoingCuePct={selectedCuePoint ? selectedCuePoint.positionMs / (duration || 1) : undefined}
                    outgoingDurationSec={duration ? duration / 1000 : undefined}
                    incomingStartSec={incomingStartSec}
                  />
                  {/* Incoming track cue bar */}
                  {!isTransitioning && (
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-[#555]">
                          Incoming: <span className="text-cyan-400 font-medium">{nextTrack?.name}</span>
                        </span>
                        <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                          incomingStructureSource === "synced_lyrics"
                            ? "text-green-500/60 bg-green-500/5"
                            : incomingStructureSource === "plain_lyrics"
                            ? "text-yellow-500/50 bg-yellow-500/5"
                            : "text-[#444] bg-[#111]"
                        }`}>
                          {incomingStructureSource === "synced_lyrics" ? "✓ Synced"
                            : incomingStructureSource === "plain_lyrics" ? "~ Lyrics"
                            : "~ Estimated"}
                        </span>
                      </div>
                      <CuePointBar
                        position={selectedIncomingCue ? selectedIncomingCue.positionMs : 0}
                        duration={incomingDurationMs}
                        bpm={nextTrack?.audioFeatures?.tempo || 120}
                        cuePoints={incomingCuePoints}
                        selectedCuePoint={selectedIncomingCue}
                        onSeek={(ms) => {
                          setIncomingStartSec(Math.round(ms / 1000));
                        }}
                        onSelectCue={(cue) => {
                          if (selectedIncomingCue?.positionMs === cue.positionMs) {
                            setSelectedIncomingCue(null);
                            setIncomingStartSec(0);
                          } else {
                            setSelectedIncomingCue(cue);
                            setIncomingStartSec(Math.round(cue.positionMs / 1000));
                          }
                        }}
                        onSetCustomCue={(ms) => {
                          const sec = Math.round(ms / 1000);
                          const min = Math.floor(sec / 60);
                          const s = sec % 60;
                          const cue: CuePoint = {
                            positionMs: ms,
                            label: `Custom (${min}:${s.toString().padStart(2, "0")})`,
                            type: "custom",
                            color: "#22d3ee",
                          };
                          setSelectedIncomingCue(cue);
                          setIncomingStartSec(sec);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Transition Controls */}
              <div className="bg-[#0d0d0d] rounded p-4 border border-[#1c1c1c]">
                <h3 className="text-[10px] font-semibold mb-3 text-[#555] uppercase tracking-wider">Transition Type</h3>
                <div className="grid grid-cols-4 gap-2">
                  {transitionRecommendations.map((transition: any, index: number) => {
                    const isSelected = selectedTransition?.name === transition.name;
                    const isRecommended = index === 0;

                    return (
                      <button
                        key={index}
                        onClick={() => handleTransitionClick(transition)}
                        disabled={isTransitioning}
                        className={`px-3 py-2.5 rounded text-xs font-medium transition-all relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-red-500 text-white ring-1 ring-red-400'
                            : isRecommended
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25'
                            : 'bg-[#161616] text-[#888] hover:bg-[#1c1c1c] hover:text-white border border-[#222]'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span>{transition.name}</span>
                          <span className="text-[10px] font-mono opacity-70">
                            {transition.rating}%
                          </span>
                        </div>
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-red-500/95 text-white text-[10px] font-bold uppercase tracking-wider">
                            Execute
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {!isTransitioning && !selectedTransition && (
                  <p className="text-[10px] text-[#444] mt-3 text-center">
                    Click a transition type to preview, click again to execute
                  </p>
                )}
                <div className="mt-4 pt-3 border-t border-[#1a1a1a]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">
                      Transition Length
                    </label>
                    <span className="text-[10px] font-mono text-[#888]">
                      {transitionLengthBeats} beats
                    </span>
                  </div>
                  <input
                    type="range"
                    min={MIN_TRANSITION_BEATS}
                    max={MAX_TRANSITION_BEATS}
                    step={1}
                    value={transitionLengthBeats}
                    onChange={(e) => {
                      setTransitionLengthBeats(clampTransitionBeats(Number(e.target.value)));
                    }}
                    disabled={isTransitioning}
                    className="w-full accent-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-[#555]">
                    <span>{MIN_TRANSITION_BEATS}b</span>
                    <span>
                      ~
                      {Math.round(
                        ((transitionLengthBeats * 60) / (currentTrack?.audioFeatures?.tempo || 120)) * 10
                      ) / 10}
                      s
                    </span>
                    <span>{MAX_TRANSITION_BEATS}b</span>
                  </div>
                </div>
              </div>

              {/* AI Insight */}
              {transitionRecommendations.length > 0 && (
                <div className={`rounded p-3 border transition-all ${
                  selectedTransition
                    ? 'bg-red-500/5 border-red-500/20'
                    : 'bg-[#0d0d0d] border-[#1c1c1c]'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                      selectedTransition ? 'bg-red-500/20 text-red-400' : 'bg-[#1a1a1a] text-[#666] border border-[#222]'
                    }`}>
                      AI
                    </div>
                    <div className="flex-1">
                      {selectedTransition ? (
                        <>
                          <p className="text-xs font-semibold mb-1 text-red-400">
                            {selectedTransition.name}
                          </p>
                          <p className="text-[11px] text-[#888]">{selectedTransition.reason}</p>
                          <p className="text-[10px] text-[#666] mt-1 font-mono">
                            {selectedCuePoint
                              ? `→ ${selectedCuePoint.label}`
                              : `→ ${selectedTransition.startTime}s before end`
                            }
                          </p>
                          <p className="text-[10px] text-red-400/80 mt-1.5 font-medium">
                            Click again to execute
                            {!selectedCuePoint && " · or select a cue point"}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-medium mb-1 text-[#ccc]">Recommended: {transitionRecommendations[0]?.name}</p>
                          <p className="text-[11px] text-[#666]">{transitionRecommendations[0]?.reason}</p>
                          <p className="text-[10px] text-[#555] mt-1 font-mono">
                            {selectedCuePoint
                              ? `→ ${selectedCuePoint.label}`
                              : "Select a cue point or it'll auto-transition"
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
      <div className="w-96 border-l border-[#1c1c1c] bg-[#0d0d0d] flex flex-col">
        <div className="p-4 border-b border-[#1c1c1c]">
          <h2 className="text-sm font-semibold text-[#ccc]">Up Next</h2>
          <p className="text-[10px] text-[#555] font-mono">
            {queue.length - currentIndex - 1} in queue
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Upcoming queue */}
          {queue.length - currentIndex - 1 === 0 && (
            <div className="p-4 text-center text-[#444] text-xs">
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
                className={`group p-3 border-b border-[#161616] hover:bg-[#111] transition-colors ${
                  isFirst ? "bg-[#111]" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[#333] w-4 text-right flex-shrink-0 font-mono">
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
                    <p className="font-medium truncate text-sm text-[#ddd]">{track.name}</p>
                    <p className="text-xs text-[#666] truncate">
                      {track.artists.map(a => a.name).join(", ")}
                    </p>
                    {track.audioFeatures && (
                      <p className="text-[10px] text-[#444] mt-0.5 font-mono">
                        {Math.round(track.audioFeatures.tempo)} BPM · {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][track.audioFeatures.key] || "?"} · {Math.round(track.audioFeatures.energy * 100)}%
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => moveInQueue(actualIndex, "up")}
                      disabled={isFirst}
                      className="p-1 text-[#555] hover:text-white disabled:text-[#222] disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                      onClick={() => moveInQueue(actualIndex, "down")}
                      disabled={isLast}
                      className="p-1 text-[#555] hover:text-white disabled:text-[#222] disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button
                      onClick={() => removeFromQueue(actualIndex)}
                      className="p-1 text-[#555] hover:text-red-400 transition-colors"
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
          <div className="border-t border-[#1c1c1c] mt-1">
            <div className="p-3 bg-[#111] sticky top-0 border-b border-[#1a1a1a]">
              <h3 className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">
                AI Recommendations
              </h3>
            </div>

            {loadingRecommendations ? (
              <div className="p-6 text-center">
                <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span className="text-[10px] text-[#555]">Analyzing...</span>
              </div>
            ) : recommendedTracks.length === 0 ? (
              <div className="p-6 text-center text-[#444] text-xs">
                No recommendations available
              </div>
            ) : (
              <div>
                {recommendedTracks.map((track, index) => {
                  return (
                    <div
                      key={track.id}
                      className="p-3 border-b border-[#161616] hover:bg-[#111] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {track.album?.images?.[0]?.url && (
                          <img
                            src={track.album.images[0].url}
                            alt={track.name}
                            className="h-12 w-12 rounded flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-sm text-[#ddd]">{track.name}</p>
                              <p className="text-[10px] text-[#666] truncate">
                                {track.artists.map(a => a.name).join(", ")}
                              </p>
                            </div>
                            <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                              track.transitionScore >= 80 ? 'text-green-400 bg-green-500/10' :
                              track.transitionScore >= 65 ? 'text-yellow-400 bg-yellow-500/10' :
                              track.transitionScore >= 50 ? 'text-orange-400 bg-orange-500/10' :
                              'text-red-400 bg-red-500/10'
                            }`}>
                              {track.transitionScore}%
                            </span>
                          </div>

                          {/* Transition metrics — compact bars */}
                          <div className="flex gap-2 mb-1.5">
                            {[
                              { label: "BPM", value: track.bpmMatch },
                              { label: "KEY", value: track.keyMatch },
                              { label: "NRG", value: track.energyMatch },
                            ].map(({ label, value }) => (
                              <div key={label} className="flex items-center gap-1" title={`${label} Match`}>
                                <span className="text-[8px] text-[#444] w-5 font-mono">{label}</span>
                                <div className="w-10 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${value >= 80 ? 'bg-green-500/70' : value >= 60 ? 'bg-yellow-500/70' : 'bg-orange-500/70'}`}
                                    style={{ width: `${value}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          <p className="text-[10px] text-[#555] mb-2 line-clamp-1">
                            {typeof track.transitionReason === "string"
                              ? track.transitionReason
                              : JSON.stringify(track.transitionReason)}
                          </p>

                          {track.audioFeatures && (
                            <div className="flex gap-2 mb-2 text-[10px] text-[#444] font-mono">
                              <span>{Math.round(track.audioFeatures.tempo)} BPM</span>
                              <span className="text-[#222]">·</span>
                              <span>{['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][track.audioFeatures.key] || track.audioFeatures.key}</span>
                              <span className="text-[#222]">·</span>
                              <span>{Math.round(track.audioFeatures.energy * 100)}% E</span>
                            </div>
                          )}

                          <div className="flex gap-1.5">
                            <button
                              onClick={() => addToQueue(track)}
                              className={`flex-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                                index === 0
                                  ? 'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25'
                                  : 'bg-[#1a1a1a] text-[#888] hover:bg-[#222] hover:text-white border border-[#222]'
                              }`}
                            >
                              + Queue
                            </button>
                            <button
                              onClick={() => playNext(track)}
                              className="px-2 py-1 text-[10px] font-medium bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 rounded transition-colors border border-cyan-500/20"
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

            {!loadingRecommendations && recommendedTracks.length > 0 && (
              <div className="p-3 border-t border-[#161616]">
                <button
                  onClick={() => fetchRecommendationList(true)}
                  className="w-full bg-[#111] text-[#888] px-3 py-2 text-[10px] font-medium hover:bg-[#1a1a1a] hover:text-white border border-[#222] rounded transition-colors uppercase tracking-wider"
                >
                  Refresh Recommendations
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

