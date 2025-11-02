# 🎵 Audio Mashup Generator Setup

This guide will help you set up the real audio mashup generation feature.

## What You Need

The audio mashup generator requires:
1. **Python 3.8+** installed on your system
2. **FFmpeg** for audio processing
3. **Python libraries** (librosa, pydub, soundfile, numpy)

## Installation Steps

### 1. Install Python (if not already installed)

**macOS:**
```bash
brew install python3
```

**Ubuntu/Debian:**
```bash
sudo apt-get install python3 python3-pip
```

**Windows:**
Download from https://www.python.org/downloads/

### 2. Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt-get install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html

### 3. Install Python Dependencies

From the project root directory:
```bash
pip install -r requirements.txt
```

This installs:
- **librosa** - Audio analysis and BPM detection
- **pydub** - Audio mixing and crossfading
- **soundfile** - Audio file I/O
- **numpy** - Numerical computing

### 4. Verify Installation

Test that everything works:
```bash
python3 mashup_generator.py --help
```

## How It Works

### The Mashup Process

1. **Upload two audio files** (MP3, WAV, FLAC, etc.)
2. **BPM Detection** - Analyzes each track's tempo
3. **Time Stretching** - Adjusts both tracks to match BPM
4. **Crossfading** - Creates smooth 3-second transition
5. **Normalization** - Balances audio levels
6. **Export** - Generates MP3 file

### Technical Details

**BPM Detection:**
- Uses librosa's onset detection algorithm
- Analyzes the audio's rhythmic structure
- Detects beats and calculates tempo

**Time Stretching:**
- Adjusts playback speed without changing pitch
- Uses phase vocoder algorithm
- Maintains audio quality

**Crossfading:**
- Creates 3-second overlap between tracks
- Fades out Track 1, fades in Track 2
- Smooth transition between songs

## Usage

### Via Web UI

1. Go to http://127.0.0.1:3000
2. Click **"📁 Upload Audio Files"** tab
3. Upload two audio files
4. Click **"🎛️ Generate Mashup"**
5. Download the generated mashup!

### Via Command Line

```bash
python3 mashup_generator.py track1.mp3 track2.mp3 output.mp3
```

## Troubleshooting

### "python3: command not found"
- Python is not installed or not in PATH
- Install Python and add to PATH

### "ffmpeg: command not found"
- FFmpeg is not installed
- Install using brew/apt-get/download

### "ModuleNotFoundError: No module named 'librosa'"
- Python dependencies not installed
- Run: `pip install -r requirements.txt`

### "Failed to generate mashup"
- Check that audio files are valid
- Try with different audio formats
- Check console for detailed error messages

### Audio quality issues
- Ensure source files are high quality
- Try with different crossfade durations
- Experiment with different BPM targets

## Performance

**Processing Time:**
- 3-minute songs: ~30-60 seconds
- 5-minute songs: ~60-120 seconds
- Depends on CPU and audio quality

**File Size:**
- Output is MP3 at 192kbps
- Typical 6-minute mashup: ~10-15 MB

## Limitations

- Maximum file size: ~500 MB per track
- Supported formats: MP3, WAV, FLAC, OGG, M4A
- Processing happens on server (not real-time)
- Crossfade duration is fixed at 3 seconds

## Advanced Options

To modify mashup behavior, edit `mashup_generator.py`:

```python
# Change crossfade duration (in milliseconds)
mashup = generator.crossfade(audio1, audio2, duration_ms=5000)

# Change output bitrate
mashup.export(output_path, format="mp3", bitrate="320k")

# Change target BPM calculation
self.target_bpm = max(self.bpm1, self.bpm2)  # Use max instead of average
```

## Next Steps

1. ✅ Install Python and FFmpeg
2. ✅ Install Python dependencies
3. ✅ Test with sample audio files
4. ✅ Use the web UI to generate mashups!

---

**Questions?** Check the console output for detailed error messages and logs.

