"use client";

import { useState } from "react";

interface Track {
  name: string;
  artists: { name: string }[];
  audioFeatures: any;
}

interface MashupCreatorProps {
  track1: Track;
  track2: Track;
  compatibilityScore: number;
}

export default function MashupCreator({
  track1,
  track2,
  compatibilityScore,
}: MashupCreatorProps) {
  const [mashupData, setMashupData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState(0);

  const createMashup = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/mashup/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track1,
          track2,
          compatibilityScore,
        }),
      });
      const data = await response.json();
      setMashupData(data);
    } catch (error) {
      console.error("Failed to create mashup:", error);
    }
    setLoading(false);
  };

  if (!mashupData) {
    return (
      <div className="mt-8 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 p-8 text-white shadow-xl">
        <h2 className="mb-4 text-2xl font-bold">🎛️ Create Mashup</h2>
        <p className="mb-6 text-purple-100">
          Ready to create a professional mashup? Get detailed instructions and
          transition techniques!
        </p>
        <button
          onClick={createMashup}
          disabled={loading}
          className="rounded-lg bg-white px-8 py-3 font-semibold text-purple-600 transition-all hover:bg-purple-50 hover:scale-105 disabled:opacity-50"
        >
          {loading ? "Generating..." : "🎵 Generate Mashup Instructions"}
        </button>
      </div>
    );
  }

  const { instructions, transitions, settings } = mashupData;

  return (
    <div className="mt-8 space-y-6">
      {/* Instructions Section */}
      <div className="rounded-lg bg-gradient-to-br from-blue-900 to-purple-900 p-6 shadow-xl">
        <h2 className="mb-4 text-2xl font-bold text-white">
          📋 Mashup Instructions
        </h2>
        <div className="space-y-2 rounded-lg bg-black/30 p-4">
          {instructions.map((instruction: string, index: number) => (
            <p
              key={index}
              className={`${
                instruction.startsWith("**") || instruction.startsWith("🎵")
                  ? "font-bold text-yellow-300"
                  : instruction.startsWith("✅")
                  ? "text-green-300"
                  : instruction.startsWith("⚠️")
                  ? "text-orange-300"
                  : instruction.startsWith("⚙️")
                  ? "text-blue-300"
                  : "text-gray-300"
              } ${instruction === "" ? "h-2" : ""}`}
            >
              {instruction}
            </p>
          ))}
        </div>
      </div>

      {/* Technical Settings */}
      <div className="rounded-lg bg-gradient-to-br from-green-900 to-teal-900 p-6 shadow-xl">
        <h2 className="mb-4 text-2xl font-bold text-white">
          ⚙️ Technical Settings
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-black/30 p-4">
            <h3 className="mb-2 font-semibold text-green-300">Target BPM</h3>
            <p className="text-3xl font-bold text-white">{settings.targetBPM}</p>
          </div>
          <div className="rounded-lg bg-black/30 p-4">
            <h3 className="mb-2 font-semibold text-green-300">
              Time Stretch (Track 1)
            </h3>
            <p className="text-3xl font-bold text-white">
              {settings.timeStretch.track1 > 0 ? "+" : ""}
              {settings.timeStretch.track1}%
            </p>
          </div>
          <div className="rounded-lg bg-black/30 p-4">
            <h3 className="mb-2 font-semibold text-green-300">
              Time Stretch (Track 2)
            </h3>
            <p className="text-3xl font-bold text-white">
              {settings.timeStretch.track2 > 0 ? "+" : ""}
              {settings.timeStretch.track2}%
            </p>
          </div>
          <div className="rounded-lg bg-black/30 p-4">
            <h3 className="mb-2 font-semibold text-green-300">
              Pitch Shift (Track 2)
            </h3>
            <p className="text-3xl font-bold text-white">
              {settings.keyShift.track2 > 0 ? "+" : ""}
              {settings.keyShift.track2} semitones
            </p>
          </div>
        </div>
      </div>

      {/* Transition Techniques */}
      <div className="rounded-lg bg-gradient-to-br from-pink-900 to-red-900 p-6 shadow-xl">
        <h2 className="mb-4 text-2xl font-bold text-white">
          🎚️ Transition Techniques
        </h2>
        
        {/* Transition Selector */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
          {transitions.map((transition: any, index: number) => (
            <button
              key={index}
              onClick={() => setSelectedTransition(index)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 font-semibold transition-all ${
                selectedTransition === index
                  ? "bg-white text-pink-600 scale-105"
                  : "bg-pink-800 text-white hover:bg-pink-700"
              }`}
            >
              {transition.name}
            </button>
          ))}
        </div>

        {/* Selected Transition Details */}
        <div className="rounded-lg bg-black/30 p-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">
                {transitions[selectedTransition].name}
              </h3>
              <p className="text-pink-200">
                {transitions[selectedTransition].description}
              </p>
            </div>
            <div className="text-right">
              <div className="rounded-lg bg-pink-600 px-3 py-1 text-sm font-semibold text-white">
                {transitions[selectedTransition].difficulty}
              </div>
              <div className="mt-1 text-xs text-pink-300">
                {transitions[selectedTransition].duration}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h4 className="mb-2 font-semibold text-pink-300">Steps:</h4>
            <ol className="space-y-2">
              {transitions[selectedTransition].steps.map(
                (step: string, index: number) => (
                  <li key={index} className="flex gap-3 text-gray-200">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-pink-600 text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                )
              )}
            </ol>
          </div>

          <div className="rounded-lg bg-pink-800/50 p-3">
            <p className="text-sm text-pink-100">
              <span className="font-semibold">Best for:</span>{" "}
              {transitions[selectedTransition].bestFor}
            </p>
            {transitions[selectedTransition].note && (
              <p className="mt-2 text-xs text-pink-200">
                ℹ️ {transitions[selectedTransition].note}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mix Points */}
      <div className="rounded-lg bg-gradient-to-br from-indigo-900 to-blue-900 p-6 shadow-xl">
        <h2 className="mb-4 text-2xl font-bold text-white">
          🎯 Suggested Mix Points
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {settings.mixPoints.map((point: any, index: number) => (
            <div
              key={index}
              className="rounded-lg bg-black/30 p-4 transition-all hover:bg-black/40"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl font-bold text-blue-300">
                  {point.time}
                </span>
                <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                  {point.type}
                </span>
              </div>
              <p className="text-sm text-gray-300">{point.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tools Recommendation */}
      <div className="rounded-lg bg-gradient-to-br from-yellow-900 to-orange-900 p-6 shadow-xl">
        <h2 className="mb-4 text-2xl font-bold text-white">
          🛠️ Recommended Tools
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-black/30 p-4">
            <h3 className="mb-2 font-semibold text-yellow-300">DJ Software</h3>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Ableton Live</li>
              <li>• FL Studio</li>
              <li>• Serato DJ</li>
              <li>• Traktor Pro</li>
            </ul>
          </div>
          <div className="rounded-lg bg-black/30 p-4">
            <h3 className="mb-2 font-semibold text-yellow-300">
              Stem Separation
            </h3>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Demucs (Free, AI)</li>
              <li>• Spleeter (Free)</li>
              <li>• iZotope RX</li>
              <li>• LALAL.AI</li>
            </ul>
          </div>
          <div className="rounded-lg bg-black/30 p-4">
            <h3 className="mb-2 font-semibold text-yellow-300">
              Time Stretching
            </h3>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Ableton Warp</li>
              <li>• Serato Pitch 'n Time</li>
              <li>• Rubber Band</li>
              <li>• Melodyne</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Reset Button */}
      <div className="text-center">
        <button
          onClick={() => setMashupData(null)}
          className="rounded-lg bg-gray-700 px-6 py-3 font-semibold text-white transition-all hover:bg-gray-600"
        >
          ← Back to Analysis
        </button>
      </div>
    </div>
  );
}

