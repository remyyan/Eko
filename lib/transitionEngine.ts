/**
 * Transition Engine
 *
 * Calculates volume curves, BPM-synced timing, and cue points
 * for DJ-quality transitions using only YouTube IFrame volume control.
 *
 * Since YouTube's IFrame API doesn't expose raw audio, all "effects"
 * are achieved through carefully shaped volume automation curves
 * timed to the beat grid.
 */

/** Milliseconds per beat at a given BPM */
export function msPerBeat(bpm: number): number {
  return 60_000 / bpm;
}

/** Round a duration (ms) to the nearest N beats */
export function snapToBeats(durationMs: number, bpm: number, minBeats = 4): number {
  const beat = msPerBeat(bpm);
  const beats = Math.max(minBeats, Math.round(durationMs / beat));
  return beats * beat;
}

/**
 * Equal-power crossfade curves.
 * Linear volume fades cause a perceived dip in loudness at the midpoint.
 * Equal-power uses cos/sin curves so total perceived loudness stays constant.
 */
export function equalPowerCrossfade(progress: number): { out: number; in_: number } {
  const angle = progress * Math.PI / 2;
  return {
    out: Math.cos(angle),
    in_: Math.sin(angle),
  };
}

/**
 * S-curve (sigmoid) for smoother transitions that linger at the extremes.
 * Slow start, fast middle, slow end.
 */
export function sCurve(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Generate a full crossfade schedule: an array of { timeMs, outVol, inVol }
 * timed to the beat grid for buttery-smooth transitions.
 */
export interface VolumeFrame {
  timeMs: number;
  outVol: number;   // 0-100
  inVol: number;    // 0-100
  progress: number; // 0-1
}

export interface TransitionSchedule {
  frames: VolumeFrame[];
  totalDurationMs: number;
  /** How many ms into the incoming track to start (skip dead intro) */
  incomingCueOffsetMs: number;
  beatDurationMs: number;
  transitionBeats: number;
}

interface ScheduleOptions {
  bpm: number;
  transitionBeats?: number;
  /** Volume curve function: progress (0-1) → { out: 0-1, in_: 0-1 } */
  curveFn?: (progress: number) => { out: number; in_: number };
  /**
   * For multi-phase: pre-fade the incoming track at this volume (0-1)
   * for the first phaseFraction of the transition, then do the main curve.
   */
  preFadeInLevel?: number;
  preFadeFraction?: number;
  /** Skip N seconds of the incoming track's intro */
  incomingCueOffsetSec?: number;
}

const FRAME_INTERVAL_MS = 50; // ~20fps volume updates — smooth enough, light on CPU

export function buildCrossfadeSchedule(opts: ScheduleOptions): TransitionSchedule {
  const {
    bpm,
    transitionBeats = 16,
    curveFn = equalPowerCrossfade,
    preFadeInLevel = 0,
    preFadeFraction = 0,
    incomingCueOffsetSec = 0,
  } = opts;

  const beat = msPerBeat(bpm);
  const totalMs = transitionBeats * beat;
  const prePhaseMs = totalMs * preFadeFraction;
  const mainPhaseMs = totalMs - prePhaseMs;

  const frames: VolumeFrame[] = [];
  let t = 0;

  // Pre-phase: incoming track fades in gently underneath
  while (t < prePhaseMs) {
    const preProg = prePhaseMs > 0 ? t / prePhaseMs : 0;
    frames.push({
      timeMs: t,
      outVol: 100,
      inVol: Math.round(preFadeInLevel * 100 * sCurve(preProg)),
      progress: (t / totalMs) * 100,
    });
    t += FRAME_INTERVAL_MS;
  }

  // Main phase: the actual crossfade
  const mainStart = t;
  while (t <= totalMs) {
    const mainProg = mainPhaseMs > 0 ? (t - mainStart) / mainPhaseMs : 1;
    const clamped = Math.min(1, Math.max(0, mainProg));
    const { out, in_ } = curveFn(clamped);

    frames.push({
      timeMs: t,
      outVol: Math.round(out * 100),
      inVol: Math.round(Math.max(preFadeInLevel * 100, in_ * 100)),
      progress: (t / totalMs) * 100,
    });
    t += FRAME_INTERVAL_MS;
  }

  // Ensure we end cleanly
  if (frames.length > 0) {
    const last = frames[frames.length - 1];
    if (last.outVol !== 0 || last.inVol !== 100) {
      frames.push({ timeMs: totalMs, outVol: 0, inVol: 100, progress: 100 });
    }
  }

  return {
    frames,
    totalDurationMs: totalMs,
    incomingCueOffsetMs: incomingCueOffsetSec * 1000,
    beatDurationMs: beat,
    transitionBeats,
  };
}

// ─── Preset curve builders ───────────────────────────────────────────────

/**
 * Classic crossfade — equal-power curve over 16 beats.
 * Sounds smooth and professional; good for tracks with similar energy.
 */
export function crossfadeSchedule(bpm: number, beats = 16): TransitionSchedule {
  return buildCrossfadeSchedule({
    bpm,
    transitionBeats: beats,
    curveFn: equalPowerCrossfade,
  });
}

/**
 * Beat-matched drop — incoming track plays quietly underneath for 8 beats,
 * then a fast 4-beat equal-power swap right on the downbeat.
 * Great for tracks with strong downbeats or drops.
 */
export function beatMatchSchedule(bpm: number): TransitionSchedule {
  const dropBeats = 4;
  const leadInBeats = 8;
  const totalBeats = leadInBeats + dropBeats;

  return buildCrossfadeSchedule({
    bpm,
    transitionBeats: totalBeats,
    preFadeInLevel: 0.15,
    preFadeFraction: leadInBeats / totalBeats,
    curveFn: (p) => {
      // Fast S-curve swap
      const s = sCurve(p);
      return { out: 1 - s, in_: s };
    },
  });
}

/**
 * Echo fade — simulates a delay/echo tail on the outgoing track by pulsing
 * its volume at the beat rate while it fades, creating a rhythmic disappearance.
 * The incoming track fades in smoothly underneath.
 */
export function echoFadeSchedule(bpm: number): TransitionSchedule {
  const totalBeats = 16;
  const beat = msPerBeat(bpm);
  const totalMs = totalBeats * beat;
  const frames: VolumeFrame[] = [];
  let t = 0;

  // Pulse every 2 beats (half-bar) — wide enough for YouTube's setVolume latency
  const pulseInterval = beat * 2;

  while (t <= totalMs) {
    const progress = t / totalMs;
    // Envelope: smooth overall fade-out
    const envelope = Math.pow(1 - progress, 1.2);

    // Gentle cosine pulse every 2 beats (smooth rise and fall, not sharp spike)
    const pulsePhase = (t % pulseInterval) / pulseInterval;
    const pulse = 0.35 + 0.65 * Math.cos(pulsePhase * Math.PI * 2) * 0.5 + 0.5;

    const outVol = Math.round(Math.max(0, envelope * pulse * 100));
    const inVol = Math.round(sCurve(progress) * 100);

    frames.push({ timeMs: t, outVol, inVol, progress: progress * 100 });
    t += FRAME_INTERVAL_MS;
  }

  frames.push({ timeMs: totalMs, outVol: 0, inVol: 100, progress: 100 });

  return {
    frames,
    totalDurationMs: totalMs,
    incomingCueOffsetMs: 0,
    beatDurationMs: beat,
    transitionBeats: totalBeats,
  };
}

/**
 * Filter sweep — simulates a low-pass filter closing on the outgoing track
 * (volume dips in an S-curve with a mid-transition "whoosh" dip) while the
 * incoming track sweeps in from silence. Creates tension and release.
 */
export function filterSweepSchedule(bpm: number): TransitionSchedule {
  const totalBeats = 16;
  const beat = msPerBeat(bpm);
  const totalMs = totalBeats * beat;
  const frames: VolumeFrame[] = [];
  let t = 0;

  while (t <= totalMs) {
    const p = t / totalMs;

    // Outgoing: S-curve down with a resonance bump around 40-60%
    const baseOut = 1 - sCurve(p);
    const resonanceBump = Math.exp(-Math.pow((p - 0.45) * 6, 2)) * 0.15;
    const outVol = Math.round(Math.max(0, Math.min(1, baseOut + resonanceBump)) * 100);

    // Incoming: delayed start, fast S-curve in during second half
    const inStart = 0.3;
    const inP = p < inStart ? 0 : (p - inStart) / (1 - inStart);
    const inVol = Math.round(sCurve(inP) * 100);

    frames.push({ timeMs: t, outVol, inVol, progress: p * 100 });
    t += FRAME_INTERVAL_MS;
  }

  frames.push({ timeMs: totalMs, outVol: 0, inVol: 100, progress: 100 });

  return {
    frames,
    totalDurationMs: totalMs,
    incomingCueOffsetMs: 0,
    beatDurationMs: beat,
    transitionBeats: totalBeats,
  };
}

/**
 * Pick the best transition schedule based on audio features of both tracks.
 */
export function getSmartTransitionConfig(
  currentFeatures: any,
  nextFeatures: any
): {
  recommendedType: string;
  transitionBeats: number;
  incomingCueOffsetSec: number;
} {
  const bpmDiff = Math.abs(
    (currentFeatures?.tempo || 120) - (nextFeatures?.tempo || 120)
  );
  const energyCurrent = currentFeatures?.energy || 0.5;
  const energyNext = nextFeatures?.energy || 0.5;
  const energyDiff = Math.abs(energyCurrent - energyNext);

  let recommendedType = "Crossfade";
  let transitionBeats = 16;
  let incomingCueOffsetSec = 0;

  if (bpmDiff <= 3 && energyDiff < 0.15) {
    // Very similar tracks — long smooth crossfade
    recommendedType = "Crossfade";
    transitionBeats = 32;
  } else if (bpmDiff <= 8) {
    // Close BPM — beat match with a drop
    recommendedType = "Beat Match";
    transitionBeats = 12;
  } else if (energyNext > energyCurrent + 0.2) {
    // Building energy — filter sweep creates tension
    recommendedType = "Filter Sweep";
    transitionBeats = 16;
  } else if (energyNext < energyCurrent - 0.15) {
    // Dropping energy — echo fade lets the energy dissipate
    recommendedType = "Echo Fade";
    transitionBeats = 16;
  }

  // Shorter transitions for fast BPMs (>140)
  const avgBpm = ((currentFeatures?.tempo || 120) + (nextFeatures?.tempo || 120)) / 2;
  if (avgBpm > 140) {
    transitionBeats = Math.max(8, transitionBeats - 4);
  }

  return { recommendedType, transitionBeats, incomingCueOffsetSec };
}
