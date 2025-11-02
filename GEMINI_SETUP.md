# 🆓 Get Your FREE Google Gemini API Key

Google Gemini is **100% FREE** with a generous quota:
- ✅ **60 requests per minute**
- ✅ **1,500 requests per day**
- ✅ **No credit card required**

## Step-by-Step Guide

### 1. Go to Google AI Studio
Visit: **https://aistudio.google.com/app/apikey**

### 2. Sign in with Google
Use any Google account (Gmail, etc.)

### 3. Create API Key
1. Click **"Create API Key"**
2. Select **"Create API key in new project"** (or use existing project)
3. Copy the API key that appears

### 4. Add to Your App
1. Open `.env.local` in your project
2. Replace `your-gemini-api-key-here` with your actual API key:
   ```
   GEMINI_API_KEY=AIzaSyC...your-actual-key-here
   ```
3. Save the file

### 5. Restart the Dev Server
```bash
# Stop the current server (Ctrl+C)
npm run dev
```

## ✅ That's It!

Your app will now use Google Gemini AI for:
- 🎵 Professional DJ mashup analysis
- 🎚️ Intelligent transition recommendations
- 🎧 Personalized mixing advice

## Free Tier Limits

The free tier is very generous:
- **60 requests/minute** - More than enough for personal use
- **1,500 requests/day** - Plenty for development and testing
- **No expiration** - Free forever!

## Model Used

We're using **Gemini 1.5 Flash** which is:
- ⚡ Fast (responses in ~1 second)
- 🧠 Smart (great for music analysis)
- 💰 Free (no cost at all)

## Troubleshooting

If you get an error:
1. Make sure you copied the entire API key
2. Check that there are no extra spaces in `.env.local`
3. Restart the dev server after adding the key
4. Make sure you're signed in to Google AI Studio

## Privacy

Your API key is stored locally in `.env.local` and never shared. It's only used to call Google's AI API for mashup analysis.

---

**Need help?** The app works fine without the API key too - it just uses basic analysis instead of AI-powered recommendations!

