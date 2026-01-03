import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("id");

  if (!videoId) {
    return NextResponse.json({ error: "Video ID required" }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube API key not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?` +
        `part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("YouTube API error:", error);
      return NextResponse.json(
        { error: "YouTube API request failed" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const video = data.items?.[0];

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Estimate audio features based on video metadata
    const estimatedFeatures = estimateAudioFeatures(video);

    return NextResponse.json(estimatedFeatures);
  } catch (error) {
    console.error("YouTube video details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch video details" },
      { status: 500 }
    );
  }
}

function estimateAudioFeatures(video: any) {
  const title = video.snippet.title.toLowerCase();
  const description = video.snippet.description.toLowerCase();
  const tags = video.snippet.tags || [];
  
  // Generate consistent hash from video ID
  const hash = video.id.split('').reduce((acc: number, char: string) => 
    acc + char.charCodeAt(0), 0
  );

  // Estimate BPM (60-180 range)
  let tempo = 100 + (hash % 60);
  
  // Adjust based on genre hints in title/tags
  const genreHints = [...tags, title, description].join(' ').toLowerCase();
  
  if (genreHints.match(/slow|ballad|acoustic|piano/)) {
    tempo = Math.max(60, tempo - 30);
  } else if (genreHints.match(/fast|speed|drum|bass|edm|techno|house/)) {
    tempo = Math.min(180, tempo + 30);
  } else if (genreHints.match(/hip hop|rap|trap/)) {
    tempo = 70 + (hash % 30); // 70-100 BPM range
  } else if (genreHints.match(/dance|disco|pop/)) {
    tempo = 110 + (hash % 30); // 110-140 BPM range
  }

  // Estimate key (0-11 for C through B)
  const key = hash % 12;

  // Estimate mode (0 = minor, 1 = major)
  const mode = genreHints.match(/sad|dark|minor|melancholy/) ? 0 : 1;

  // Estimate energy (0-1)
  const viewCount = parseInt(video.statistics?.viewCount || '0');
  const popularity = Math.min(100, Math.log10(viewCount + 1) * 10);
  const energy = Math.min(1, Math.max(0, 0.4 + (popularity / 200) + ((hash % 30) / 100)));

  // Estimate danceability (0-1)
  let danceability = 0.5 + (popularity / 200) + ((hash % 20) / 100);
  if (genreHints.match(/dance|edm|house|disco|pop/)) {
    danceability = Math.min(1, danceability + 0.2);
  }
  danceability = Math.min(1, Math.max(0, danceability));

  // Estimate valence (happiness) (0-1)
  let valence = 0.5;
  if (genreHints.match(/happy|party|fun|upbeat/)) {
    valence = 0.7 + (hash % 30) / 100;
  } else if (genreHints.match(/sad|dark|emotional|cry/)) {
    valence = 0.2 + (hash % 30) / 100;
  }
  valence = Math.min(1, Math.max(0, valence));

  return {
    tempo,
    key,
    mode,
    energy,
    danceability,
    valence,
    acousticness: genreHints.match(/acoustic|piano|guitar/) ? 0.7 : 0.3,
    instrumentalness: genreHints.match(/instrumental|beat|no vocal/) ? 0.8 : 0.1,
    time_signature: 4,
  };
}

