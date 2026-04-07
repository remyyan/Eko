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

function generateWaveform(trackName: string, count: number): number[] {
  const rng = seedRandom(trackName);
  const bars: number[] = [];
  let value = 0.4 + rng() * 0.3;

  for (let i = 0; i < count; i++) {
    value += (rng() - 0.5) * 0.25;
    value = Math.max(0.08, Math.min(1, value));
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

function sampleSchedule(
  schedule: TransitionSchedule,
  progress: number
): { outVol: number; inVol: number } {
  const { frames } = schedule;
  if (frames.length === 0) return { outVol: 100, inVol: 0 };

  const targetTime = progress * schedule.totalDurationMs;

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
  const outSeed = `${currentTrackName}-${outgoingCuePct?.toFixed(2) ?? "end"}`;
  const inSeed = `${nextTrackName}-${incomingStartSec}`;
  const outBars = useMemo(() => generateWaveform(outSeed, BAR_COUNT), [outSeed]);
  const inBars = useMemo(() => generateWaveform(inSeed, BAR_COUNT), [inSeed]);
  const schedule = useMemo(
    () => getSchedule(transitionType, bpm),
    [transitionType, bpm]
  );

  const durationSec = (schedule.totalDurationMs / 1000).toFixed(1);
  const playheadIdx = Math.floor((progress / 100) * BAR_COUNT);

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
    <div className="bg-[#0d0d0d] rounded border border-[#1c1c1c] p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] text-[#888] truncate max-w-[120px] font-medium">
            {currentTrackName}
          </span>
          {outCueLabel && (
            <span className="text-[9px] text-red-400/50 font-mono">{outCueLabel}</span>
          )}
        </div>
        <span className="text-[9px] text-[#444] px-2 font-mono">
          {durationSec}s · {schedule.transitionBeats}b
        </span>
        <div className="flex items-center gap-2">
          {inCueLabel && (
            <span className="text-[9px] text-cyan-400/50 font-mono">{inCueLabel}</span>
          )}
          <span className="text-[10px] text-[#888] truncate max-w-[120px] font-medium">
            {nextTrackName}
          </span>
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
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
            const isPast = isLive && i < playheadIdx;

            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center justify-center relative"
                style={{ height: "100%", gap: `${BAR_GAP}px` }}
              >
                {/* Outgoing track bar (top half — RED) */}
                <div className="flex-1 flex items-end justify-center w-full">
                  <div
                    className="w-full rounded-t-sm transition-all duration-75"
                    style={{
                      height: `${outHeight * 100}%`,
                      backgroundColor: isAtPlayhead
                        ? "#fff"
                        : isPast
                        ? `rgba(239, 68, 68, ${0.15 + outHeight * 0.2})`
                        : `rgba(239, 68, 68, ${0.3 + outHeight * 0.7})`,
                      minHeight: outHeight > 0.01 ? "1px" : "0px",
                    }}
                  />
                </div>
                {/* Incoming track bar (bottom half — CYAN) */}
                <div className="flex-1 flex items-start justify-center w-full">
                  <div
                    className="w-full rounded-b-sm transition-all duration-75"
                    style={{
                      height: `${inHeight * 100}%`,
                      backgroundColor: isAtPlayhead
                        ? "#fff"
                        : isPast
                        ? `rgba(34, 211, 238, ${0.15 + inHeight * 0.2})`
                        : `rgba(34, 211, 238, ${0.3 + inHeight * 0.7})`,
                      minHeight: inHeight > 0.01 ? "1px" : "0px",
                    }}
                  />
                </div>
                {isAtPlayhead && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-0.5 h-full bg-white/60 rounded" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Center divider line */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-[#222]" />

        {/* Playhead line (live mode) */}
        {isLive && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white rounded z-10 transition-all duration-100"
            style={{ left: `${progress}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full" />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded-sm bg-red-500" />
          <span className="text-[9px] text-[#555] font-mono">OUT</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded-sm bg-cyan-400" />
          <span className="text-[9px] text-[#555] font-mono">IN</span>
        </div>
      </div>
    </div>
  );
}
