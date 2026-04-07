"use client";

import { useMemo, useRef, useCallback } from "react";

export interface CuePoint {
  positionMs: number;
  label: string;
  type: "phrase" | "drop" | "breakdown" | "outro" | "custom" | "intro" | "verse" | "chorus" | "prechorus" | "bridge" | "instrumental" | "hook" | "other";
  color: string;
  /** Transition quality score 0-100. Higher = better place to start a transition. */
  score?: number;
}

interface CuePointBarProps {
  position: number;          // current playback position in ms
  duration: number;          // total duration in ms
  bpm: number;
  cuePoints: CuePoint[];
  selectedCuePoint: CuePoint | null;
  onSeek: (positionMs: number) => void;
  onSelectCue: (cue: CuePoint) => void;
  onSetCustomCue: (positionMs: number) => void;
}

/**
 * Generate cue points at every phrase boundary (every 4 bars / 16 beats),
 * ranked by transition quality.
 */
export function generateCuePoints(durationMs: number, bpm: number): CuePoint[] {
  if (!durationMs || !bpm || durationMs < 5000) return [];

  const beatMs = 60_000 / bpm;
  const phraseMs = beatMs * 16;
  const points: CuePoint[] = [];

  const startOffset = phraseMs;
  const endLimit = durationMs - beatMs * 8;

  for (let t = startOffset; t < endLimit; t += phraseMs) {
    const pct = t / durationMs;
    const sec = Math.round(t / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    const timeLabel = `${min}:${s.toString().padStart(2, "0")}`;

    let score: number;
    let sectionLabel: string;
    let type: CuePoint["type"];

    if (pct < 0.10) {
      score = 20; sectionLabel = "Intro"; type = "phrase";
    } else if (pct < 0.22) {
      score = 50; sectionLabel = "Verse 1"; type = "phrase";
    } else if (pct >= 0.22 && pct < 0.30) {
      score = 70; sectionLabel = "Post-chorus"; type = "phrase";
    } else if (pct >= 0.30 && pct < 0.43) {
      score = 55; sectionLabel = "Verse 2"; type = "phrase";
    } else if (pct >= 0.43 && pct < 0.57) {
      score = 90; sectionLabel = "Breakdown"; type = "breakdown";
    } else if (pct >= 0.57 && pct < 0.70) {
      score = 60; sectionLabel = "Build"; type = "phrase";
    } else if (pct >= 0.70 && pct < 0.80) {
      score = 75; sectionLabel = "Last Chorus"; type = "phrase";
    } else if (pct >= 0.80 && pct < 0.92) {
      score = 95; sectionLabel = "Outro"; type = "outro";
    } else {
      score = 40; sectionLabel = "Phrase"; type = "phrase";
    }

    let color: string;
    if (score >= 85) color = "#ef4444";       // red — best transition zones
    else if (score >= 65) color = "#f97316";   // orange
    else if (score >= 45) color = "#eab308";   // yellow
    else color = "#555555";                    // muted

    points.push({
      positionMs: t,
      label: `${sectionLabel} · ${timeLabel}`,
      type,
      color,
      score,
    });
  }

  return points;
}

function formatTime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}:${s.toString().padStart(2, "0")}`;
}

export default function CuePointBar({
  position,
  duration,
  bpm,
  cuePoints,
  selectedCuePoint,
  onSeek,
  onSelectCue,
  onSetCustomCue,
}: CuePointBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const pctFromMs = useCallback(
    (ms: number) => (duration > 0 ? (ms / duration) * 100 : 0),
    [duration]
  );

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || !duration) return;
      const rect = barRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      const ms = pct * duration;
      onSeek(ms);
    },
    [duration, onSeek]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || !duration) return;
      const rect = barRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      const ms = pct * duration;

      const beatMs = 60_000 / (bpm || 120);
      const snapped = Math.round(ms / beatMs) * beatMs;

      onSetCustomCue(snapped);
    },
    [duration, bpm, onSetCustomCue]
  );

  const playPct = pctFromMs(position);

  return (
    <div className="space-y-1">
      {/* Time labels */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-[#888] w-10 text-right font-mono">
          {formatTime(position)}
        </span>

        {/* Main bar container */}
        <div className="flex-1 relative">
          {/* Clickable bar */}
          <div
            ref={barRef}
            className="relative h-8 bg-[#111] rounded cursor-pointer group border border-[#1a1a1a]"
            onClick={handleBarClick}
            onDoubleClick={handleDoubleClick}
          >
            {/* Progress fill */}
            <div
              className="absolute top-0 left-0 h-full bg-[#1a1a1a] rounded-l transition-all duration-100"
              style={{ width: `${playPct}%` }}
            />

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 transition-all duration-100"
              style={{ left: `${playPct}%` }}
            />

            {/* Cue point markers */}
            {cuePoints.map((cue, i) => {
              const pct = pctFromMs(cue.positionMs);
              const isSelected = selectedCuePoint?.positionMs === cue.positionMs;
              const score = cue.score ?? 50;
              const isTop = score >= 85;
              const isGood = score >= 65;
              const baseSize = isTop ? 4 : isGood ? 3 : 2;
              const lineOpacity = isTop ? 0.7 : isGood ? 0.45 : 0.2;

              return (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCue(cue);
                  }}
                  className="absolute top-0 bottom-0 z-20 group/cue flex items-center"
                  style={{ left: `${pct}%` }}
                  title={cue.label}
                >
                  {/* Marker line */}
                  <div
                    className="w-0.5 transition-all group-hover/cue:opacity-100"
                    style={{
                      backgroundColor: cue.color,
                      opacity: isSelected ? 1 : lineOpacity,
                      height: isTop ? "100%" : isGood ? "70%" : "45%",
                      position: "absolute",
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                  />
                  {/* Marker diamond */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rotate-45 transition-all ${
                      isSelected ? "ring-1 ring-white/40 scale-125" : "group-hover/cue:scale-125"
                    }`}
                    style={{
                      width: `${baseSize * (isSelected ? 3.5 : 2.5)}px`,
                      height: `${baseSize * (isSelected ? 3.5 : 2.5)}px`,
                      backgroundColor: cue.color,
                    }}
                  />
                  {/* Star badge for top picks */}
                  {isTop && (
                    <div
                      className="absolute -top-0.5 -translate-x-1/2 text-[7px] leading-none"
                      style={{ color: cue.color }}
                    >
                      ★
                    </div>
                  )}
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/cue:block z-30">
                    <div className="bg-[#111] border border-[#222] rounded px-2 py-1.5 text-[9px] text-[#ccc] whitespace-nowrap shadow-lg space-y-0.5">
                      <div className="font-medium">{cue.label}</div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-10 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: cue.color }} />
                        </div>
                        <span className="font-mono" style={{ color: cue.color }}>{score}%</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* "Double-click to set cue" hint */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <span className="text-[8px] text-[#444] bg-[#0a0a0a]/90 px-2 py-0.5 rounded font-mono">
                double-click to set cue
              </span>
            </div>
          </div>

          {/* Selected cue label below bar */}
          <div className="relative h-4 mt-0.5">
            {selectedCuePoint && (
              <div
                className="absolute text-[9px] font-medium -translate-x-1/2 whitespace-nowrap flex items-center gap-1 font-mono"
                style={{
                  left: `${pctFromMs(selectedCuePoint.positionMs)}%`,
                  color: selectedCuePoint.color,
                }}
              >
                ▲ {selectedCuePoint.label}
                {selectedCuePoint.score != null && (
                  <span className="opacity-60">· {selectedCuePoint.score}%</span>
                )}
              </div>
            )}
          </div>
        </div>

        <span className="text-[10px] text-[#555] w-10 font-mono">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
