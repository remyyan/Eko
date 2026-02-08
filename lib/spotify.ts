/**
 * Spotify Web API Utilities
 * Used ONLY for searching tracks - not for audio features
 * Audio features come from ReccoBeats
 */

import { getReccoBeatsTrackWithFeatures } from "./reccobeats";

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get Spotify access token using Client Credentials flow
 */
async function getSpotifyToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials not configured");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Spotify token: ${error}`);
  }

  const data = await response.json();

  // Cache token (expires in 1 hour, we'll refresh 5 min early)
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}

/**
 * Search for a track on Spotify by name and artist
 */
export async function searchSpotifyTrack(
  trackName: string,
  artistName: string
): Promise<any | null> {
  try {
    const token = await getSpotifyToken();
    const query = `track:${trackName} artist:${artistName}`;

    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Spotify search failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.tracks?.items?.[0] || null;
  } catch (error) {
    console.error("Error searching Spotify:", error);
    return null;
  }
}

/**
 * Get audio features for a Spotify track
 * Returns real BPM, key, energy, danceability, etc.
 */
export async function getSpotifyAudioFeatures(
  trackId: string
): Promise<any | null> {
  try {
    const token = await getSpotifyToken();

    // Try Spotify first (may be restricted for dev apps)
    const response = await fetch(
      `https://api.spotify.com/v1/audio-features/${trackId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.ok) {
      const features = await response.json();
      console.log(`✓ Got Spotify audio features for track ${trackId}`);
      return features;
    }

    // If 403, Spotify has restricted this endpoint for dev mode apps
    if (response.status === 403) {
      console.log(`⚠ Spotify audio-features restricted (403) - this is expected for dev mode apps`);
      return null;
    }

    console.error(`Spotify audio features failed: ${response.status}`);
    return null;
  } catch (error) {
    console.error("Error getting Spotify audio features:", error);
    return null;
  }
}

/**
 * Get track with ReccoBeats audio features
 * Flow: Search Spotify → Get Spotify ID → Query ReccoBeats with Spotify ID
 */
export async function getSpotifyTrackWithFeatures(
  trackName: string,
  artistName: string
): Promise<{ track: any; features: any } | null> {
  try {
    // Step 1: Search Spotify to get Spotify ID
    console.log(`Searching Spotify for "${trackName}" by ${artistName}...`);
    const track = await searchSpotifyTrack(trackName, artistName);
    
    if (!track) {
      console.log(`Track not found on Spotify`);
      return null;
    }

    console.log(`✓ Found Spotify ID: ${track.id}`);

    // Step 2: Query ReccoBeats with Spotify ID
    const reccobeatsData = await getReccoBeatsTrackWithFeatures(track.id);
    
    if (!reccobeatsData?.features) {
      console.log(`✗ ReccoBeats doesn't have this track`);
      return null;
    }

    console.log(`✓ Got ReccoBeats features!`);
    return { track, features: reccobeatsData.features };
  } catch (error) {
    console.error("Error getting track with features:", error);
    return null;
  }
}

