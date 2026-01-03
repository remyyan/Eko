"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";

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
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: any;
  }
}

export default function DJPlayer({ initialTrack, onStop }: DJPlayerProps) {
  const { data: session } = useSession();
  const [queue, setQueue] = useState<Track[]>([initialTrack]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [nextTrack, setNextTrack] = useState<Track | null>(null);
  const [nextReason, setNextReason] = useState<string>("");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionRecommendations, setTransitionRecommendations] = useState<any[]>([]);
  const lastTransitionPairRef = useRef<string>("");

  const currentTrack = queue[currentIndex];

  // Load Spotify Web Playback SDK
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      if (!session?.accessToken) return;

      const playerInstance = new window.Spotify.Player({
        name: "DJ Live Mix",
        getOAuthToken: (cb: (token: string) => void) => {
          cb(session.accessToken!);
        },
        volume: 0.7,
      });

      // Player is ready
      playerInstance.addListener("ready", ({ device_id }: { device_id: string }) => {
        console.log("Ready with Device ID", device_id);
        setDeviceId(device_id);
      });

      // Player not ready
      playerInstance.addListener("not_ready", ({ device_id }: { device_id: string }) => {
        console.log("Device ID has gone offline", device_id);
      });

      // Player state changed
      playerInstance.addListener("player_state_changed", (state: any) => {
        if (!state) return;
        setIsPlaying(!state.paused);
        setPosition(state.position);
        setDuration(state.duration);
      });

      // Error listeners
      playerInstance.addListener("initialization_error", ({ message }: any) => {
        console.error("Spotify Player initialization error:", message);
      });

      playerInstance.addListener("authentication_error", ({ message }: any) => {
        console.error("Spotify Player authentication error:", message);
      });

      playerInstance.addListener("account_error", ({ message }: any) => {
        console.error("Spotify Player account error:", message);
      });

      playerInstance.addListener("playback_error", ({ message }: any) => {
        console.error("Spotify Player playback error:", message);
      });

      setPlayer(playerInstance);
      playerInstance.connect();
    };

    return () => {
      if (player) {
        player.disconnect();
      }
    };
  }, [session?.accessToken]);

  // Update position regularly while playing
  useEffect(() => {
    if (!player) return;

    const interval = setInterval(async () => {
      try {
        const state = await player.getCurrentState();
        if (state) {
          setPosition(state.position);
          setDuration(state.duration);
          setIsPlaying(!state.paused);
        }
      } catch (error) {
        // Silently ignore errors - player might not be ready yet
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [player]);

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
    if (!player || !deviceId) {
      console.error("Player or device not ready");
      return;
    }
    try {
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [`spotify:track:${track.id}`] }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Failed to play track:", error);
        alert(`Failed to play track: ${error.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Failed to play track:", error);
      alert("Failed to play track. Make sure you have Spotify Premium.");
    }
  };

  const togglePlayPause = async () => {
    if (!player || !deviceId) {
      console.error("Player or device not ready", { player: !!player, deviceId });
      return;
    }

    try {
      const state = await player.getCurrentState();
      console.log("Current player state:", state);

      if (!state) {
        // No track loaded, play current track
        console.log("No state, playing current track:", currentTrack?.name);
        await playTrack(currentTrack);
      } else if (state.paused) {
        // Track is paused, resume it
        console.log("Resuming playback");
        await player.resume();
      } else {
        // Track is playing, pause it
        console.log("Pausing playback");
        await player.pause();
      }
    } catch (error) {
      console.error("Toggle play/pause failed:", error);
    }
  };

  const stopPlayback = async () => {
    if (!player) return;

    try {
      await player.pause();
      await player.seek(0);
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
    if (!player) return;
    try {
      await player.seek(positionMs);
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
    if (!nextTrack || !player || !deviceId) return;

    setIsTransitioning(true);
    console.log(`Executing ${transition.name} transition`);

    try {
      // Calculate transition start time
      const transitionStartTime = duration - (transition.startTime * 1000);

      // Seek to transition point if not already there
      if (position < transitionStartTime - 1000) {
        console.log(`Seeking to ${transition.startTime}s before end`);
        await player.seek(transitionStartTime);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Quick fade out over 2 seconds
      console.log("Fading out current track...");
      const fadeSteps = 20;
      const fadeInterval = 100; // 100ms per step = 2 seconds total

      for (let i = 0; i <= fadeSteps; i++) {
        const volume = 0.7 * (1 - (i / fadeSteps));
        await player.setVolume(volume);
        await new Promise(resolve => setTimeout(resolve, fadeInterval));
      }

      // Determine which track to play next
      let trackToPlay = nextTrack;
      if (currentIndex < queue.length - 1) {
        const nextIdx = currentIndex + 1;
        setCurrentIndex(nextIdx);
        trackToPlay = queue[nextIdx];
      } else {
        setQueue(prevQueue => [...prevQueue, nextTrack]);
        setCurrentIndex(prevIdx => prevIdx + 1);
      }

      // Start next track at low volume
      console.log("Starting next track:", trackToPlay.name);
      await player.setVolume(0);
      await playTrack(trackToPlay);

      // Wait for track to start
      await new Promise(resolve => setTimeout(resolve, 800));

      // Quick fade in over 2 seconds
      console.log("Fading in next track...");
      for (let i = 0; i <= fadeSteps; i++) {
        const volume = 0.7 * (i / fadeSteps);
        await player.setVolume(volume);
        await new Promise(resolve => setTimeout(resolve, fadeInterval));
      }

      console.log("Transition complete!");
      setIsTransitioning(false);
    } catch (error) {
      console.error("Transition failed:", error);
      // Reset volume
      try {
        await player.setVolume(0.7);
      } catch (e) {
        // Ignore
      }
      setIsTransitioning(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
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
                disabled={!deviceId}
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
              {!deviceId && (
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
                      {isTransitioning && index === 0 && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                          <span className="text-xs">Mixing...</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
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

