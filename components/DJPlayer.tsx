"use client";

import { useEffect, useState, useRef } from "react";

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

  const [nextTrack, setNextTrack] = useState<Track | null>(null);
  const [nextReason, setNextReason] = useState<string>("");
  const [recommendedTracks, setRecommendedTracks] = useState<RecommendedTrack[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [transitionRecommendations, setTransitionRecommendations] = useState<any[]>([]);
  const [selectedTransition, setSelectedTransition] = useState<any | null>(null);
  const [excludedRecommendations, setExcludedRecommendations] = useState<any[]>([]);
  const lastTransitionPairRef = useRef<string>("");
  const playerAContainerRef = useRef<HTMLDivElement>(null);
  const playerBContainerRef = useRef<HTMLDivElement>(null);
  const positionIntervalRef = useRef<any>(null);
  const audioAnalyzerRef = useRef<ReturnType<typeof getAudioAnalyzer> | null>(null);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const currentTrack = queue[currentIndex];
  const player = activePlayer === 'A' ? playerA : playerB;
  const playerReady = playersReady[activePlayer];

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

      // If there's already a next track in the queue, use it as primary
      if (currentIndex < queue.length - 1) {
        setNextTrack(queue[currentIndex + 1]);
        setNextReason("Next in queue");
        // Still show recommendations
        fetchRecommendationList();
        return;
      }

      // Fetch AI recommendations
      fetchRecommendationList();
    };
    getRecommendations();
  }, [currentIndex, queue]);

  const fetchRecommendationList = async () => {
    const current = queue[currentIndex];
    if (!current) return;

    setLoadingRecommendations(true);
    console.log("Fetching recommendation list for:", current.name);

    try {
      const res = await fetch("/api/mashup/recommend-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: current,
          count: 8, // Get 8 recommendations
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setRecommendedTracks(data.recommendations || []);
        
        // Set the top recommendation as next track if no queue item
        if (data.recommendations.length > 0 && currentIndex >= queue.length - 1) {
          setNextTrack(data.recommendations[0]);
          setNextReason(data.recommendations[0].transitionReason);
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

  const addToQueue = (track?: Track) => {
    const trackToAdd = track || nextTrack;
    if (!trackToAdd) return;

    // Check if track is already in queue
    if (queue.find(t => t.id === trackToAdd.id)) {
      alert("This track is already in the queue!");
      return;
    }

    setQueue([...queue, trackToAdd]);
  };

  const skipToNext = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(currentIndex + 1);
      playTrack(queue[currentIndex + 1]);
    } else if (nextTrack) {
      // If at end of queue, add next track and play it
      setQueue([...queue, nextTrack]);
      setCurrentIndex(queue.length);
      playTrack(nextTrack);
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
    setSelectedTransition(null); // Clear selection after execution
    console.log(`Executing ${transition.name} transition`);

    try {
      // Determine which track to play next
      let trackToPlay = nextTrack;
      if (currentIndex < queue.length - 1) {
        const nextIdx = currentIndex + 1;
        trackToPlay = queue[nextIdx];
      }

      // Get current and next players
      const currentPlayer = activePlayer === 'A' ? playerA : playerB;
      const nextPlayer = activePlayer === 'A' ? playerB : playerA;

      // Calculate transition start time
      const transitionStartTime = duration - (transition.startTime * 1000);

      // Seek to transition point if not already there
      if (position < transitionStartTime - 1000) {
        console.log(`Seeking to ${transition.startTime}s before end`);
        currentPlayer.seekTo(transitionStartTime / 1000, true);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Load next track in the inactive player
      console.log("Loading next track:", trackToPlay.name);
      nextPlayer.loadVideoById(trackToPlay.id);
      nextPlayer.setVolume(0);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Execute transition based on type
      switch (transition.name) {
        case "Crossfade":
          await executeCrossfade(currentPlayer, nextPlayer, transition.startTime);
          break;
        case "Beat Match":
          await executeBeatMatch(currentPlayer, nextPlayer, transition.startTime);
          break;
        case "Echo Fade":
          await executeEchoFade(currentPlayer, nextPlayer, transition.startTime);
          break;
        case "Filter Sweep":
          await executeFilterSweep(currentPlayer, nextPlayer, transition.startTime);
          break;
        default:
          await executeCrossfade(currentPlayer, nextPlayer, transition.startTime);
      }

      // Update state
      if (currentIndex < queue.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setQueue(prevQueue => [...prevQueue, nextTrack]);
        setCurrentIndex(prevIdx => prevIdx + 1);
      }

      // Switch active player
      setActivePlayer(activePlayer === 'A' ? 'B' : 'A');
      setDuration(nextPlayer.getDuration() * 1000);

      // Update position to match the new active player
      try {
        const currentTime = nextPlayer.getCurrentTime();
        setPosition(currentTime * 1000);
        console.log(`Position synced to new player: ${currentTime}s`);
      } catch (error) {
        console.error("Failed to get current time:", error);
        setPosition(0);
      }

      console.log("Transition complete!");
      setIsTransitioning(false);
      setTransitionProgress(0);
    } catch (error) {
      console.error("Transition failed:", error);
      // Reset volumes
      try {
        playerA.setVolume(100);
        playerB.setVolume(0);
      } catch (e) {
        // Ignore
      }
      setIsTransitioning(false);
      setTransitionProgress(0);
    }
  };

  // Crossfade: Smooth volume transition
  const executeCrossfade = async (currentPlayer: any, nextPlayer: any, duration: number) => {
    const steps = 40;
    const interval = (duration * 1000) / steps;

    nextPlayer.playVideo();

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      setTransitionProgress(progress * 100);

      currentPlayer.setVolume(100 * (1 - progress));
      nextPlayer.setVolume(100 * progress);

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    currentPlayer.pauseVideo();
    currentPlayer.seekTo(0, true);
  };

  // Beat Match: Quick cut with volume swell
  const executeBeatMatch = async (currentPlayer: any, nextPlayer: any, duration: number) => {
    const steps = 20;
    const interval = (duration * 1000) / steps;

    // Quick fade out
    for (let i = 0; i <= steps / 2; i++) {
      const progress = i / (steps / 2);
      setTransitionProgress(progress * 50);
      currentPlayer.setVolume(100 * (1 - progress));
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    // Start next track
    nextPlayer.setVolume(0);
    nextPlayer.playVideo();
    await new Promise(resolve => setTimeout(resolve, 200));

    // Quick fade in
    for (let i = 0; i <= steps / 2; i++) {
      const progress = i / (steps / 2);
      setTransitionProgress(50 + progress * 50);
      nextPlayer.setVolume(100 * progress);
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    currentPlayer.pauseVideo();
    currentPlayer.seekTo(0, true);
  };

  // Echo Fade: Gradual fade with overlap
  const executeEchoFade = async (currentPlayer: any, nextPlayer: any, duration: number) => {
    const steps = 50;
    const interval = (duration * 1000) / steps;

    // Start next track early at low volume
    nextPlayer.setVolume(10);
    nextPlayer.playVideo();

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      setTransitionProgress(progress * 100);

      // Exponential fade out for current
      currentPlayer.setVolume(100 * Math.pow(1 - progress, 2));
      // Exponential fade in for next
      nextPlayer.setVolume(100 * Math.pow(progress, 0.5));

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    currentPlayer.pauseVideo();
    currentPlayer.seekTo(0, true);
  };

  // Filter Sweep: Simulate filter effect with volume curves
  const executeFilterSweep = async (currentPlayer: any, nextPlayer: any, duration: number) => {
    const steps = 30;
    const interval = (duration * 1000) / steps;

    nextPlayer.playVideo();

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      setTransitionProgress(progress * 100);

      // Create a "sweep" effect with volume
      const currentVol = 100 * (1 - progress) * (1 - Math.sin(progress * Math.PI / 2));
      const nextVol = 100 * progress * Math.sin(progress * Math.PI / 2);

      currentPlayer.setVolume(Math.max(0, currentVol));
      nextPlayer.setVolume(Math.min(100, nextVol));

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    currentPlayer.pauseVideo();
    currentPlayer.seekTo(0, true);
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Hidden YouTube Players for crossfading */}
      <div ref={playerAContainerRef} style={{ display: "none" }}></div>
      <div ref={playerBContainerRef} style={{ display: "none" }}></div>

      {/* Left Section: Prompt */}
      <div className="w-64 border-r border-gray-700 flex flex-col p-4">
        <h2 className="text-lg font-bold mb-2">AI Prompt</h2>
        <p className="text-xs text-gray-400 mb-3">
          Describe the vibe or style you want for recommendations
        </p>
        <textarea
          placeholder="e.g., 'upbeat party vibes' or 'smooth chill transition'..."
          className="w-full h-32 bg-gray-800 border border-gray-700 p-3 text-sm resize-none focus:outline-none focus:border-gray-600 rounded"
          disabled
        />
        <button 
          className="w-full mt-3 bg-gray-700 text-gray-500 px-4 py-2 text-sm font-semibold rounded cursor-not-allowed"
          disabled
        >
          Coming Soon
        </button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Feature in development
        </p>
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
                disabled={currentIndex >= queue.length - 1 && !nextTrack}
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

            {/* Playback Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-10 text-right">
                {formatTime(position)}
              </span>
              <div className="flex-1 relative h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full bg-white transition-all"
                  style={{ width: `${(position / (duration || 1)) * 100}%` }}
                />
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={position}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <span className="text-xs text-gray-400 w-10">
                {formatTime(duration)}
              </span>
            </div>
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
              {/* Transition Progress */}
              {isTransitioning && (
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 animate-pulse">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold mb-1">Transitioning...</p>
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300"
                          style={{ width: `${transitionProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{Math.round(transitionProgress)}% complete</p>
                    </div>
                  </div>
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
                            Transition starts {selectedTransition.startTime}s before current track ends
                          </p>
                          <p className="text-xs text-blue-100 mt-2 font-semibold">
                            💡 Click the button again to execute this transition
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold mb-1">Recommended: {transitionRecommendations[0]?.name}</p>
                          <p className="text-xs text-gray-400">{transitionRecommendations[0]?.reason}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Transition starts {transitionRecommendations[0]?.startTime}s before current track ends
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
          {/* Current Queue - only show upcoming tracks (not current) */}
          {queue.slice(currentIndex + 1).map((track, relativeIndex) => {
            const actualIndex = currentIndex + 1 + relativeIndex;
            return (
              <div
                key={`${track.id}-${actualIndex}`}
                className="p-3 border-b border-gray-800 hover:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  {track.album?.images?.[0]?.url && (
                    <img
                      src={track.album.images[0].url}
                      alt={track.name}
                      className="h-12 w-12 rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{track.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {track.artists.map(a => a.name).join(", ")}
                    </p>
                  </div>
                    <button
                      onClick={() => removeFromQueue(actualIndex)}
                    className="text-gray-400 hover:text-white text-sm flex-shrink-0"
                    >
                      ✕
                    </button>
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
                  const isInQueue = queue.some(q => q.id === track.id);
                  
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
                              disabled={isInQueue}
                              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                isInQueue
                                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                  : index === 0
                                  ? 'bg-white text-black hover:bg-gray-200'
                                  : 'bg-gray-700 text-white hover:bg-gray-600'
                              }`}
                            >
                              {isInQueue ? '✓ In Queue' : '+ Add to Queue'}
                </button>
                            {index === 0 && !isInQueue && (
                <button
                                onClick={() => {
                                  setNextTrack(track);
                                  setNextReason(track.transitionReason);
                                }}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 rounded transition-colors"
                              >
                                Set as Next
                </button>
                            )}
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
                  onClick={fetchRecommendationList}
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

