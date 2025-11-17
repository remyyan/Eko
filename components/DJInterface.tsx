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

interface DJInterfaceProps {
  track1: Track;
  track2: Track;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: any;
  }
}

export default function DJInterface({ track1, track2 }: DJInterfaceProps) {
  const { data: session } = useSession();
  const [isPlaying, setIsPlaying] = useState(false);
  const [crossfadePosition, setCrossfadePosition] = useState(50);
  const [volume1, setVolume1] = useState(100);
  const [volume2, setVolume2] = useState(100);
  const [bass1, setBass1] = useState(0);
  const [bass2, setBass2] = useState(0);
  const [treble1, setTreble1] = useState(0);
  const [treble2, setTreble2] = useState(0);
  const [pitch1, setPitch1] = useState(0);
  const [pitch2, setPitch2] = useState(0);
  const [currentTime1, setCurrentTime1] = useState(0);
  const [currentTime2, setCurrentTime2] = useState(0);
  const [duration1, setDuration1] = useState(0);
  const [duration2, setDuration2] = useState(0);
  const [player1, setPlayer1] = useState<any>(null);
  const [player2, setPlayer2] = useState<any>(null);

  // Load Spotify Web Playback SDK
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      if (!session?.accessToken) return;

      // Create Player 1
      const player1Instance = new window.Spotify.Player({
        name: "DJ Deck 1",
        getOAuthToken: (cb: (token: string) => void) => {
          cb(session.accessToken!);
        },
        volume: 0.5,
      });

      // Create Player 2
      const player2Instance = new window.Spotify.Player({
        name: "DJ Deck 2",
        getOAuthToken: (cb: (token: string) => void) => {
          cb(session.accessToken!);
        },
        volume: 0.5,
      });

      setPlayer1(player1Instance);
      setPlayer2(player2Instance);

      player1Instance.connect();
      player2Instance.connect();
    };

    return () => {
      document.body.removeChild(script);
    };
  }, [session?.accessToken]);

  // Play/pause both decks
  useEffect(() => {
    if (!player1 || !player2) return;

    if (isPlaying) {
      player1.resume();
      player2.resume();
    } else {
      player1.pause();
      player2.pause();
    }
  }, [isPlaying, player1, player2]);

  // Update volumes based on crossfader
  useEffect(() => {
    if (!player1 || !player2) return;

    const vol1 = (volume1 / 100) * (1 - crossfadePosition / 100);
    const vol2 = (volume2 / 100) * (crossfadePosition / 100);

    player1.setVolume(vol1);
    player2.setVolume(vol2);
  }, [volume1, volume2, crossfadePosition, player1, player2]);

  // Play tracks when players are ready
  useEffect(() => {
    if (!player1 || !player2) return;

    player1.addListener("player_ready", () => {
      player1.getCurrentState().then((state: any) => {
        if (!state) {
          player1.connect();
        }
      });
    });

    player2.addListener("player_ready", () => {
      player2.getCurrentState().then((state: any) => {
        if (!state) {
          player2.connect();
        }
      });
    });

    // Play track 1
    fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${session?.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: [`spotify:track:${track1.id}`],
        device_ids: [player1._options.id],
      }),
    });

    // Play track 2
    fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${session?.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: [`spotify:track:${track2.id}`],
        device_ids: [player2._options.id],
      }),
    });
  }, [player1, player2, track1.id, track2.id, session?.accessToken]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-lg bg-gradient-to-b from-gray-900 to-black p-8 shadow-2xl">
      <h2 className="mb-8 text-center text-3xl font-bold text-white">
        🎧 Live DJ Mixer
      </h2>

      {/* Dual Decks */}
      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Deck 1 */}
        <div className="rounded-lg border-2 border-purple-500/50 bg-black/50 p-6">
          <div className="mb-4 flex items-center gap-3">
            <img
              src={track1.album.images[0]?.url}
              alt={track1.name}
              className="h-16 w-16 rounded"
            />
            <div>
              <p className="text-sm text-gray-400">DECK 1</p>
              <p className="font-semibold text-purple-300">{track1.name}</p>
              <p className="text-xs text-gray-500">{track1.artists[0]?.name}</p>
            </div>
          </div>

          {/* Waveform Placeholder */}
          <div className="mb-4 h-12 rounded bg-gradient-to-r from-purple-900/30 to-purple-600/30 flex items-center px-4">
            <div className="text-xs text-gray-400">
              {formatTime(currentTime1)} / {formatTime(duration1)}
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400">Volume</label>
              <input
                type="range"
                min="0"
                max="100"
                value={volume1}
                onChange={(e) => setVolume1(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Bass</label>
              <input
                type="range"
                min="-12"
                max="12"
                value={bass1}
                onChange={(e) => setBass1(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Treble</label>
              <input
                type="range"
                min="-12"
                max="12"
                value={treble1}
                onChange={(e) => setTreble1(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Pitch</label>
              <input
                type="range"
                min="-12"
                max="12"
                value={pitch1}
                onChange={(e) => setPitch1(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Deck 2 */}
        <div className="rounded-lg border-2 border-blue-500/50 bg-black/50 p-6">
          <div className="mb-4 flex items-center gap-3">
            <img
              src={track2.album.images[0]?.url}
              alt={track2.name}
              className="h-16 w-16 rounded"
            />
            <div>
              <p className="text-sm text-gray-400">DECK 2</p>
              <p className="font-semibold text-blue-300">{track2.name}</p>
              <p className="text-xs text-gray-500">{track2.artists[0]?.name}</p>
            </div>
          </div>

          {/* Waveform Placeholder */}
          <div className="mb-4 h-12 rounded bg-gradient-to-r from-blue-900/30 to-blue-600/30 flex items-center px-4">
            <div className="text-xs text-gray-400">
              {formatTime(currentTime2)} / {formatTime(duration2)}
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400">Volume</label>
              <input
                type="range"
                min="0"
                max="100"
                value={volume2}
                onChange={(e) => setVolume2(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Bass</label>
              <input
                type="range"
                min="-12"
                max="12"
                value={bass2}
                onChange={(e) => setBass2(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Treble</label>
              <input
                type="range"
                min="-12"
                max="12"
                value={treble2}
                onChange={(e) => setTreble2(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Pitch</label>
              <input
                type="range"
                min="-12"
                max="12"
                value={pitch2}
                onChange={(e) => setPitch2(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Crossfader & Master Controls */}
      <div className="rounded-lg border-2 border-green-500/50 bg-black/50 p-6">
        <div className="mb-6">
          <label className="mb-3 block text-sm font-semibold text-green-400">
            🎚️ Crossfader
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={crossfadePosition}
            onChange={(e) => setCrossfadePosition(Number(e.target.value))}
            className="w-full"
          />
          <div className="mt-2 flex justify-between text-xs text-gray-400">
            <span>Deck 1</span>
            <span>{crossfadePosition}%</span>
            <span>Deck 2</span>
          </div>
        </div>

        {/* Play Button */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-full rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 px-8 py-4 text-2xl font-bold text-white transition-all hover:scale-105"
        >
          {isPlaying ? "⏸️ Pause" : "▶️ Play"}
        </button>
      </div>

    </div>
  );
}

