/**
 * Song Structure Detection
 *
 * Fetches lyrics from LRCLIB (free, no API key) and parses them to find
 * actual song sections (verse, chorus, bridge, instrumental, outro).
 *
 * Two strategies:
 * 1. Synced lyrics (timestamped) → exact section timestamps from gaps + patterns
 * 2. Plain lyrics with [Section] markers → proportionally distributed across duration
 */

export interface SongSection {
  label: string;
  type: "intro" | "verse" | "chorus" | "prechorus" | "bridge" | "instrumental" | "outro" | "drop" | "hook" | "other";
  startMs: number;
  /** Transition quality 0-100 */
  score: number;
}

interface LRCLine {
  timeMs: number;
  text: string;
}

const SECTION_REGEX = /^\[([^\]]+)\]\s*$/;

const TYPE_MAP: Record<string, SongSection["type"]> = {
  intro: "intro",
  verse: "verse",
  "verse 1": "verse",
  "verse 2": "verse",
  "verse 3": "verse",
  chorus: "chorus",
  hook: "hook",
  refrain: "chorus",
  "pre-chorus": "prechorus",
  "pre chorus": "prechorus",
  prechorus: "prechorus",
  bridge: "bridge",
  breakdown: "bridge",
  instrumental: "instrumental",
  interlude: "instrumental",
  solo: "instrumental",
  outro: "outro",
  ending: "outro",
  drop: "drop",
  build: "prechorus",
  "build-up": "prechorus",
  post: "other",
  "post-chorus": "other",
};

function classifySection(label: string): SongSection["type"] {
  const lower = label.toLowerCase().trim();
  for (const [key, type] of Object.entries(TYPE_MAP)) {
    if (lower.includes(key)) return type;
  }
  return "other";
}

function scoreSection(type: SongSection["type"]): number {
  switch (type) {
    case "instrumental": return 95;
    case "outro": return 90;
    case "bridge": return 85;
    case "prechorus": return 70;
    case "chorus": return 65;
    case "drop": return 60;
    case "hook": return 55;
    case "verse": return 45;
    case "intro": return 30;
    default: return 40;
  }
}

function colorForType(type: SongSection["type"]): string {
  switch (type) {
    case "instrumental": return "#22c55e";
    case "outro": return "#22c55e";
    case "bridge": return "#a78bfa";
    case "prechorus": return "#f59e0b";
    case "chorus": return "#f59e0b";
    case "drop": return "#ef4444";
    case "hook": return "#f59e0b";
    case "verse": return "#60a5fa";
    case "intro": return "#6b7280";
    default: return "#6b7280";
  }
}

/** Parse LRC timestamp "[mm:ss.xx]" to milliseconds */
function parseLrcTime(stamp: string): number {
  const m = stamp.match(/(\d+):(\d+)\.(\d+)/);
  if (!m) return 0;
  return parseInt(m[1]) * 60000 + parseInt(m[2]) * 1000 + parseInt(m[3]) * 10;
}

function parseSyncedLyrics(synced: string): LRCLine[] {
  const lines: LRCLine[] = [];
  for (const line of synced.split("\n")) {
    const m = line.match(/^\[(\d+:\d+\.\d+)\]\s*(.*)/);
    if (m) {
      lines.push({ timeMs: parseLrcTime(m[1]), text: m[2].trim() });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Detect sections from synced lyrics.
 * Strategy:
 * 1. Look for [Section] markers in the text
 * 2. Detect instrumental gaps (>4 seconds of silence between lines)
 * 3. Detect chorus repetitions (repeated line sequences)
 */
function sectionsFromSyncedLyrics(lines: LRCLine[], durationMs: number): SongSection[] {
  const sections: SongSection[] = [];
  const seenTexts = new Map<string, number>(); // text → count

  // First pass: count line repetitions to identify chorus lines
  for (const line of lines) {
    if (line.text && !SECTION_REGEX.test(line.text)) {
      const norm = line.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      if (norm) seenTexts.set(norm, (seenTexts.get(norm) || 0) + 1);
    }
  }

  // Find the most repeated lines (likely chorus)
  const maxRepeat = Math.max(...seenTexts.values(), 1);
  const chorusThreshold = Math.max(2, Math.floor(maxRepeat * 0.6));

  let lastTimeMs = 0;
  let inChorusStreak = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for explicit section markers
    const sectionMatch = line.text.match(SECTION_REGEX);
    if (sectionMatch) {
      const label = sectionMatch[1];
      const type = classifySection(label);
      sections.push({
        label,
        type,
        startMs: line.timeMs,
        score: scoreSection(type),
      });
      inChorusStreak = false;
      lastTimeMs = line.timeMs;
      continue;
    }

    // Detect instrumental gaps (>4s between lines)
    if (line.timeMs - lastTimeMs > 4000 && lastTimeMs > 0) {
      sections.push({
        label: "Instrumental",
        type: "instrumental",
        startMs: lastTimeMs + 500,
        score: 95,
      });
    }

    // Detect chorus entry (first repeated line after non-repeated ones)
    const norm = line.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const isRepeatedLine = norm && (seenTexts.get(norm) || 0) >= chorusThreshold;

    if (isRepeatedLine && !inChorusStreak) {
      // Check if this wasn't already labeled
      const alreadyLabeled = sections.some(
        s => Math.abs(s.startMs - line.timeMs) < 3000
      );
      if (!alreadyLabeled) {
        sections.push({
          label: "Chorus",
          type: "chorus",
          startMs: line.timeMs,
          score: scoreSection("chorus"),
        });
      }
      inChorusStreak = true;
    } else if (!isRepeatedLine) {
      inChorusStreak = false;
    }

    lastTimeMs = line.timeMs;
  }

  // Add outro if last section is far from end
  if (sections.length > 0) {
    const lastSection = sections[sections.length - 1];
    if (durationMs - lastSection.startMs > 30000) {
      sections.push({
        label: "Outro",
        type: "outro",
        startMs: durationMs - 15000,
        score: 90,
      });
    }
  }

  return sections;
}

/**
 * Detect sections from plain lyrics with [Section Header] markers.
 * Distributes sections proportionally across the track duration.
 */
function sectionsFromPlainLyrics(plain: string, durationMs: number): SongSection[] {
  const lines = plain.split("\n");
  const sectionHeaders: { label: string; lineIndex: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].trim().match(SECTION_REGEX);
    if (match) {
      sectionHeaders.push({ label: match[1], lineIndex: i });
    }
  }

  if (sectionHeaders.length === 0) return [];

  const totalLines = lines.length;
  return sectionHeaders.map((header) => {
    const pct = header.lineIndex / totalLines;
    const startMs = Math.round(pct * durationMs);
    const type = classifySection(header.label);

    return {
      label: header.label,
      type,
      startMs,
      score: scoreSection(type),
    };
  });
}

export interface SongStructureResult {
  sections: SongSection[];
  source: "synced_lyrics" | "plain_lyrics" | "none";
  colorForType: (type: SongSection["type"]) => string;
}

/**
 * Fetch song structure from LRCLIB.
 */
export async function getSongStructure(
  trackName: string,
  artistName: string,
  durationMs: number
): Promise<SongStructureResult> {
  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });

    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { "User-Agent": "eko-dj/1.0" },
    });

    if (!res.ok) {
      return { sections: [], source: "none", colorForType };
    }

    const data = await res.json();

    // Prefer synced lyrics (have timestamps)
    if (data.syncedLyrics) {
      const lines = parseSyncedLyrics(data.syncedLyrics);
      const sections = sectionsFromSyncedLyrics(lines, durationMs);
      if (sections.length > 0) {
        return { sections, source: "synced_lyrics", colorForType };
      }
    }

    // Fall back to plain lyrics with section markers
    if (data.plainLyrics) {
      const sections = sectionsFromPlainLyrics(data.plainLyrics, durationMs);
      if (sections.length > 0) {
        return { sections, source: "plain_lyrics", colorForType };
      }
    }

    return { sections: [], source: "none", colorForType };
  } catch (error) {
    console.error("Song structure fetch error:", error);
    return { sections: [], source: "none", colorForType };
  }
}

export { colorForType };
