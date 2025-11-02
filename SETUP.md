# DJ Mashup Assistant - Setup Guide

## 🎧 What This App Does

An AI-powered DJ tool that helps you find perfect song combinations for mashups by analyzing:
- **BPM (Tempo)** - Finds songs with compatible tempos
- **Musical Key** - Identifies harmonically compatible keys
- **Energy & Vibe** - Matches songs with similar energy levels
- **AI Recommendations** - Uses OpenAI to provide professional DJ advice

## 🚀 Setup Instructions

### 1. Spotify Developer Setup

⚠️ **IMPORTANT**: You must add the redirect URI to your Spotify app settings!

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click on your app (or create a new one)
3. Click "Settings"
4. Add this Redirect URI:
   ```
   http://192.168.68.148:3000/api/auth/callback/spotify
   ```
5. Click "Add" and then "Save" at the bottom of the page

**Note:** Spotify doesn't allow `localhost` - you must use your local network IP address.

Without this step, Spotify authentication will not work!

### 2. Environment Variables

Your `.env.local` file is already configured with:
- Spotify Client ID and Secret
- OpenAI API Key
- NextAuth configuration

### 3. Run the App

```bash
npm run dev
```

Then open [http://192.168.68.148:3000](http://192.168.68.148:3000)

## 🎵 How to Use

1. **Sign in with Spotify** - Click the green button to authenticate
2. **Search for tracks** - Use the search bar to find songs
3. **Select two tracks** - Click "Track 1" or "Track 2" buttons to add songs to comparison
4. **View AI Analysis** - The app automatically analyzes compatibility and provides:
   - Compatibility score (0-100%)
   - BPM difference
   - Key information
   - AI-powered DJ recommendations

## 🎛️ Features

- **Real-time Analysis** - Instant compatibility scoring
- **Audio Features** - BPM, key, energy, danceability, and more
- **AI Recommendations** - Professional DJ advice powered by GPT-4
- **Beautiful UI** - Dark theme optimized for DJs
- **Spotify Integration** - Search entire Spotify catalog

## 🔧 Technical Details

### Compatibility Algorithm

The app uses a weighted scoring system:
- **BPM Compatibility (40%)** - Closer tempos score higher
- **Key Compatibility (30%)** - Harmonically compatible keys (same key, perfect fifth, etc.)
- **Energy Match (15%)** - Similar energy levels
- **Danceability (10%)** - Similar dance characteristics
- **Mood/Valence (5%)** - Similar emotional tone

### API Routes

- `/api/auth/[...nextauth]` - Spotify authentication
- `/api/spotify/search` - Search Spotify catalog
- `/api/spotify/audio-features` - Get track audio features
- `/api/mashup/analyze` - AI-powered mashup analysis

## 🎉 Tips for Best Results

1. **BPM Matching** - Songs within 5-10 BPM work best
2. **Key Compatibility** - Same key or related keys (perfect fifth, relative minor/major)
3. **Energy Levels** - Similar energy creates smoother transitions
4. **Genre Mixing** - The AI will suggest creative combinations!

Enjoy creating amazing mashups! 🎶

