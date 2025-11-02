import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

function calculateCompatibilityScore(
  track1: AudioFeatures,
  track2: AudioFeatures
): number {
  let score = 0;

  // BPM compatibility (40% weight)
  const bpmDiff = Math.abs(track1.tempo - track2.tempo);
  const bpmScore = Math.max(0, 100 - bpmDiff);
  score += bpmScore * 0.4;

  // Key compatibility (30% weight)
  const keyDiff = Math.abs(track1.key - track2.key);
  const keyCompatible =
    keyDiff === 0 || // Same key
    keyDiff === 7 || // Perfect fifth
    keyDiff === 5 || // Perfect fourth
    keyDiff === 2 || // Whole step
    keyDiff === 10; // Minor third
  const keyScore = keyCompatible ? 100 : Math.max(0, 100 - keyDiff * 10);
  score += keyScore * 0.3;

  // Energy compatibility (15% weight)
  const energyDiff = Math.abs(track1.energy - track2.energy);
  const energyScore = (1 - energyDiff) * 100;
  score += energyScore * 0.15;

  // Danceability compatibility (10% weight)
  const danceabilityDiff = Math.abs(track1.danceability - track2.danceability);
  const danceabilityScore = (1 - danceabilityDiff) * 100;
  score += danceabilityScore * 0.1;

  // Valence (mood) compatibility (5% weight)
  const valenceDiff = Math.abs(track1.valence - track2.valence);
  const valenceScore = (1 - valenceDiff) * 100;
  score += valenceScore * 0.05;

  return Math.round(score);
}

function generateBasicAnalysis(track1: Track, track2: Track, score: number): string {
  const bpmDiff = Math.abs(track1.audioFeatures.tempo - track2.audioFeatures.tempo);
  const keyDiff = Math.abs(track1.audioFeatures.key - track2.audioFeatures.key);

  let analysis = "";

  if (score >= 80) {
    analysis = "Excellent match! ";
  } else if (score >= 60) {
    analysis = "Good compatibility. ";
  } else {
    analysis = "Challenging mashup. ";
  }

  // BPM analysis
  if (bpmDiff < 5) {
    analysis += "The tempos are very close, making this an easy mix. ";
  } else if (bpmDiff < 10) {
    analysis += "Minor tempo adjustment needed. ";
  } else {
    analysis += `Significant BPM difference (${Math.round(bpmDiff)} BPM) - consider using tempo stretching. `;
  }

  // Key analysis
  if (keyDiff === 0) {
    analysis += "Same key - perfect harmonic match!";
  } else if (keyDiff === 7 || keyDiff === 5) {
    analysis += "Keys are harmonically compatible (perfect fifth/fourth relationship).";
  } else if (keyDiff === 2) {
    analysis += "Keys are a whole step apart - should blend well.";
  } else {
    analysis += "Consider key shifting for better harmonic compatibility.";
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

    // Get AI analysis (with fallback if OpenAI is not configured)
    let aiAnalysis = "";

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-")) {
      try {
        const prompt = `You are a professional DJ assistant. Analyze these two tracks for mashup compatibility:

Track 1: "${track1.name}" by ${track1.artists.map((a: any) => a.name).join(", ")}
- BPM: ${Math.round(track1.audioFeatures.tempo)}
- Key: ${keyNames[track1.audioFeatures.key]} ${track1.audioFeatures.mode === 1 ? "Major" : "Minor"}
- Energy: ${Math.round(track1.audioFeatures.energy * 100)}%
- Danceability: ${Math.round(track1.audioFeatures.danceability * 100)}%
- Valence (mood): ${Math.round(track1.audioFeatures.valence * 100)}%

Track 2: "${track2.name}" by ${track2.artists.map((a: any) => a.name).join(", ")}
- BPM: ${Math.round(track2.audioFeatures.tempo)}
- Key: ${keyNames[track2.audioFeatures.key]} ${track2.audioFeatures.mode === 1 ? "Major" : "Minor"}
- Energy: ${Math.round(track2.audioFeatures.energy * 100)}%
- Danceability: ${Math.round(track2.audioFeatures.danceability * 100)}%
- Valence (mood): ${Math.round(track2.audioFeatures.valence * 100)}%

Provide a brief analysis (2-3 sentences) on:
1. How well these tracks would work together in a mashup
2. Specific techniques the DJ should use (tempo adjustment, key shifting, etc.)
3. What makes this combination work or not work

Keep it concise and practical for a DJ.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
        });

        aiAnalysis = completion.choices[0].message.content || "";
      } catch (aiError) {
        console.error("OpenAI API error:", aiError);
        // Fallback to basic analysis
        aiAnalysis = generateBasicAnalysis(track1, track2, compatibilityScore);
      }
    } else {
      // No OpenAI key configured, use basic analysis
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

