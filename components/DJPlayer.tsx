"use client";

import { useEffect, useState } from "react";
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

    if (isPlaying) {
      player.pause();
    } else {
      // If never played before, start the current track
      if (!isPlaying && currentIndex === 0) {
        await playTrack(currentTrack);
      } else {
        player.resume();
      }
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

  const currentTrack = queue[currentIndex];

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Main Content - Now Playing */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            {currentTrack?.album?.images?.[0]?.url && (
              <img
                src={currentTrack.album.images[0].url}
                alt={currentTrack.name}
                className="mb-6 h-64 w-64 mx-auto"
              />
            )}
            <h1 className="text-3xl font-bold mb-2">{currentTrack?.name}</h1>
            <p className="text-lg text-gray-400 mb-4">
              {currentTrack?.artists.map(a => a.name).join(", ")}
            </p>
            {!deviceId && (
              <p className="text-sm text-gray-400 mb-4">Initializing player...</p>
            )}
            {deviceId && (
              <p className="text-sm text-gray-400 mb-4">Player ready</p>
            )}
            <button
              onClick={togglePlayPause}
              disabled={!deviceId}
              className="bg-white text-black px-8 py-3 font-semibold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="border-t border-gray-800 p-4">
          <div className="flex justify-between items-center">
            <button
              onClick={skipToNext}
              disabled={!deviceId || (!nextTrack && currentIndex >= queue.length - 1)}
              className="bg-gray-800 px-6 py-2 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip to Next
            </button>
            <button
              onClick={onStop}
              className="bg-gray-800 px-6 py-2 hover:bg-gray-700"
            >
              Stop Mix
            </button>
          </div>
        </div>
      </div>

      {/* Queue Sidebar */}
      <div className="w-96 border-l border-gray-800 bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-bold">Queue</h2>
          <p className="text-sm text-gray-400">{queue.length} tracks</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Current Queue */}
          {queue.map((track, index) => (
            <div
              key={`${track.id}-${index}`}
              className={`p-3 border-b border-gray-800 ${
                index === currentIndex ? "bg-gray-800" : "hover:bg-gray-800"
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
                    {index === currentIndex && "▶ "}
                    {track.name}
                  </p>
                  <p className="text-sm text-gray-400 truncate">
                    {track.artists.map(a => a.name).join(", ")}
                  </p>
                </div>
                {index > currentIndex && (
                  <button
                    onClick={() => removeFromQueue(index)}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

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

