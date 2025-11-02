# 🎧 DJ Mashup Assistant

An AI-powered tool that helps DJs find perfect song combinations for mashups using Spotify's audio analysis and OpenAI's GPT-4.

![Next.js](https://img.shields.io/badge/Next.js-16.0-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8)

## ✨ Features

- 🎵 **Spotify Integration** - Search and analyze any track from Spotify's catalog
- 🤖 **AI-Powered Analysis** - Get professional DJ recommendations from GPT-4
- 📊 **Compatibility Scoring** - Advanced algorithm analyzing BPM, key, energy, and more
- 🎹 **Musical Key Detection** - Identifies harmonically compatible songs
- ⚡ **Real-time Analysis** - Instant feedback on track combinations
- 🎨 **Beautiful UI** - Dark theme optimized for DJs

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Spotify Developer Account
- OpenAI API Key

### 1. Spotify Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app or use existing one
3. Add this Redirect URI in Settings:
   ```
   http://192.168.68.148:3000/api/auth/callback/spotify
   ```
   **Note:** Spotify doesn't allow `localhost` - use your local network IP

### 2. Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://192.168.68.148:3000](http://192.168.68.148:3000) to see the app.

### 3. Environment Variables

The `.env.local` file is already configured with your credentials.

## 🎛️ How It Works

### Compatibility Algorithm

The app uses a sophisticated weighted scoring system:

- **BPM Compatibility (40%)** - Analyzes tempo differences
- **Key Compatibility (30%)** - Checks harmonic relationships (same key, perfect fifth, etc.)
- **Energy Match (15%)** - Compares energy levels
- **Danceability (10%)** - Evaluates dance characteristics
- **Mood/Valence (5%)** - Assesses emotional tone

### AI Analysis

GPT-4 provides professional DJ insights including:
- Mashup viability assessment
- Specific mixing techniques (tempo adjustment, key shifting)
- Creative suggestions for transitions

## 📖 Usage Guide

1. **Sign in** - Click "Connect with Spotify"
2. **Search** - Find tracks using the search bar
3. **Select** - Choose two tracks to compare (Track 1 and Track 2)
4. **Analyze** - View instant compatibility score and AI recommendations
5. **Mix** - Use the insights to create your mashup!

## 🏗️ Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Authentication**: NextAuth.js with Spotify OAuth
- **AI**: OpenAI GPT-4o-mini
- **API**: Spotify Web API

## 📁 Project Structure

```
eko/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/    # NextAuth configuration
│   │   ├── spotify/               # Spotify API routes
│   │   └── mashup/                # Mashup analysis endpoint
│   ├── page.tsx                   # Main application UI
│   └── layout.tsx                 # Root layout with providers
├── components/
│   ├── Providers.tsx              # Session provider wrapper
│   └── TrackCard.tsx              # Track display component
├── lib/
│   └── auth.ts                    # NextAuth configuration
└── types/
    └── next-auth.d.ts             # TypeScript definitions
```

## 🎵 API Endpoints

- `GET /api/spotify/search?q={query}` - Search Spotify tracks
- `GET /api/spotify/audio-features?id={trackId}` - Get track audio features
- `POST /api/mashup/analyze` - Analyze two tracks for mashup compatibility

## 🔧 Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## 🎯 Future Enhancements

- [ ] Save favorite mashup combinations
- [ ] Create Spotify playlists from compatible tracks
- [ ] BPM adjustment calculator
- [ ] Key transposition suggestions
- [ ] Waveform visualization
- [ ] Export mashup notes/settings

## 📝 License

MIT

## 🙏 Acknowledgments

- Spotify Web API for audio analysis
- OpenAI for AI-powered recommendations
- Next.js team for the amazing framework

---

Built with ❤️ for DJs everywhere
