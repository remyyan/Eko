"use client";

import { useEffect, useState, useRef } from "react";

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  audioFeatures?: any;
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
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [transitionRecommendations, setTransitionRecommendations] = useState<any[]>([]);
  const lastTransitionPairRef = useRef<string>("");
  const playerAContainerRef = useRef<HTMLDivElement>(null);
  const playerBContainerRef = useRef<HTMLDivElement>(null);
  const positionIntervalRef = useRef<any>(null);

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
  }, [player, playerReady, isPlaying]);

  // Get next track recommendation (only when current track changes and no next track in queue)
  useEffect(() => {
    const getNextTrack = async () => {
      const current = queue[currentIndex];
      if (!current) return;

      // If there's already a next track in the queue, don't fetch AI recommendation
      if (currentIndex < queue.length - 1) {
        setNextTrack(queue[currentIndex + 1]);
        setNextReason("Next in queue");
        return;
      }

      // Only fetch AI recommendation if we're at the end of the queue
      console.log("Fetching AI recommendation for:", current.name);

      try {
        const res = await fetch("/api/mashup/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track: current }),
        });
        if (res.ok) {
          const data = await res.json();
          setNextTrack(data.recommendedTrack);
          setNextReason(data.reason);
        }
      } catch (error) {
        console.error("Failed to get next track:", error);
      }
    };
    getNextTrack();
  }, [currentIndex, queue]);

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

  const addToQueue = () => {
    if (!nextTrack) return;

    // Check if track is already in queue
    if (queue.find(t => t.id === nextTrack.id)) {
      alert("This track is already in the queue!");
      return;
    }

    setQueue([...queue, nextTrack]);
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
    if (rating >= 60) return "bg-yellow-600";
    if (rating >= 40) return "bg-orange-600";
    return "bg-red-600";
  };

  const executeTransition = async (transition: any) => {
    if (!nextTrack || !playerA || !playerB || !playersReady.A || !playersReady.B) return;

    setIsTransitioning(true);
    setTransitionProgress(0);
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
        <h2 className="text-lg font-bold mb-4">Prompt</h2>
        <textarea
          placeholder="Describe the vibe or transition you want..."
          className="w-full h-32 bg-gray-800 border border-gray-700 p-3 text-sm resize-none focus:outline-none focus:border-gray-600 rounded"
        />
        <button className="w-full mt-3 bg-white text-black px-4 py-2 text-sm font-semibold hover:bg-gray-200 rounded">
          Generate
        </button>
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
            <p className="text-lg text-gray-400 mb-4">
              {currentTrack?.artists.map(a => a.name).join(", ")}
            </p>

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
              {/* Waveform-style visualization */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                {/* Current Track Info */}
                <div className="flex items-center gap-3 mb-4">
                  {currentTrack?.album?.images?.[0]?.url && (
                    <img
                      src={currentTrack.album.images[0].url}
                      alt={currentTrack.name}
                      className="w-12 h-12 rounded"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{currentTrack?.name}</p>
                    <p className="text-xs text-gray-400">{currentTrack?.artists[0]?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Current</p>
                    <p className="text-sm font-semibold">{currentTrack?.audioFeatures?.tempo?.toFixed(0) || "?"} bpm</p>
                  </div>
                </div>

                {/* Simple Track Transition Visualization */}
                <div className="relative h-24 bg-gray-800 rounded mb-4 overflow-hidden flex items-center">
                  {/* Current track side */}
                  <div className="flex-1 h-full bg-gradient-to-r from-blue-900 to-blue-700 flex items-center justify-center border-r-2 border-gray-700">
                    <div className="text-center">
                      <p className="text-xs text-gray-300 mb-1">Current Track</p>
                      <p className="text-2xl font-bold text-blue-300">→</p>
                    </div>
                  </div>

                  {/* Transition indicator */}
                  <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                    <div className="w-16 h-16 rounded-full bg-gray-900 border-4 border-white flex items-center justify-center">
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                      </svg>
                    </div>
                  </div>

                  {/* Next track side */}
                  <div className="flex-1 h-full bg-gradient-to-l from-green-900 to-green-700 flex items-center justify-center border-l-2 border-gray-700">
                    <div className="text-center">
                      <p className="text-xs text-gray-300 mb-1">Next Track</p>
                      <p className="text-2xl font-bold text-green-300">→</p>
                    </div>
                  </div>
                </div>

                {/* Next Track Info */}
                <div className="flex items-center gap-3">
                  {nextTrack?.album?.images?.[0]?.url && (
                    <img
                      src={nextTrack.album.images[0].url}
                      alt={nextTrack.name}
                      className="w-12 h-12 rounded"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{nextTrack?.name}</p>
                    <p className="text-xs text-gray-400">{nextTrack?.artists[0]?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Next</p>
                    <p className="text-sm font-semibold">{nextTrack?.audioFeatures?.tempo?.toFixed(0) || "?"} bpm</p>
                  </div>
                </div>
              </div>

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
                  {transitionRecommendations.map((transition: any, index: number) => (
                    <button
                      key={index}
                      onClick={() => executeTransition(transition)}
                      disabled={isTransitioning}
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-all relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed ${
                        index === 0
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
                    </button>
                  ))}
                </div>
                {!isTransitioning && (
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    Click a transition type to mix into the next track
                  </p>
                )}
              </div>

              {/* Additional Info */}
              {transitionRecommendations.length > 0 && (
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold">AI</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold mb-1">Recommended: {transitionRecommendations[0]?.name}</p>
                      <p className="text-xs text-gray-400">{transitionRecommendations[0]?.reason}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Transition starts {transitionRecommendations[0]?.startTime}s before current track ends
                      </p>
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
          <h2 className="text-lg font-bold">Queue</h2>
          <p className="text-sm text-gray-400">{queue.length - currentIndex} tracks</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Current Queue - only show current and upcoming tracks */}
          {queue.slice(currentIndex).map((track, relativeIndex) => {
            const actualIndex = currentIndex + relativeIndex;
            return (
              <div
                key={`${track.id}-${actualIndex}`}
                className={`p-3 border-b border-gray-800 ${
                  relativeIndex === 0 ? "bg-gray-800" : "hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center gap-3">
                  {track.album?.images?.[0]?.url && (
                    <img
                      src={track.album.images[0].url}
                      alt={track.name}
                      className="h-12 w-12"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {relativeIndex === 0 && "▶ "}
                      {track.name}
                    </p>
                    <p className="text-sm text-gray-400 truncate">
                      {track.artists.map(a => a.name).join(", ")}
                    </p>
                  </div>
                  {relativeIndex > 0 && (
                    <button
                      onClick={() => removeFromQueue(actualIndex)}
                      className="text-gray-400 hover:text-white text-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* AI Recommendation */}
          {nextTrack && (
            <div className="p-3 border-b border-gray-800 bg-gray-800">
              <div className="flex items-center gap-3">
                {nextTrack.album?.images?.[0]?.url && (
                  <img
                    src={nextTrack.album.images[0].url}
                    alt={nextTrack.name}
                    className="h-12 w-12"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{nextTrack.name}</p>
                  <p className="text-sm text-gray-400 truncate">
                    {nextTrack.artists.map(a => a.name).join(", ")}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{nextReason}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={addToQueue}
                  className="flex-1 bg-white text-black px-3 py-2 text-sm font-medium hover:bg-gray-200"
                >
                  Add to Queue
                </button>
                <button
                  onClick={skipToNext}
                  className="flex-1 bg-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-600"
                >
                  Play Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

