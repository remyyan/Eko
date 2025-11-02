import { NextResponse } from "next/server";

/**
 * API endpoint to create mashup instructions
 * Since we can't access Spotify's audio files directly, this endpoint
 * generates detailed instructions for creating the mashup
 */
export async function POST(request: Request) {
  try {
    const { track1, track2, compatibilityScore } = await request.json();

    if (!track1 || !track2) {
      return NextResponse.json(
        { error: "Two tracks required" },
        { status: 400 }
      );
    }

    const bpmDiff = Math.abs(track1.audioFeatures.tempo - track2.audioFeatures.tempo);
    const keyDiff = Math.abs(track1.audioFeatures.key - track2.audioFeatures.key);

    // Generate mashup instructions
    const instructions = generateMashupInstructions(track1, track2, bpmDiff, keyDiff);
    
    // Generate transition suggestions
    const transitions = generateTransitionSuggestions(track1, track2, compatibilityScore);

    return NextResponse.json({
      instructions,
      transitions,
      settings: {
        targetBPM: Math.round((track1.audioFeatures.tempo + track2.audioFeatures.tempo) / 2),
        timeStretch: {
          track1: calculateTimeStretch(track1.audioFeatures.tempo, track2.audioFeatures.tempo),
          track2: calculateTimeStretch(track2.audioFeatures.tempo, track1.audioFeatures.tempo),
        },
        keyShift: {
          track1: 0,
          track2: calculateKeyShift(track1.audioFeatures.key, track2.audioFeatures.key),
        },
        mixPoints: generateMixPoints(track1, track2),
      },
    });
  } catch (error) {
    console.error("Error creating mashup:", error);
    return NextResponse.json(
      { error: "Failed to create mashup" },
      { status: 500 }
    );
  }
}

function generateMashupInstructions(track1: any, track2: any, bpmDiff: number, keyDiff: number): string[] {
  const instructions: string[] = [];

  instructions.push(`🎵 **Mashup: "${track1.name}" + "${track2.name}"**`);
  instructions.push("");

  // BPM matching
  if (bpmDiff < 5) {
    instructions.push("✅ **BPM Matching**: Minimal adjustment needed");
    instructions.push(`- Both tracks are close in tempo (~${Math.round(track1.audioFeatures.tempo)} BPM)`);
  } else if (bpmDiff < 15) {
    const targetBPM = Math.round((track1.audioFeatures.tempo + track2.audioFeatures.tempo) / 2);
    instructions.push("⚙️ **BPM Matching**: Moderate time-stretching required");
    instructions.push(`- Stretch Track 1 from ${Math.round(track1.audioFeatures.tempo)} to ${targetBPM} BPM`);
    instructions.push(`- Stretch Track 2 from ${Math.round(track2.audioFeatures.tempo)} to ${targetBPM} BPM`);
  } else {
    instructions.push("⚠️ **BPM Matching**: Significant time-stretching required");
    instructions.push(`- Large BPM difference: ${Math.round(bpmDiff)} BPM`);
    instructions.push("- Consider using half-time or double-time techniques");
  }

  instructions.push("");

  // Key matching
  if (keyDiff === 0) {
    instructions.push("✅ **Key Matching**: Perfect match - no pitch shifting needed");
  } else if (keyDiff === 7 || keyDiff === 5) {
    instructions.push("✅ **Key Matching**: Harmonically compatible (perfect fifth/fourth)");
    instructions.push("- Can mix without pitch shifting");
  } else {
    const semitones = calculateKeyShift(track1.audioFeatures.key, track2.audioFeatures.key);
    instructions.push(`⚙️ **Key Matching**: Pitch shift Track 2 by ${semitones} semitones`);
  }

  instructions.push("");
  instructions.push("🎚️ **Mixing Techniques**:");
  
  if (track1.audioFeatures.energy > 0.7 && track2.audioFeatures.energy > 0.7) {
    instructions.push("- Both tracks are high energy - use quick cuts or echo transitions");
  } else if (track1.audioFeatures.energy < 0.4 || track2.audioFeatures.energy < 0.4) {
    instructions.push("- Use long crossfades (8-16 beats) for smooth transitions");
  } else {
    instructions.push("- Use standard 4-8 beat crossfades");
  }

  instructions.push("- Apply EQ to separate frequency ranges");
  instructions.push("- Use filters (high-pass/low-pass) during transitions");

  return instructions;
}

function generateTransitionSuggestions(track1: any, track2: any, score: number): any[] {
  const transitions = [];

  // Transition 1: Echo Fade
  transitions.push({
    name: "Echo Fade Transition",
    duration: "8 beats",
    description: "Gradually fade out Track 1 with echo while fading in Track 2",
    steps: [
      "At 8 beats before transition point, add echo/delay to Track 1",
      "Increase echo feedback gradually",
      "Start fading in Track 2 at 4 beats before transition",
      "Apply high-pass filter to Track 1, low-pass to Track 2",
      "Complete transition on the downbeat",
    ],
    difficulty: "Easy",
    bestFor: score >= 70 ? "This mashup" : "High compatibility mashups",
  });

  // Transition 2: Filter Sweep
  transitions.push({
    name: "Filter Sweep Transition",
    duration: "4 beats",
    description: "Use filter sweeps to transition between tracks",
    steps: [
      "Apply low-pass filter to Track 1, gradually closing it",
      "Simultaneously apply high-pass filter to Track 2, gradually opening it",
      "Swap filters at the midpoint",
      "Complete transition with both tracks at full frequency range",
    ],
    difficulty: "Medium",
    bestFor: "Energetic tracks",
  });

  // Transition 3: Beat Drop
  transitions.push({
    name: "Beat Drop Transition",
    duration: "16 beats",
    description: "Build tension and drop into the new track",
    steps: [
      "Isolate drums from Track 1 for 8 beats",
      "Add riser/sweep effect",
      "Cut all audio for 1 beat (silence)",
      "Drop into Track 2 on the downbeat",
      "Bring in full mix immediately",
    ],
    difficulty: "Hard",
    bestFor: score >= 60 ? "This mashup (with practice)" : "Very compatible tracks",
  });

  // Transition 4: Acapella Blend
  if (track1.audioFeatures.instrumentalness < 0.5 && track2.audioFeatures.instrumentalness < 0.5) {
    transitions.push({
      name: "Acapella Blend",
      duration: "8-16 beats",
      description: "Use vocals from one track over instrumentals of another",
      steps: [
        "Isolate vocals from Track 1 using stem separation",
        "Isolate instrumentals from Track 2",
        "Layer vocals over instrumentals",
        "Adjust volume levels for balance",
        "Gradually fade in full Track 2",
      ],
      difficulty: "Hard",
      bestFor: "Tracks with strong vocals",
      note: "Requires stem separation tools (e.g., Spleeter, Demucs)",
    });
  }

  return transitions;
}

function calculateTimeStretch(sourceBPM: number, targetBPM: number): number {
  const ratio = targetBPM / sourceBPM;
  return Math.round((ratio - 1) * 100); // Return as percentage
}

function calculateKeyShift(key1: number, key2: number): number {
  let diff = key2 - key1;
  
  // Find the shortest path around the circle of fifths
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  
  return diff;
}

function generateMixPoints(track1: any, track2: any): any[] {
  // Generate suggested mix points based on track structure
  // In a real implementation, this would analyze the actual audio
  return [
    {
      time: "0:32",
      description: "First chorus - good entry point",
      type: "intro",
    },
    {
      time: "1:04",
      description: "Verse transition - smooth blend point",
      type: "verse",
    },
    {
      time: "1:36",
      description: "Build-up to chorus - high energy transition",
      type: "buildup",
    },
    {
      time: "2:08",
      description: "Chorus drop - powerful transition point",
      type: "drop",
    },
  ];
}

