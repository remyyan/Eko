"use client";

import { useState, useRef } from "react";

export default function AudioMashupGenerator() {
  const [track1, setTrack1] = useState<File | null>(null);
  const [track2, setTrack2] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mashupUrl, setMashupUrl] = useState<string | null>(null);
  const [mashupInfo, setMashupInfo] = useState<any>(null);

  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File | null, slot: 1 | 2) => {
    if (file && !file.type.includes("audio")) {
      setError("Please select an audio file (MP3, WAV, etc.)");
      return;
    }
    if (slot === 1) {
      setTrack1(file);
    } else {
      setTrack2(file);
    }
    setError(null);
  };

  const generateMashup = async () => {
    if (!track1 || !track2) {
      setError("Please select both audio files");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("track1", track1);
      formData.append("track2", track2);

      const response = await fetch("/api/mashup/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate mashup");
      }

      // Get mashup info from headers
      const info = response.headers.get("X-Mashup-Info");
      if (info) {
        setMashupInfo(JSON.parse(info));
      }

      // Create blob URL for audio
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setMashupUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate mashup");
    } finally {
      setLoading(false);
    }
  };

  const downloadMashup = () => {
    if (!mashupUrl) return;

    const a = document.createElement("a");
    a.href = mashupUrl;
    a.download = "mashup.mp3";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const resetForm = () => {
    setTrack1(null);
    setTrack2(null);
    setMashupUrl(null);
    setMashupInfo(null);
    setError(null);
    if (fileInputRef1.current) fileInputRef1.current.value = "";
    if (fileInputRef2.current) fileInputRef2.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="rounded-lg bg-gradient-to-br from-blue-900 to-purple-900 p-8 shadow-xl">
        <h2 className="mb-6 text-3xl font-bold text-white">
          🎵 Upload Audio Files
        </h2>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Track 1 Upload */}
          <div className="rounded-lg bg-black/30 p-6">
            <h3 className="mb-4 text-lg font-semibold text-blue-300">
              Track 1
            </h3>
            <div
              onClick={() => fileInputRef1.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-blue-400 p-8 text-center transition-all hover:border-blue-300 hover:bg-blue-900/20"
            >
              <input
                ref={fileInputRef1}
                type="file"
                accept="audio/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null, 1)}
                className="hidden"
              />
              {track1 ? (
                <div>
                  <p className="text-lg font-semibold text-green-400">✅ Selected</p>
                  <p className="text-sm text-gray-300">{track1.name}</p>
                  <p className="text-xs text-gray-400">
                    {(track1.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-2xl mb-2">📁</p>
                  <p className="text-gray-300">Click to upload audio file</p>
                  <p className="text-xs text-gray-400 mt-2">MP3, WAV, FLAC, etc.</p>
                </div>
              )}
            </div>
          </div>

          {/* Track 2 Upload */}
          <div className="rounded-lg bg-black/30 p-6">
            <h3 className="mb-4 text-lg font-semibold text-purple-300">
              Track 2
            </h3>
            <div
              onClick={() => fileInputRef2.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-purple-400 p-8 text-center transition-all hover:border-purple-300 hover:bg-purple-900/20"
            >
              <input
                ref={fileInputRef2}
                type="file"
                accept="audio/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null, 2)}
                className="hidden"
              />
              {track2 ? (
                <div>
                  <p className="text-lg font-semibold text-green-400">✅ Selected</p>
                  <p className="text-sm text-gray-300">{track2.name}</p>
                  <p className="text-xs text-gray-400">
                    {(track2.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-2xl mb-2">📁</p>
                  <p className="text-gray-300">Click to upload audio file</p>
                  <p className="text-xs text-gray-400 mt-2">MP3, WAV, FLAC, etc.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-900/50 p-4 text-red-200">
            ❌ {error}
          </div>
        )}

        {/* Generate Button */}
        <div className="mt-6 flex gap-4">
          <button
            onClick={generateMashup}
            disabled={!track1 || !track2 || loading}
            className="flex-1 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 px-8 py-4 font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> Generating Mashup...
              </span>
            ) : (
              "🎛️ Generate Mashup"
            )}
          </button>
          {(track1 || track2) && (
            <button
              onClick={resetForm}
              className="rounded-lg bg-gray-700 px-6 py-4 font-semibold text-white transition-all hover:bg-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Mashup Result */}
      {mashupUrl && (
        <div className="rounded-lg bg-gradient-to-br from-green-900 to-emerald-900 p-8 shadow-xl">
          <h2 className="mb-6 text-3xl font-bold text-white">
            ✅ Mashup Generated!
          </h2>

          {/* Mashup Info */}
          {mashupInfo && (
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-lg bg-black/30 p-4">
                <p className="text-sm text-gray-400">Track 1 BPM</p>
                <p className="text-2xl font-bold text-green-300">
                  {mashupInfo.track1_bpm.toFixed(1)}
                </p>
              </div>
              <div className="rounded-lg bg-black/30 p-4">
                <p className="text-sm text-gray-400">Track 2 BPM</p>
                <p className="text-2xl font-bold text-green-300">
                  {mashupInfo.track2_bpm.toFixed(1)}
                </p>
              </div>
              <div className="rounded-lg bg-black/30 p-4">
                <p className="text-sm text-gray-400">Target BPM</p>
                <p className="text-2xl font-bold text-green-300">
                  {mashupInfo.target_bpm.toFixed(1)}
                </p>
              </div>
              <div className="rounded-lg bg-black/30 p-4">
                <p className="text-sm text-gray-400">File Size</p>
                <p className="text-2xl font-bold text-green-300">
                  {mashupInfo.file_size_mb.toFixed(1)} MB
                </p>
              </div>
            </div>
          )}

          {/* Audio Player */}
          <div className="mb-6 rounded-lg bg-black/30 p-6">
            <p className="mb-3 text-sm text-gray-400">Preview:</p>
            <audio
              controls
              src={mashupUrl}
              className="w-full rounded-lg"
              style={{ accentColor: "#10b981" }}
            />
          </div>

          {/* Download Button */}
          <div className="flex gap-4">
            <button
              onClick={downloadMashup}
              className="flex-1 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 px-8 py-4 font-bold text-white transition-all hover:scale-105"
            >
              ⬇️ Download Mashup
            </button>
            <button
              onClick={resetForm}
              className="rounded-lg bg-gray-700 px-6 py-4 font-semibold text-white transition-all hover:bg-gray-600"
            >
              Create Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

