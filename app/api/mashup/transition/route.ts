import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { currentTrack, nextTrack } = await request.json();

    if (!currentTrack || !nextTrack) {
      return NextResponse.json(
        { error: "Both current and next track are required" },
        { status: 400 }
      );
    }

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are a professional DJ analyzing a transition between two tracks.

Current Track: "${currentTrack.name}" by ${currentTrack.artists[0]?.name}
- BPM: ${currentTrack.audioFeatures?.tempo || "unknown"}
- Key: ${currentTrack.audioFeatures?.key || "unknown"}
- Energy: ${currentTrack.audioFeatures?.energy || "unknown"}
- Danceability: ${currentTrack.audioFeatures?.danceability || "unknown"}

Next Track: "${nextTrack.name}" by ${nextTrack.artists[0]?.name}
- BPM: ${nextTrack.audioFeatures?.tempo || "unknown"}
- Key: ${nextTrack.audioFeatures?.key || "unknown"}
- Energy: ${nextTrack.audioFeatures?.energy || "unknown"}
- Danceability: ${nextTrack.audioFeatures?.danceability || "unknown"}

Analyze these tracks and recommend the best transition techniques. For each technique, provide:
1. A suitability rating (0-100%)
2. The optimal transition start time (in seconds before the current track ends)
3. A brief reason why this technique works or doesn't work

Consider these 4 transition techniques:
- Crossfade: Smooth volume transition between tracks
- Beat Match: Sync BPM and align beats for seamless mixing
- Echo Fade: Use echo effects to blend the tracks
- Filter Sweep: Use frequency filters to transition

Respond ONLY with JSON (no markdown):
{
  "transitions": [
    {
      "name": "Crossfade",
      "rating": 85,
      "startTime": 15,
      "reason": "Similar energy levels make for smooth crossfade"
    },
    {
      "name": "Beat Match",
      "rating": 70,
      "startTime": 20,
      "reason": "BPM difference is manageable"
    },
    {
      "name": "Echo Fade",
      "rating": 60,
      "startTime": 12,
      "reason": "Works but not ideal for this genre"
    },
    {
      "name": "Filter Sweep",
      "rating": 75,
      "startTime": 18,
      "reason": "Good for building tension"
    }
  ],
  "recommended": "Crossfade"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Remove markdown code blocks if present
    const cleanText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const analysis = JSON.parse(cleanText);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Transition analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze transition" },
      { status: 500 }
    );
  }
}

