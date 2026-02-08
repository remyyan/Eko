import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import Groq from "groq-sdk";

export async function POST(request: NextRequest) {
  try {
    const { currentTrack, nextTrack } = await request.json();

    if (!currentTrack || !nextTrack) {
      return NextResponse.json(
        { error: "Both current and next track are required" },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = `transition-${currentTrack.id}-${nextTrack.id}`;
    const cached = getCached(cacheKey);
    if (cached) {
      console.log("Returning cached transition analysis");
      return NextResponse.json(cached);
    }

    // Use Groq for AI analysis (much higher free tier limits!)
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const prompt = `You are a professional DJ analyzing a transition between two tracks.

Current Track: "${currentTrack.name}" by ${currentTrack.artists[0]?.name}
- BPM: ${Math.round(currentTrack.audioFeatures?.tempo || 0)}
- Key: ${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][currentTrack.audioFeatures?.key] || currentTrack.audioFeatures?.key || "unknown"}
- Energy: ${Math.round((currentTrack.audioFeatures?.energy || 0) * 100)}%
- Danceability: ${Math.round((currentTrack.audioFeatures?.danceability || 0) * 100)}%

Next Track: "${nextTrack.name}" by ${nextTrack.artists[0]?.name}
- BPM: ${Math.round(nextTrack.audioFeatures?.tempo || 0)}
- Key: ${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][nextTrack.audioFeatures?.key] || nextTrack.audioFeatures?.key || "unknown"}
- Energy: ${Math.round((nextTrack.audioFeatures?.energy || 0) * 100)}%
- Danceability: ${Math.round((nextTrack.audioFeatures?.danceability || 0) * 100)}%

BPM Difference: ${Math.abs((currentTrack.audioFeatures?.tempo || 0) - (nextTrack.audioFeatures?.tempo || 0)).toFixed(1)} BPM
Energy Difference: ${Math.abs((currentTrack.audioFeatures?.energy || 0) - (nextTrack.audioFeatures?.energy || 0)) * 100}%

Analyze these tracks and recommend the best transition techniques. For each technique, provide:
1. A suitability rating (0-100%) - consider BPM compatibility, key harmony, and energy flow
2. The optimal transition start time (in seconds before the current track ends)
3. A brief reason why this technique works or doesn't work based on the audio features

Consider these 4 transition techniques:
- Crossfade: Smooth volume transition between tracks (best for similar energy/tempo)
- Beat Match: Sync BPM and align beats for seamless mixing (best for close BPM values)
- Echo Fade: Use echo effects to blend the tracks (works well with energy changes)
- Filter Sweep: Use frequency filters to transition (good for building tension)

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

    let analysis;

    try {
      const result = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 500,
      });

      const text = result.choices[0]?.message?.content || "";

      // Remove markdown code blocks if present
      const cleanText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleanText);
    } catch (aiError: any) {
      console.error("Groq API error:", aiError);
      throw aiError;
    }

    // Cache the result
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

