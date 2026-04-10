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

// ─── Camelot Wheel ───────────────────────────────────────────────────────────
// Maps pitch class (0=C … 11=B) + mode (1=major, 0=minor) to a Camelot number.
// Compatible mixes: same position, ±1 number same letter, or same number diff letter.

const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];  // C→8B, C#→3B …
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];  // C→5A, C#→12A …

export function getCamelotPosition(
  key: number,
  mode: number
): { num: number; letter: string } | null {
  if (key < 0 || key > 11) return null;
  if (mode === 1) return { num: CAMELOT_MAJOR[key], letter: "B" };
  if (mode === 0) return { num: CAMELOT_MINOR[key], letter: "A" };
  return null;
}

/**
 * Returns 0-100 Camelot wheel compatibility score.
 * 100 = same key, 90 = ±1 step same letter (perfect 4th/5th),
 * 88 = same number diff letter (relative major/minor), lower = further away.
 */
export function camelotCompatibility(
  key1: number, mode1: number,
  key2: number, mode2: number
): number {
  const c1 = getCamelotPosition(key1, mode1);
  const c2 = getCamelotPosition(key2, mode2);
  if (!c1 || !c2) return 50; // unknown — neutral score
  if (c1.num === c2.num && c1.letter === c2.letter) return 100;
  if (c1.num === c2.num) return 88; // relative major/minor
  const dist = Math.min(Math.abs(c1.num - c2.num), 12 - Math.abs(c1.num - c2.num));
  if (dist === 1 && c1.letter === c2.letter) return 90;
  if (dist === 1) return 72;
  if (dist === 2 && c1.letter === c2.letter) return 60;
  if (dist === 2) return 45;
  if (dist === 3) return 32;
  return 20;
}

// ─────────────────────────────────────────────────────────────────────────────

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
 * Beat-matched drop:
 *  - Lead-in (first 2/3 of beats): outgoing stays at 100%, incoming audible at 40%
 *    so the DJ can hear it in the headphones / audience gets a taste.
 *  - Drop (final 1/3, snapped to a downbeat): fast decisive hard swap — out drops
 *    straight to 0, in jumps straight to 100 over 2 frames.
 * Great for tracks with strong downbeats or drops.
 */
export function beatMatchSchedule(bpm: number, beats = 12): TransitionSchedule {
  const totalBeats = Math.max(4, Math.round(beats));
  const beat = msPerBeat(bpm);
  const totalMs = totalBeats * beat;

  // Lead-in = first 2/3, drop = final 1/3 (min 2 beats)
  const dropBeats = Math.max(2, Math.round(totalBeats / 3));
  const leadInBeats = totalBeats - dropBeats;
  const dropStartMs = leadInBeats * beat;

  const frames: VolumeFrame[] = [];
  let t = 0;

  while (t <= totalMs) {
    let outVol: number;
    let inVol: number;

    if (t < dropStartMs) {
      // Lead-in: outgoing full, incoming at 40% so it can be heard
      const p = t / dropStartMs;
      outVol = 100;
      // Gentle linear rise from 0→40% so the blend builds naturally
      inVol = Math.round(p * 40);
    } else {
      // Drop: hard swap over 2 frames (one beat)
      const dropP = (t - dropStartMs) / (dropBeats * beat);
      outVol = dropP < 0.5 ? Math.round((1 - dropP * 2) * 100) : 0;
      inVol  = dropP < 0.5 ? Math.round(40 + dropP * 2 * 60) : 100;
    }

    frames.push({ timeMs: t, outVol, inVol, progress: (t / totalMs) * 100 });
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
 * Echo fade — simulates a delay/echo tail on the outgoing track by pulsing
 * its volume at the beat rate while it fades, creating a rhythmic disappearance.
 * The incoming track fades in smoothly underneath.
 */
export function echoFadeSchedule(bpm: number, beats = 16): TransitionSchedule {
  const totalBeats = Math.max(4, Math.round(beats));
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
 * Filter sweep — clean simulation of a DJ low-pass filter sweep:
 *  - Outgoing track: concave fade (stays loud early, then falls quickly) — 100→0
 *  - Incoming track: starts at 0, delayed until 40% through, then convex rise — 0→100
 * No resonance bump, no mid-dip hole. Tension builds as out fades, releases as in arrives.
 */
export function filterSweepSchedule(bpm: number, beats = 16): TransitionSchedule {
  const totalBeats = Math.max(4, Math.round(beats));
  const beat = msPerBeat(bpm);
  const totalMs = totalBeats * beat;
  const frames: VolumeFrame[] = [];
  let t = 0;

  while (t <= totalMs) {
    const p = t / totalMs;

    // Outgoing: concave fade — stays loud, then drops sharply
    // pow(1-p, 0.5) = square-root curve = fast initial drop, slow end → invert for concave
    // We want slow start, fast drop: use pow(1-p, 2) (convex going down = concave in loudness)
    const outVol = Math.round(Math.pow(1 - p, 1.8) * 100);

    // Incoming: delayed 40%, then convex rise (fast early, slow final settle)
    const inStart = 0.4;
    const inP = p < inStart ? 0 : (p - inStart) / (1 - inStart);
    // Convex: sqrt gives fast initial rise, natural settling
    const inVol = Math.round(Math.pow(inP, 0.55) * 100);

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
  camelotScore: number;
  bpmRatio: number;
} {
  const bpmA = currentFeatures?.tempo || 120;
  const bpmB = nextFeatures?.tempo || 120;

  // BPM compatibility: support half-time / double-time matching
  const ratio = bpmB / bpmA;
  const bpmRatio = ratio > 1.75 ? ratio / 2 : ratio < 0.57 ? ratio * 2 : ratio;
  // bpmRatio close to 1.0 = compatible, far from 1.0 = incompatible
  const bpmCompatible = Math.abs(bpmRatio - 1) < 0.07;  // within ~7%
  const bpmClose = Math.abs(bpmRatio - 1) < 0.15;

  // Camelot compatibility
  const keyA = currentFeatures?.key ?? -1;
  const modeA = currentFeatures?.mode ?? -1;
  const keyB = nextFeatures?.key ?? -1;
  const modeB = nextFeatures?.mode ?? -1;
  const camelotScore = (keyA >= 0 && keyB >= 0 && modeA >= 0 && modeB >= 0)
    ? camelotCompatibility(keyA, modeA, keyB, modeB)
    : 50;

  const energyCurrent = currentFeatures?.energy || 0.5;
  const energyNext = nextFeatures?.energy || 0.5;
  const avgBpm = (bpmA + bpmB) / 2;

  let recommendedType = "Crossfade";
  let transitionBeats = 16;
  const incomingCueOffsetSec = 0;

  if (bpmCompatible && camelotScore >= 88) {
    // Perfect match — long smooth crossfade or beat match
    recommendedType = camelotScore === 100 ? "Crossfade" : "Beat Match";
    transitionBeats = camelotScore === 100 ? 32 : 16;
  } else if (bpmClose) {
    // Close BPM — beat match regardless of key
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
  } else if (camelotScore < 45) {
    // Harmonically incompatible — quick crossfade to minimise clash
    recommendedType = "Crossfade";
    transitionBeats = 8;
  }

  // Shorter transitions for fast BPMs (>140 effective)
  if (avgBpm > 140) {
    transitionBeats = Math.max(8, transitionBeats - 4);
  }

  return { recommendedType, transitionBeats, incomingCueOffsetSec, camelotScore, bpmRatio };
}
