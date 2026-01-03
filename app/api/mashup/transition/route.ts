import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { checkRateLimit } from "@/lib/rate-limiter";

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

    // Check rate limit before calling Gemini
    const rateLimit = checkRateLimit("gemini-transition");
    if (!rateLimit.allowed) {
      console.log(`Rate limit exceeded, using fallback. Retry after ${rateLimit.retryAfter}s`);
      const analysis = generateBasicTransitionAnalysis(currentTrack, nextTrack);
      setCache(cacheKey, analysis);
      return NextResponse.json(analysis);
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

    let analysis;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();

      // Remove markdown code blocks if present
      const cleanText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleanText);
    } catch (aiError: any) {
      console.error("Gemini API error:", aiError);

      // Fallback to basic analysis if AI fails (rate limit, etc.)
      analysis = generateBasicTransitionAnalysis(currentTrack, nextTrack);
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

// Fallback function for basic transition analysis
function generateBasicTransitionAnalysis(currentTrack: any, nextTrack: any) {
  const currentBPM = currentTrack.audioFeatures?.tempo || 120;
  const nextBPM = nextTrack.audioFeatures?.tempo || 120;
  const bpmDiff = Math.abs(currentBPM - nextBPM);

  const currentEnergy = currentTrack.audioFeatures?.energy || 0.5;
  const nextEnergy = nextTrack.audioFeatures?.energy || 0.5;
  const energyDiff = Math.abs(currentEnergy - nextEnergy);

  // Calculate ratings based on compatibility
  const crossfadeRating = Math.max(40, 100 - (energyDiff * 100));
  const beatMatchRating = Math.max(30, 100 - (bpmDiff * 2));
  const echoFadeRating = Math.max(50, 80 - (energyDiff * 50));
  const filterSweepRating = Math.max(45, 90 - (bpmDiff * 1.5));

  const transitions = [
    {
      name: "Crossfade",
      rating: Math.round(crossfadeRating),
      startTime: 15,
      reason: energyDiff < 0.2 ? "Similar energy levels make for smooth crossfade" : "Energy difference requires careful mixing"
    },
    {
      name: "Beat Match",
      rating: Math.round(beatMatchRating),
      startTime: 20,
      reason: bpmDiff < 5 ? "BPM is very close, perfect for beat matching" : `BPM difference of ${Math.round(bpmDiff)} requires adjustment`
    },
    {
      name: "Echo Fade",
      rating: Math.round(echoFadeRating),
      startTime: 12,
      reason: "Echo effects can help blend different energy levels"
    },
    {
      name: "Filter Sweep",
      rating: Math.round(filterSweepRating),
      startTime: 18,
      reason: "Filter sweep works well for building tension"
    }
  ];

  // Sort by rating and get recommended
  transitions.sort((a, b) => b.rating - a.rating);

  return {
    transitions,
    recommended: transitions[0].name
  };
}

