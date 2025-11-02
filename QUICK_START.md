# 🚀 Quick Start Guide

## Your DJ Mashup Assistant is Ready!

The app is **currently running** at: **http://192.168.68.148:3000**

## ⚠️ CRITICAL: Before You Start

### Add Spotify Redirect URI (Required!)

**You MUST do this or authentication won't work:**

1. Open [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click on your app
3. Click **"Settings"** button
4. Scroll to **"Redirect URIs"**
5. Enter: `http://192.168.68.148:3000/api/auth/callback/spotify`
6. Click **"Add"**
7. Scroll down and click **"Save"**

**Note:** Spotify doesn't allow `localhost` - you must use your local network IP (192.168.68.148)

✅ **Done? Great! Now you can use the app.**

## 🎵 How to Use

### Step 1: Sign In
1. Go to http://192.168.68.148:3000
2. Click **"Connect with Spotify"** (green button)
3. Authorize the app in Spotify
4. You'll be redirected back to the app

### Step 2: Search for Tracks
1. Type a song name, artist, or album in the search bar
2. Press Enter or click **"Search"**
3. Results will appear below

### Step 3: Select Two Tracks
1. Click **"Track 1"** button on your first song choice
2. Click **"Track 2"** button on your second song choice
3. Both tracks will appear in the "Selected Tracks" section

### Step 4: View Analysis
The app automatically analyzes the tracks and shows:
- **Compatibility Score** (0-100%)
- **BPM Difference** - How far apart the tempos are
- **Musical Keys** - What key each track is in
- **AI Recommendation** - Professional DJ advice from GPT-4

## 🎯 Understanding the Results

### Compatibility Score
- **80-100%** 🟢 Excellent match! These will work great together
- **60-79%** 🟡 Good match with some adjustments needed
- **0-59%** 🔴 Challenging mashup, requires significant work

### What the AI Tells You
- Whether the tracks will work together
- Specific techniques to use (tempo adjustment, key shifting)
- Creative suggestions for mixing

### Example Analysis
```
Compatibility Score: 87%

BPM Difference: 3 BPM
Track 1 Key: C Major
Track 2 Key: G Major

AI Recommendation:
"Excellent match! The keys are a perfect fifth apart 
(C to G), which creates harmonic compatibility. The 
BPM difference is minimal - no adjustment needed. 
Try mixing the vocals from Track 1 over the 
instrumental of Track 2."
```

## 🎛️ Pro Tips

1. **Start with same artist** - Tracks from the same artist often work well
2. **Look for high scores** - 80%+ usually means easy mixing
3. **BPM matters most** - Under 10 BPM difference is ideal
4. **Keys are important** - Same key or perfect fifth (7 semitones) work best
5. **Trust your ears** - The score is a guide, not a rule!

## 📱 Interface Guide

### Search Bar
- Type any song, artist, or album name
- Press Enter to search
- Results show album art, artist, and track name

### Track Selection
- Each result has two buttons: "Track 1" and "Track 2"
- Click to assign the track to that slot
- Click on a selected track to remove it

### Selected Tracks Panel
Shows:
- Album artwork
- Song and artist name
- BPM (tempo)
- Musical key (e.g., "C Major")
- Energy level (0-100%)
- Danceability (0-100%)

### Analysis Panel
Appears when both tracks are selected:
- Large compatibility score
- Detailed metrics
- AI-powered recommendations

## 🔄 Workflow Example

1. Search: "uptown funk"
2. Click "Track 1" on "Uptown Funk - Bruno Mars"
3. Search: "treasure bruno mars"
4. Click "Track 2" on "Treasure - Bruno Mars"
5. View the analysis (should be high compatibility!)
6. Try different combinations

## 🎵 Good Song Pairs to Try

### High Compatibility Examples:
- "Uptown Funk" + "Treasure" (Bruno Mars)
- "Blinding Lights" + "Save Your Tears" (The Weeknd)
- "Levitating" + "Don't Start Now" (Dua Lipa)

### Interesting Mashups:
- Different genres but similar BPM
- Same key but different energy levels
- Acapella + Instrumental versions

## 🛠️ Troubleshooting

### Can't Sign In?
→ Check that you added the Redirect URI to Spotify (see top of this guide)

### Search Not Working?
→ Make sure you're signed in with Spotify

### No AI Recommendations?
→ Check that your OpenAI API key is valid and has credits

### App Won't Load?
→ Make sure dev server is running: `npm run dev`

**For more help, see TROUBLESHOOTING.md**

## 📚 Learn More

- **README.md** - Full project documentation
- **FEATURES.md** - Detailed feature explanations
- **SETUP.md** - Complete setup instructions
- **TROUBLESHOOTING.md** - Common issues and solutions

## 🎉 You're All Set!

Open http://192.168.68.148:3000 and start finding perfect mashup combinations!

Happy mixing! 🎧✨

