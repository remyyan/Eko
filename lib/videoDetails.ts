/**
 * Fetch YouTube video details and estimate audio features.
 * Shared utility so API routes don't need to self-fetch via HTTP.
 */
export async function getVideoDetails(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YouTube API key not configured");

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?` +
      `part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`
  );

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const data = await response.json();
  const video = data.items?.[0];
  if (!video) throw new Error("Video not found");

  return estimateAudioFeatures(video);
}

function estimateAudioFeatures(video: any) {
  const title = video.snippet.title.toLowerCase();
  const description = video.snippet.description.toLowerCase();
  const tags = video.snippet.tags || [];

  const hash = video.id
    .split("")
    .reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);

  let tempo = 100 + (hash % 60);
  const genreHints = [...tags, title, description].join(" ").toLowerCase();

  if (genreHints.match(/slow|ballad|acoustic|piano/)) {
    tempo = Math.max(60, tempo - 30);
  } else if (genreHints.match(/fast|speed|drum|bass|edm|techno|house/)) {
    tempo = Math.min(180, tempo + 30);
  } else if (genreHints.match(/hip hop|rap|trap/)) {
    tempo = 70 + (hash % 30);
  } else if (genreHints.match(/dance|disco|pop/)) {
    tempo = 110 + (hash % 30);
  }

  const key = hash % 12;
  const mode = genreHints.match(/sad|dark|minor|melancholy/) ? 0 : 1;

  const viewCount = parseInt(video.statistics?.viewCount || "0");
  const popularity = Math.min(100, Math.log10(viewCount + 1) * 10);
  const energy = Math.min(
    1,
    Math.max(0, 0.4 + popularity / 200 + (hash % 30) / 100)
  );

  let danceability = 0.5 + popularity / 200 + (hash % 20) / 100;
  if (genreHints.match(/dance|edm|house|disco|pop/)) {
    danceability = Math.min(1, danceability + 0.2);
  }
  danceability = Math.min(1, Math.max(0, danceability));

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
    instrumentalness: genreHints.match(/instrumental|beat|no vocal/)
      ? 0.8
      : 0.1,
    time_signature: 4,
  };
}
