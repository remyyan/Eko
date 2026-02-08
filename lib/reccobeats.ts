/**
 * ReccoBeats API Integration
 * No API key required - public API
 */

const RECCOBEATS_API_BASE = "https://api.reccobeats.com";

/**
 * Get audio features from ReccoBeats using Spotify track ID
 * Two-step process:
 * 1. Lookup track by Spotify ID to get ReccoBeats ID
 * 2. Get audio features using ReccoBeats ID
 */
export async function getReccoBeatsAudioFeatures(
  spotifyTrackId: string
): Promise<any | null> {
  try {
    // Step 1: Lookup track by Spotify ID to get ReccoBeats ID
    const lookupUrl = `${RECCOBEATS_API_BASE}/v1/track?ids=${spotifyTrackId}`;
    
    const lookupResponse = await fetch(lookupUrl, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!lookupResponse.ok) {
      console.error(`ReccoBeats track lookup failed: ${lookupResponse.status}`);
      return null;
    }

    const lookup = await lookupResponse.json();
    const reccoId = lookup.content?.[0]?.id;
    
    if (!reccoId) {
      console.log(`No ReccoBeats track found for Spotify ID: ${spotifyTrackId}`);
      return null;
    }

    // Step 2: Get audio features using ReccoBeats ID
    const featuresUrl = `${RECCOBEATS_API_BASE}/v1/track/${reccoId}/audio-features`;
    
    const featuresResponse = await fetch(featuresUrl, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!featuresResponse.ok) {
      console.error(`ReccoBeats audio features failed: ${featuresResponse.status}`);
      return null;
    }

    const features = await featuresResponse.json();

    // Normalize to our format
    return {
      tempo: features.tempo || features.bpm,
      key: features.key,
      mode: features.mode,
      energy: features.energy,
      danceability: features.danceability,
      valence: features.valence || features.mood,
      acousticness: features.acousticness,
      instrumentalness: features.instrumentalness,
      loudness: features.loudness,
      speechiness: features.speechiness,
      liveness: features.liveness,
      time_signature: features.timeSignature || features.time_signature || 4,
      source: "reccobeats",
    };
  } catch (error) {
    console.error("ReccoBeats audio features error:", error);
    return null;
  }
}

/**
 * Get track with features using Spotify ID
 */
export async function getReccoBeatsTrackWithFeatures(
  spotifyTrackId: string
): Promise<{ features: any } | null> {
  const features = await getReccoBeatsAudioFeatures(spotifyTrackId);
  
  if (!features) {
    return null;
  }

  return { features };
}
