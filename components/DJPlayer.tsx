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
  const transitionTriggeredRef = useRef(false);

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

      setPlayer(playerInstance);
      playerInstance.connect();
    };

    return () => {
      if (player) {
        player.disconnect();
      }
    };
  }, [session?.accessToken]);

  // Update position regularly while playing and handle auto-transition
  useEffect(() => {
    if (!player) return;

    const interval = setInterval(async () => {
      const state = await player.getCurrentState();
      if (state) {
        setPosition(state.position);
        setDuration(state.duration);
        setIsPlaying(!state.paused);

        // Check if song is ending (within 2 seconds of end) and is playing
        const timeRemaining = state.duration - state.position;
        if (!state.paused && timeRemaining <= 2000 && timeRemaining > 0 && !transitionTriggeredRef.current) {
          transitionTriggeredRef.current = true;
          console.log("Auto-transitioning to next track...");

          // Auto-advance to next track
          if (currentIndex < queue.length - 1) {
            // Move to next track in queue
            const nextIdx = currentIndex + 1;
            setCurrentIndex(nextIdx);
            playTrack(queue[nextIdx]);
          } else if (nextTrack) {
            // If at end of queue, add next track and play it
            setQueue(prevQueue => [...prevQueue, nextTrack]);
            setCurrentIndex(prevIdx => prevIdx + 1);
            playTrack(nextTrack);
          }
        }

        // Reset transition flag when there's more than 5 seconds left
        if (timeRemaining > 5000) {
          transitionTriggeredRef.current = false;
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [player, currentIndex, queue, nextTrack]);

  // Get next track recommendation
  useEffect(() => {
    const getNextTrack = async () => {
      if (!queue[currentIndex]) return;
      try {
        const res = await fetch("/api/mashup/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track: queue[currentIndex] }),
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

  // Get transition recommendations when we have both tracks
  useEffect(() => {
    const getTransitionRecommendations = async () => {
      if (!currentTrack || !nextTrack) return;

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
    if (!player || !deviceId) return;

    try {
      const state = await player.getCurrentState();

      if (!state) {
        // No track loaded, play current track
        await playTrack(currentTrack);
      } else if (state.paused) {
        // Track is paused, resume it
        await player.resume();
      } else {
        // Track is playing, pause it
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

        {/* Bottom: Transition/Remix Hub */}
        <div className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">Transition/Remix Hub</h2>
          {transitionRecommendations.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <p className="mb-2">AI analyzing transition options...</p>
              <p className="text-sm">Add a track to the queue to see recommendations</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {transitionRecommendations.map((transition: any, index: number) => (
                <button
                  key={index}
                  className="bg-gray-800 border-2 border-gray-700 p-5 text-left hover:border-gray-600 rounded-lg transition-all relative overflow-hidden"
                >
                  {/* Color-coded rating bar */}
                  <div
                    className={`absolute top-0 left-0 h-1 ${getColorForRating(transition.rating)}`}
                    style={{ width: `${transition.rating}%` }}
                  />

                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg">{transition.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${getColorForRating(transition.rating)} text-white`}>
                        {transition.rating}%
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400 mb-2">
                    Start: {transition.startTime}s before end
                  </p>

                  <p className="text-sm text-gray-300">{transition.reason}</p>
                </button>
              ))}
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

