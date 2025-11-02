# 🎵 DJ Mashup Assistant - Features & How It Works

## Core Features

### 1. 🔍 Spotify Search
- Search the entire Spotify catalog
- Real-time search results
- Album artwork and artist information
- Quick track selection

### 2. 📊 Audio Analysis
The app analyzes multiple audio features for each track:

- **BPM (Tempo)** - Beats per minute
- **Musical Key** - C, D, E, F, G, A, B (with sharps/flats)
- **Mode** - Major or Minor
- **Energy** - Intensity and activity level (0-100%)
- **Danceability** - How suitable for dancing (0-100%)
- **Valence** - Musical positivity/mood (0-100%)

### 3. 🤖 AI-Powered Compatibility Scoring

The app uses a sophisticated algorithm to calculate mashup compatibility:

#### Scoring Breakdown:
- **BPM Compatibility (40% weight)**
  - Ideal: 0-5 BPM difference
  - Good: 5-10 BPM difference
  - Acceptable: 10-20 BPM difference
  - Difficult: 20+ BPM difference

- **Key Compatibility (30% weight)**
  - Perfect: Same key
  - Excellent: Perfect fifth (7 semitones)
  - Good: Perfect fourth (5 semitones), Whole step (2 semitones)
  - Acceptable: Minor third (10 semitones)
  - Challenging: Other intervals

- **Energy Match (15% weight)**
  - Tracks with similar energy levels blend better
  - High energy + high energy = great
  - Low energy + low energy = great
  - Mixed energy = challenging

- **Danceability (10% weight)**
  - Similar danceability scores create smoother transitions

- **Valence/Mood (5% weight)**
  - Similar emotional tone helps maintain vibe

### 4. 🎹 Musical Key Theory

The app understands harmonic relationships:

**Compatible Key Combinations:**
- Same key (C Major + C Major)
- Relative minor/major (C Major + A Minor)
- Perfect fifth (C Major + G Major)
- Perfect fourth (C Major + F Major)

**Example Compatibility:**
- C Major ↔ G Major (Perfect Fifth) ✅
- C Major ↔ A Minor (Relative) ✅
- C Major ↔ F Major (Perfect Fourth) ✅
- C Major ↔ D Major (Whole Step) ⚠️
- C Major ↔ F♯ Major (Tritone) ❌

### 5. 💡 AI Recommendations

GPT-4 analyzes the tracks and provides:
- Professional DJ insights
- Specific mixing techniques
- BPM adjustment suggestions
- Key transposition recommendations
- Creative mashup ideas

## Example Mashup Analysis

### High Compatibility (85%+)
```
Track 1: "Uptown Funk" - Bruno Mars
- BPM: 115
- Key: D Minor
- Energy: 84%

Track 2: "Treasure" - Bruno Mars  
- BPM: 116
- Key: D Minor
- Energy: 82%

✅ Same key, nearly identical BPM, similar energy
AI Suggestion: "Perfect match! Minimal adjustment needed."
```

### Medium Compatibility (60-84%)
```
Track 1: "Blinding Lights" - The Weeknd
- BPM: 171
- Key: F Minor
- Energy: 78%

Track 2: "Don't Start Now" - Dua Lipa
- BPM: 124
- Key: B Minor
- Energy: 79%

⚠️ Large BPM difference, different keys
AI Suggestion: "Halve the BPM of Blinding Lights (171→85.5) 
to match Don't Start Now. Consider key shifting."
```

### Low Compatibility (<60%)
```
Track 1: "Bohemian Rhapsody" - Queen
- BPM: 72
- Key: B♭ Major
- Energy: 42%

Track 2: "Sandstorm" - Darude
- BPM: 136
- Key: E Minor
- Energy: 92%

❌ Very different BPM, energy, and style
AI Suggestion: "Challenging mashup. Consider using as 
contrasting sections rather than simultaneous mix."
```

## Pro DJ Tips

### BPM Matching
- **±3 BPM**: No adjustment needed
- **±5-10 BPM**: Slight pitch adjustment
- **±10-20 BPM**: Significant tempo change required
- **Double/Half Time**: 140 BPM ↔ 70 BPM works!

### Key Mixing
1. **Camelot Wheel**: The app uses music theory
2. **Energy Flow**: Build up or wind down
3. **Genre Blending**: AI suggests creative combinations

### Transition Techniques
- **Beat Matching**: Align the beats
- **EQ Mixing**: Cut lows from one track
- **Filter Sweeps**: Smooth transitions
- **Acapella Mashups**: Vocals from one, instrumental from another

## Technical Details

### Spotify Audio Features API
The app uses Spotify's advanced audio analysis:
- Tempo detection
- Key and mode detection
- Beat tracking
- Section analysis
- Loudness normalization

### OpenAI Integration
- Model: GPT-4o-mini
- Context-aware recommendations
- Professional DJ terminology
- Practical mixing advice

## Future Features (Roadmap)

- [ ] **Playlist Generation** - Save compatible pairs
- [ ] **BPM Calculator** - Pitch shift calculations
- [ ] **Waveform Visualization** - See beat alignment
- [ ] **Harmonic Mixing** - Camelot wheel integration
- [ ] **Batch Analysis** - Analyze entire playlists
- [ ] **Export Notes** - Save mashup ideas
- [ ] **Transition Suggestions** - Specific mix points
- [ ] **Genre Filtering** - Find similar styles

## Best Practices

1. **Start Simple**: Try tracks from the same artist first
2. **Match Energy**: Similar vibes work better
3. **Trust the Score**: 80%+ usually works great
4. **Experiment**: AI suggestions are guidelines, not rules
5. **Use Your Ears**: The score is a starting point!

---

Happy mixing! 🎧✨

