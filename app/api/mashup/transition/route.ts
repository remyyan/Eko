import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import Groq from "groq-sdk";

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function keyName(k: number, mode?: number): string {
  const note = KEY_NAMES[k] || "?";
  return mode === 0 ? `${note}m` : note;
}

/**
 * Compute beat-synced startTime (seconds before end) for a given
 * number of transition beats at a given BPM.
 */
function beatsToSeconds(beats: number, bpm: number): number {
  return Math.round((beats * 60) / bpm);
}

/**
 * Rate each transition type based on actual audio features.
 * Returns deterministic scores so the AI only needs to write the "reason" copy.
 */
function scoreTransitions(current: any, next: any) {
  const bpm1 = current?.tempo || 120;
  const bpm2 = next?.tempo || 120;
  const bpmDiff = Math.abs(bpm1 - bpm2);
  const e1 = current?.energy || 0.5;
  const e2 = next?.energy || 0.5;
  const eDiff = Math.abs(e1 - e2);
  const avgBpm = (bpm1 + bpm2) / 2;

  // Crossfade — best when tracks are similar
  const crossfadeScore = Math.round(
    Math.max(30, 95 - bpmDiff * 2.5 - eDiff * 40)
  );
  const crossfadeBeats = bpmDiff <= 5 && eDiff < 0.15 ? 32 : 16;

  // Beat Match — best when BPMs are very close
  const beatMatchScore = Math.round(
    bpmDiff <= 3 ? 95 : bpmDiff <= 8 ? 80 : Math.max(25, 70 - bpmDiff * 3)
  );

  // Echo Fade — best when energy is dropping
  const echoScore = Math.round(
    e2 < e1 ? Math.min(90, 75 + (e1 - e2) * 50) : Math.max(35, 65 - eDiff * 30)
  );

  // Filter Sweep — best when energy is building
  const sweepScore = Math.round(
    e2 > e1 ? Math.min(90, 75 + (e2 - e1) * 50) : Math.max(35, 65 - eDiff * 30)
  );

  return [
    {
      name: "Crossfade",
      rating: crossfadeScore,
      startTime: beatsToSeconds(crossfadeBeats, avgBpm),
      beats: crossfadeBeats,
    },
    {
      name: "Beat Match",
      rating: beatMatchScore,
      startTime: beatsToSeconds(12, avgBpm),
      beats: 12,
    },
    {
      name: "Echo Fade",
      rating: echoScore,
      startTime: beatsToSeconds(16, avgBpm),
      beats: 16,
    },
    {
      name: "Filter Sweep",
      rating: sweepScore,
      startTime: beatsToSeconds(16, avgBpm),
      beats: 16,
    },
  ];
}

export async function POST(request: NextRequest) {
  try {
    const { currentTrack, nextTrack } = await request.json();

    if (!currentTrack || !nextTrack) {
      return NextResponse.json(
        { error: "Both current and next track are required" },
        { status: 400 }
      );
    }

    const cacheKey = `transition-${currentTrack.id}-${nextTrack.id}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const cf = currentTrack.audioFeatures;
    const nf = nextTrack.audioFeatures;

    // Compute scores deterministically
    const scored = scoreTransitions(cf, nf);
    const recommended = [...scored].sort((a, b) => b.rating - a.rating)[0].name;

    // Ask the LLM only for the creative "reason" text
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const bpmDiff = Math.abs((cf?.tempo || 0) - (nf?.tempo || 0)).toFixed(1);
    const prompt = `You are a professional DJ writing SHORT transition notes (1 sentence each).

Current: "${currentTrack.name}" by ${currentTrack.artists[0]?.name} — ${Math.round(cf?.tempo || 0)} BPM, ${keyName(cf?.key, cf?.mode)}, ${Math.round((cf?.energy || 0) * 100)}% energy
Next: "${nextTrack.name}" by ${nextTrack.artists[0]?.name} — ${Math.round(nf?.tempo || 0)} BPM, ${keyName(nf?.key, nf?.mode)}, ${Math.round((nf?.energy || 0) * 100)}% energy
BPM gap: ${bpmDiff}

For each technique, write ONE sentence explaining why it works or doesn't for THIS specific pair. Be specific — mention the songs by name, reference the BPM/key/energy relationship.

Respond ONLY with JSON (no markdown):
{
  "reasons": {
    "Crossfade": "...",
    "Beat Match": "...",
    "Echo Fade": "...",
    "Filter Sweep": "..."
  }
}`;

    let reasons: Record<string, string> = {};
    try {
      const result = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 400,
      });
      const text = result.choices[0]?.message?.content || "";
      const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(clean);
      reasons = parsed.reasons || {};
    } catch {
      // Fall back to generic reasons if AI fails
    }

    const analysis = {
      transitions: scored.map((t) => ({
        ...t,
        reason: reasons[t.name] || `${t.name} transition over ${t.beats} beats`,
      })),
      recommended,
    };

    setCache(cacheKey, analysis);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Transition analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze transition" },
      { status: 500 }
    );
  }
}

