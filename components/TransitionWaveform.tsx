"use client";

import { useMemo } from "react";
import {
  crossfadeSchedule,
  beatMatchSchedule,
  echoFadeSchedule,
  filterSweepSchedule,
  type TransitionSchedule,
} from "@/lib/transitionEngine";

interface TransitionWaveformProps {
  currentTrackName: string;
  nextTrackName: string;
  bpm: number;
  transitionType: string;
  /** 0-100, drives the playhead during live transition */
  progress: number;
  /** Whether a transition is actively running */
  isLive: boolean;
  /** Where the outgoing cue point is as a fraction of its total duration (0-1). Shows context bars before the transition. */
  outgoingCuePct?: number;
  /** How many seconds into the incoming track to start */
  incomingStartSec?: number;
  /** Duration of the outgoing track in seconds */
  outgoingDurationSec?: number;
}

const BAR_COUNT = 80;
const BAR_GAP = 1;

/**
 * Deterministic pseudo-random number generator seeded by string.
 * Gives us consistent "waveform" shapes per track name.
 */
function seedRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Generate a waveform-like array of bar heights (0-1).
 * Uses smooth random walk so adjacent bars look natural.
 */
function generateWaveform(trackName: string, count: number): number[] {
  const rng = seedRandom(trackName);
  const bars: number[] = [];
  let value = 0.4 + rng() * 0.3;

  for (let i = 0; i < count; i++) {
    // Smooth random walk
    value += (rng() - 0.5) * 0.25;
    value = Math.max(0.08, Math.min(1, value));

    // Add micro-variation for texture
    const micro = 1 - rng() * 0.15;
    bars.push(value * micro);
  }
  return bars;
}

function getSchedule(type: string, bpm: number): TransitionSchedule {
  switch (type) {
    case "Beat Match":
      return beatMatchSchedule(bpm);
    case "Echo Fade":
      return echoFadeSchedule(bpm);
    case "Filter Sweep":
      return filterSweepSchedule(bpm);
    case "Crossfade":
    default:
      return crossfadeSchedule(bpm);
  }
}

/**
 * Sample the schedule's outVol/inVol at a given progress (0-1).
 */
function sampleSchedule(
  schedule: TransitionSchedule,
  progress: number
): { outVol: number; inVol: number } {
  const { frames } = schedule;
  if (frames.length === 0) return { outVol: 100, inVol: 0 };

  const targetTime = progress * schedule.totalDurationMs;

  // Binary search for the right frame
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timeMs <= targetTime) lo = mid;
    else hi = mid;
  }

  const f = frames[lo];
  const fNext = frames[hi];

  if (f.timeMs === fNext.timeMs) return { outVol: f.outVol, inVol: f.inVol };

  // Interpolate between frames
  const t = (targetTime - f.timeMs) / (fNext.timeMs - f.timeMs);
  return {
    outVol: f.outVol + (fNext.outVol - f.outVol) * t,
    inVol: f.inVol + (fNext.inVol - f.inVol) * t,
  };
}

export default function TransitionWaveform({
  currentTrackName,
  nextTrackName,
  bpm,
  transitionType,
  progress,
  isLive,
  outgoingCuePct,
  incomingStartSec = 0,
  outgoingDurationSec,
}: TransitionWaveformProps) {
  const outBars = useMemo(
    () => generateWaveform(currentTrackName, BAR_COUNT),
    [currentTrackName]
  );
  const inBars = useMemo(
    () => generateWaveform(nextTrackName, BAR_COUNT),
    [nextTrackName]
  );
  const schedule = useMemo(
    () => getSchedule(transitionType, bpm),
    [transitionType, bpm]
  );

  const durationSec = (schedule.totalDurationMs / 1000).toFixed(1);
  const playheadIdx = Math.floor((progress / 100) * BAR_COUNT);

  // Format cue point info for display
  const outCueLabel = outgoingCuePct != null && outgoingDurationSec
    ? (() => {
        const sec = Math.round(outgoingCuePct * outgoingDurationSec);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `from ${m}:${s.toString().padStart(2, "0")}`;
      })()
    : null;
  const inCueLabel = incomingStartSec > 0
    ? (() => {
        const m = Math.floor(incomingStartSec / 60);
        const s = Math.round(incomingStartSec) % 60;
        return `from ${m}:${s.toString().padStart(2, "0")}`;
      })()
    : null;

  return (
    <div className="bg-gray-900/80 rounded-lg border border-gray-800 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
          <span className="text-xs text-gray-400 truncate max-w-[120px]">
            {currentTrackName}
          </span>
          {outCueLabel && (
            <span className="text-[10px] text-purple-400/70">{outCueLabel}</span>
          )}
        </div>
        <span className="text-[10px] text-gray-500 px-2">
          {durationSec}s · {schedule.transitionBeats} beats
        </span>
        <div className="flex items-center gap-2">
          {inCueLabel && (
            <span className="text-[10px] text-emerald-400/70">{inCueLabel}</span>
          )}
          <span className="text-xs text-gray-400 truncate max-w-[120px]">
            {nextTrackName}
          </span>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
        </div>
      </div>

      {/* Waveform visualization */}
      <div className="relative h-20 flex items-center">
        {/* Bars */}
        <div className="absolute inset-0 flex items-center gap-px">
          {Array.from({ length: BAR_COUNT }).map((_, i) => {
            const barProgress = i / BAR_COUNT;
            const { outVol, inVol } = sampleSchedule(schedule, barProgress);

            const outHeight = outBars[i] * (outVol / 100);
            const inHeight = inBars[i] * (inVol / 100);

            const isAtPlayhead = isLive && i === playheadIdx;

            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center justify-center relative"
                style={{ height: "100%", gap: `${BAR_GAP}px` }}
              >
                {/* Outgoing track bar (top half, grows downward from center) */}
                <div className="flex-1 flex items-end justify-center w-full">
                  <div
                    className="w-full rounded-t-sm transition-all duration-75"
                    style={{
                      height: `${outHeight * 100}%`,
                      backgroundColor: isAtPlayhead
                        ? "#c084fc"
                        : `rgba(168, 85, 247, ${0.4 + outHeight * 0.6})`,
                      minHeight: outHeight > 0.01 ? "1px" : "0px",
                    }}
                  />
                </div>
                {/* Incoming track bar (bottom half, grows upward from center) */}
                <div className="flex-1 flex items-start justify-center w-full">
                  <div
                    className="w-full rounded-b-sm transition-all duration-75"
                    style={{
                      height: `${inHeight * 100}%`,
                      backgroundColor: isAtPlayhead
                        ? "#6ee7b7"
                        : `rgba(52, 211, 153, ${0.4 + inHeight * 0.6})`,
                      minHeight: inHeight > 0.01 ? "1px" : "0px",
                    }}
                  />
                </div>
                {/* Center line accent at playhead */}
                {isAtPlayhead && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-0.5 h-full bg-white/40 rounded" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Center divider line */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-700/50" />

        {/* Playhead line (live mode) */}
        {isLive && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white rounded shadow-lg shadow-white/20 z-10 transition-all duration-100"
            style={{ left: `${progress}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm bg-purple-500" />
          <span className="text-[10px] text-gray-500">Outgoing</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm bg-emerald-500" />
          <span className="text-[10px] text-gray-500">Incoming</span>
        </div>
      </div>
    </div>
  );
}
