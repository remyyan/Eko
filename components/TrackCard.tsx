"use client";

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
  audioFeatures?: {
    tempo: number;
    key: number;
    mode: number;
    energy: number;
    danceability: number;
    valence: number;
  };
}

const keyNames = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export default function TrackCard({
  track,
  onSelect,
  isSelected,
  showFeatures = false,
}: {
  track: Track;
  onSelect: (track: Track) => void;
  isSelected: boolean;
  showFeatures?: boolean;
}) {
  return (
    <div
      onClick={() => onSelect(track)}
      className={`cursor-pointer rounded-lg border p-3 transition-all hover:bg-[#161616] ${
        isSelected
          ? "border-red-500/50 bg-red-500/5"
          : "border-[#222] bg-[#111]"
      }`}
    >
      <div className="flex gap-3">
        <img
          src={track.album.images[0]?.url || "/placeholder.png"}
          alt={track.album.name}
          className="h-14 w-14 rounded object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm text-white truncate">
            {track.name}
          </h3>
          <p className="text-xs text-[#888] truncate">
            {track.artists.map((a) => a.name).join(", ")}
          </p>

          {showFeatures && track.audioFeatures && track.audioFeatures.tempo && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#666] font-mono">
              <span>{Math.round(track.audioFeatures.tempo)} BPM</span>
              <span>
                {keyNames[track.audioFeatures.key] || "?"}{" "}
                {track.audioFeatures.mode === 1 ? "Maj" : "Min"}
              </span>
              <span>{Math.round(track.audioFeatures.energy * 100)}% E</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
