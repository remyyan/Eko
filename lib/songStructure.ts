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

// Minimum gap between two sections to avoid clutter (15 seconds)
const MIN_SECTION_GAP_MS = 15_000;
// Minimum gap in lyrics to count as an instrumental break
const INSTRUMENTAL_GAP_MS = 10_000;

function tooCloseToExisting(sections: SongSection[], timeMs: number): boolean {
  return sections.some(s => Math.abs(s.startMs - timeMs) < MIN_SECTION_GAP_MS);
}

/**
 * Detect sections from synced lyrics.
 *
 * Priority: explicit [Section] markers > instrumental gaps > chorus detection.
 * Enforces a minimum 15s gap between sections so the bar isn't cluttered.
 */
function sectionsFromSyncedLyrics(lines: LRCLine[], durationMs: number): SongSection[] {
  const sections: SongSection[] = [];

  // --- Pass 1: Explicit section markers (highest priority) ---
  for (const line of lines) {
    const m = line.text.match(SECTION_REGEX);
    if (m) {
      const label = m[1];
      const type = classifySection(label);
      if (!tooCloseToExisting(sections, line.timeMs)) {
        sections.push({
          label,
          type,
          startMs: line.timeMs,
          score: scoreSection(type),
        });
      }
    }
  }

  // If we got explicit markers, that's the best data — just add outro detection and return
  if (sections.length >= 3) {
    addOutroIfNeeded(sections, durationMs);
    return sections.sort((a, b) => a.startMs - b.startMs);
  }

  // --- Pass 2: Detect instrumental gaps (≥10s between lyric lines) ---
  let lastVocalMs = 0;
  for (const line of lines) {
    if (!line.text.trim() || SECTION_REGEX.test(line.text)) continue;
    if (line.timeMs - lastVocalMs >= INSTRUMENTAL_GAP_MS && lastVocalMs > 0) {
      const gapStart = lastVocalMs + 500;
      if (!tooCloseToExisting(sections, gapStart)) {
        sections.push({
          label: "Instrumental",
          type: "instrumental",
          startMs: gapStart,
          score: 95,
        });
      }
    }
    lastVocalMs = line.timeMs;
  }

  // --- Pass 3: Detect chorus by finding repeated line groups ---
  const seenTexts = new Map<string, number>();
  for (const line of lines) {
    if (line.text && !SECTION_REGEX.test(line.text)) {
      const norm = line.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      if (norm.length > 5) seenTexts.set(norm, (seenTexts.get(norm) || 0) + 1);
    }
  }

  const maxRepeat = Math.max(...seenTexts.values(), 1);
  const chorusThreshold = Math.max(2, Math.ceil(maxRepeat * 0.7));
  let inChorusStreak = false;

  for (const line of lines) {
    if (SECTION_REGEX.test(line.text)) continue;
    const norm = line.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const isRepeated = norm.length > 5 && (seenTexts.get(norm) || 0) >= chorusThreshold;

    if (isRepeated && !inChorusStreak) {
      if (!tooCloseToExisting(sections, line.timeMs)) {
        sections.push({
          label: "Chorus",
          type: "chorus",
          startMs: line.timeMs,
          score: scoreSection("chorus"),
        });
      }
      inChorusStreak = true;
    } else if (!isRepeated) {
      inChorusStreak = false;
    }
  }

  // --- Pass 4: Label non-chorus vocal sections as Verse ---
  // Find large gaps between detected sections and add verse markers
  const sorted = [...sections].sort((a, b) => a.startMs - b.startMs);
  const verseCandidates: SongSection[] = [];
  let verseNum = 1;

  // Check gap from song start to first section
  if (sorted.length > 0 && sorted[0].startMs > MIN_SECTION_GAP_MS * 2) {
    verseCandidates.push({
      label: `Verse ${verseNum++}`,
      type: "verse",
      startMs: Math.max(5000, sorted[0].startMs / 3),
      score: scoreSection("verse"),
    });
  }

  // Check gaps between sections
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].startMs - sorted[i].startMs;
    if (gap > MIN_SECTION_GAP_MS * 2.5) {
      const mid = sorted[i].startMs + gap * 0.4;
      if (!tooCloseToExisting(sections, mid)) {
        verseCandidates.push({
          label: `Verse ${verseNum++}`,
          type: "verse",
          startMs: mid,
          score: scoreSection("verse"),
        });
      }
    }
  }

  sections.push(...verseCandidates);
  addOutroIfNeeded(sections, durationMs);

  return sections.sort((a, b) => a.startMs - b.startMs);
}

function addOutroIfNeeded(sections: SongSection[], durationMs: number) {
  const last = sections.sort((a, b) => b.startMs - a.startMs)[0];
  if (!last || durationMs - last.startMs > 30000) {
    const outroStart = durationMs - 20000;
    if (!tooCloseToExisting(sections, outroStart)) {
      sections.push({
        label: "Outro",
        type: "outro",
        startMs: Math.max(0, outroStart),
        score: 90,
      });
    }
  }
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
