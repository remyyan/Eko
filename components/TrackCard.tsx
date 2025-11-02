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
  "C",
  "C♯/D♭",
  "D",
  "D♯/E♭",
  "E",
  "F",
  "F♯/G♭",
  "G",
  "G♯/A♭",
  "A",
  "A♯/B♭",
  "B",
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
      className={`cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-lg ${
        isSelected
          ? "border-green-500 bg-green-50 dark:bg-green-950"
          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      }`}
    >
      <div className="flex gap-4">
        <img
          src={track.album.images[0]?.url || "/placeholder.png"}
          alt={track.album.name}
          className="h-20 w-20 rounded-md object-cover"
        />
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {track.name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {track.artists.map((a) => a.name).join(", ")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            {track.album.name}
          </p>

          {showFeatures && track.audioFeatures && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-semibold">BPM:</span>{" "}
                {Math.round(track.audioFeatures.tempo)}
              </div>
              <div>
                <span className="font-semibold">Key:</span>{" "}
                {keyNames[track.audioFeatures.key]}{" "}
                {track.audioFeatures.mode === 1 ? "Major" : "Minor"}
              </div>
              <div>
                <span className="font-semibold">Energy:</span>{" "}
                {Math.round(track.audioFeatures.energy * 100)}%
              </div>
              <div>
                <span className="font-semibold">Dance:</span>{" "}
                {Math.round(track.audioFeatures.danceability * 100)}%
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

