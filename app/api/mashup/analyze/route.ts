import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { camelotCompatibility, getCamelotPosition } from "@/lib/transitionEngine";

interface AudioFeatures {
  tempo: number;
  key: number;
  mode: number;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  time_signature: number;
}

interface Track {
  name: string;
  artists: { name: string }[];
  audioFeatures: AudioFeatures;
}

const keyNames = [
  "C",
  "C♯/D♭",
  "D",
  "D♯/E♭",
  "E",
  "F",
  "F♯/G♭",
  "G",
  "G♯/A♭",
  "A",
  "A♯/B♭",
  "B",
];

function camelotLabel(key: number, mode: number): string {
  const pos = getCamelotPosition(key, mode);
  return pos ? `${pos.num}${pos.letter}` : "?";
}

function calculateCompatibilityScore(
  track1: AudioFeatures,
  track2: AudioFeatures
): number {
  let score = 0;

  // BPM compatibility (40% weight) — supports half/double time
  const ratio = track2.tempo / track1.tempo;
  const normRatio = ratio > 1.75 ? ratio / 2 : ratio < 0.57 ? ratio * 2 : ratio;
  const bpmScore = Math.max(0, 100 - Math.abs(normRatio - 1) * 400);
  score += bpmScore * 0.4;

  // Key compatibility via Camelot wheel (30% weight)
  const keyScore = camelotCompatibility(track1.key, track1.mode, track2.key, track2.mode);
  score += keyScore * 0.3;

  // Energy compatibility (15% weight)
  const energyDiff = Math.abs(track1.energy - track2.energy);
  score += (1 - energyDiff) * 100 * 0.15;

  // Danceability compatibility (10% weight)
  const danceabilityDiff = Math.abs(track1.danceability - track2.danceability);
  score += (1 - danceabilityDiff) * 100 * 0.1;

  // Valence (mood) compatibility (5% weight)
  const valenceDiff = Math.abs(track1.valence - track2.valence);
  score += (1 - valenceDiff) * 100 * 0.05;

  return Math.round(score);
}

function generateBasicAnalysis(track1: Track, track2: Track, score: number): string {
  const bpmDiff = Math.abs(track1.audioFeatures.tempo - track2.audioFeatures.tempo);
  const keyScore = camelotCompatibility(
    track1.audioFeatures.key, track1.audioFeatures.mode,
    track2.audioFeatures.key, track2.audioFeatures.mode
  );
  const c1 = camelotLabel(track1.audioFeatures.key, track1.audioFeatures.mode);
  const c2 = camelotLabel(track2.audioFeatures.key, track2.audioFeatures.mode);

  let analysis = "";

  if (score >= 80) {
    analysis = "Excellent match! ";
  } else if (score >= 60) {
    analysis = "Good compatibility. ";
  } else {
    analysis = "Challenging mix. ";
  }

  // BPM analysis
  if (bpmDiff < 5) {
    analysis += "Tempos are very close — easy to beat-match. ";
  } else if (bpmDiff < 10) {
    analysis += "Minor tempo difference — slight BPM nudge needed. ";
  } else {
    analysis += `BPM difference of ${Math.round(bpmDiff)} — use a filter sweep or echo fade to bridge the gap. `;
  }

  // Camelot key analysis
  if (keyScore >= 100) {
    analysis += `Same Camelot key (${c1}) — perfect harmonic match.`;
  } else if (keyScore >= 88) {
    analysis += `Relative major/minor (${c1}↔${c2}) — blends naturally.`;
  } else if (keyScore >= 72) {
    analysis += `Adjacent Camelot keys (${c1}→${c2}) — harmonically safe mix.`;
  } else if (keyScore >= 45) {
    analysis += `Camelot keys ${c1}→${c2} are moderately compatible — short transition recommended.`;
  } else {
    analysis += `Keys ${c1}→${c2} clash on the Camelot wheel — use a quick cut or filter sweep.`;
  }

  return analysis;
}

export async function POST(request: Request) {
  try {
    const { track1, track2 } = await request.json();

    if (!track1 || !track2) {
      return NextResponse.json(
        { error: "Two tracks required" },
        { status: 400 }
      );
    }

    const compatibilityScore = calculateCompatibilityScore(
      track1.audioFeatures,
      track2.audioFeatures
    );

    // Get AI analysis using Google Gemini (FREE!)
    let aiAnalysis = "";

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const camelot1 = camelotLabel(track1.audioFeatures.key, track1.audioFeatures.mode);
        const camelot2 = camelotLabel(track2.audioFeatures.key, track2.audioFeatures.mode);
        const prompt = `You are a professional DJ assistant. Analyze these two tracks for mix compatibility:

Track 1: "${track1.name}" by ${track1.artists.map((a: any) => a.name).join(", ")}
- BPM: ${Math.round(track1.audioFeatures.tempo)}
- Key: ${keyNames[track1.audioFeatures.key]} ${track1.audioFeatures.mode === 1 ? "Major" : "Minor"} (Camelot: ${camelot1})
- Energy: ${Math.round(track1.audioFeatures.energy * 100)}%

Track 2: "${track2.name}" by ${track2.artists.map((a: any) => a.name).join(", ")}
- BPM: ${Math.round(track2.audioFeatures.tempo)}
- Key: ${keyNames[track2.audioFeatures.key]} ${track2.audioFeatures.mode === 1 ? "Major" : "Minor"} (Camelot: ${camelot2})
- Energy: ${Math.round(track2.audioFeatures.energy * 100)}%

Camelot wheel compatibility: ${camelot1} → ${camelot2}. Adjacent numbers (±1) on the same letter are harmonically safe. Same number, different letter = relative major/minor.

In 2-3 sentences tell the DJ: how well these mix, what transition style to use (crossfade/beat-match/filter sweep), and any BPM or key tips. Be direct and practical.`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        aiAnalysis = response.text();
      } catch (aiError) {
        console.error("Gemini API error:", aiError);
        // Fallback to basic analysis
        aiAnalysis = generateBasicAnalysis(track1, track2, compatibilityScore);
      }
    } else {
      // No Gemini key configured, use basic analysis
      aiAnalysis = generateBasicAnalysis(track1, track2, compatibilityScore);
    }

    return NextResponse.json({
      compatibilityScore,
      aiAnalysis,
      details: {
        bpmDiff: Math.abs(
          track1.audioFeatures.tempo - track2.audioFeatures.tempo
        ),
        keyDiff: Math.abs(track1.audioFeatures.key - track2.audioFeatures.key),
        energyDiff: Math.abs(
          track1.audioFeatures.energy - track2.audioFeatures.energy
        ),
        track1Key: `${keyNames[track1.audioFeatures.key]} ${track1.audioFeatures.mode === 1 ? "Major" : "Minor"}`,
        track2Key: `${keyNames[track2.audioFeatures.key]} ${track2.audioFeatures.mode === 1 ? "Major" : "Minor"}`,
      },
    });
  } catch (error) {
    console.error("Error analyzing mashup:", error);
    return NextResponse.json(
      { error: "Failed to analyze mashup" },
      { status: 500 }
    );
  }
}

