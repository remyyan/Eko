# EKO MIX

AI-assisted DJ mixing app built with Next.js.  
Search tracks from YouTube Music, queue and reorder songs, set cue points, and perform smooth transitions with live waveform-style visualization.

![Next.js](https://img.shields.io/badge/Next.js-16.0-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.x-38bdf8)

## Features

- YouTube Music search via `ytmusic-ts` (song-focused results)
- AI recommendation list with transition scoring
- Queue management (add, play-next, reorder, remove)
- Cue-point workflow for both outgoing and incoming tracks
- Auto-transition support (including selected transition/cue behavior)
- Transition engine with multiple techniques:
  - Crossfade
  - Beat Match
  - Echo Fade
  - Filter Sweep
- Song structure detection from lyrics (`LRCLIB`) with phrase fallback
- Visual transition waveform synced to transition schedules

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4
- `groq-sdk` for transition/recommendation language outputs
- YouTube Data API (video metadata/estimates)
- `ytmusic-ts` for YouTube Music catalog search
- Optional Spotify/ReccoBeats enrichment for audio features

## Getting Started

### 1) Install

```bash
npm install
```

### 2) Configure Environment

Create `.env.local`:

```bash
YOUTUBE_API_KEY=
GROQ_API_KEY=

# Optional enrichments / integrations
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
GEMINI_API_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

Notes:
- `YOUTUBE_API_KEY` and `GROQ_API_KEY` are required for core functionality.
- If you deploy to Vercel, set these in Vercel Project Settings > Environment Variables.

### 3) Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm start
```

## API Routes (Current)

Core routes:
- `GET /api/youtube/search`
- `GET /api/youtube/video-details`
- `GET /api/audio-features`
- `GET /api/song-structure`
- `POST /api/mashup/recommend`
- `POST /api/mashup/recommend-list`
- `POST /api/mashup/transition`
- `POST /api/mashup/analyze`
- `POST /api/mashup/create`
- `POST /api/mashup/generate`

Legacy/optional routes still present:
- `/api/spotify/*`
- `/api/auth/[...nextauth]`

## Project Structure

```txt
app/
  api/                    # Server routes (search, recommend, transition, features)
  globals.css
  layout.tsx
  page.tsx                # Search/start page

components/
  DJPlayer.tsx            # Main DJ workspace
  CuePointBar.tsx
  TransitionWaveform.tsx
  TrackCard.tsx
  Providers.tsx

lib/
  transitionEngine.ts
  songStructure.ts
  videoDetails.ts
  youtube.ts
  reccobeats.ts
  spotify.ts
  cache.ts
```

## Security Notes

- Do not commit `.env.local`.
- Rotate provider keys if accidentally exposed.
- Firebase web config keys are public client identifiers, but still lock down Firebase rules and allowed origins.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
