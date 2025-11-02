# 🔧 Troubleshooting Guide

## Common Issues and Solutions

### 1. "Invalid redirect_uri" Error from Spotify

**Problem**: When clicking "Connect with Spotify", you get an error about invalid redirect URI.

**Solution**:
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click on your app
3. Click "Settings"
4. Under "Redirect URIs", add:
   ```
   http://192.168.68.148:3000/api/auth/callback/spotify
   ```
   Note: Spotify doesn't allow `localhost`, so use your local network IP instead.
5. Click "Add" button
6. Scroll down and click "Save"
7. Wait a few seconds for changes to propagate
8. Try signing in again

### 2. Authentication Keeps Failing

**Problem**: Can't sign in, keeps redirecting back to home page.

**Solution**:
1. Check that `.env.local` exists and has correct values:
   ```
   SPOTIFY_CLIENT_ID=abce7f3b21d1401ba9c95f683fe5a7bc
   SPOTIFY_CLIENT_SECRET=176d24069bdf4a87954f461fad122671
   NEXTAUTH_URL=http://192.168.68.148:3000
   NEXTAUTH_SECRET=your-super-secret-key-change-this-in-production
   OPENAI_API_KEY=sk-proj-...
   ```
2. Restart the dev server:
   ```bash
   # Stop the server (Ctrl+C)
   npm run dev
   ```
3. Clear browser cookies for localhost:3000
4. Try signing in again

### 3. "Unauthorized" Error When Searching

**Problem**: Search returns 401 Unauthorized error.

**Solution**:
1. Make sure you're signed in with Spotify
2. Check browser console for errors
3. Verify your Spotify access token hasn't expired (sign out and sign in again)
4. Check that API routes are using `getServerSession` correctly

### 4. AI Analysis Not Working

**Problem**: Compatibility score shows but no AI recommendations.

**Solution**:
1. Check OpenAI API key in `.env.local`
2. Verify you have credits in your OpenAI account
3. Check browser console for errors
4. Look at terminal for API errors

### 5. Audio Features Not Loading

**Problem**: Tracks show but no BPM/Key information.

**Solution**:
1. Some tracks may not have audio features available
2. Check browser console for errors
3. Try different tracks
4. Verify Spotify API is responding (check terminal logs)

### 6. Port 3000 Already in Use

**Problem**: Can't start dev server, port is busy.

**Solution**:
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Then start dev server
npm run dev
```

### 7. Module Not Found Errors

**Problem**: Import errors or missing modules.

**Solution**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Restart dev server
npm run dev
```

### 8. TypeScript Errors

**Problem**: Type errors in the code.

**Solution**:
```bash
# Check for errors
npm run build

# If errors persist, check tsconfig.json
```

### 9. Styles Not Loading

**Problem**: App looks broken, no styling.

**Solution**:
1. Check that Tailwind CSS is installed
2. Verify `globals.css` is imported in `layout.tsx`
3. Clear browser cache
4. Restart dev server

### 10. Search Returns No Results

**Problem**: Searching for tracks returns empty results.

**Solution**:
1. Verify you're signed in
2. Check that search query is not empty
3. Try different search terms
4. Check Spotify API status: https://status.spotify.com/
5. Look at terminal for API errors

## Debug Mode

To see detailed logs, check the terminal where `npm run dev` is running.

### Useful Debug Commands

```bash
# Check if server is running
curl http://192.168.68.148:3000/api/auth/session

# Test Spotify search (requires auth)
# Open in browser while signed in:
http://192.168.68.148:3000/api/spotify/search?q=test

# Check environment variables are loaded
# Look for "Environments: .env.local" in terminal output
```

## Environment Variables Checklist

Make sure `.env.local` has all these variables:

- [ ] `SPOTIFY_CLIENT_ID` - From Spotify Developer Dashboard
- [ ] `SPOTIFY_CLIENT_SECRET` - From Spotify Developer Dashboard
- [ ] `NEXTAUTH_URL` - Should be `http://192.168.68.148:3000`
- [ ] `NEXTAUTH_SECRET` - Any random string (change in production)
- [ ] `OPENAI_API_KEY` - From OpenAI Platform

## Still Having Issues?

1. **Check the terminal output** - Most errors will show here
2. **Check browser console** - Press F12 and look at Console tab
3. **Verify Spotify app settings** - Double-check redirect URI
4. **Try incognito mode** - Rules out browser cache issues
5. **Restart everything**:
   ```bash
   # Stop dev server (Ctrl+C)
   # Clear Next.js cache
   rm -rf .next
   # Restart
   npm run dev
   ```

## API Rate Limits

### Spotify API
- Rate limit: ~180 requests per minute
- If you hit the limit, wait a minute and try again

### OpenAI API
- Rate limit: Depends on your plan
- Check usage at: https://platform.openai.com/usage

## Browser Compatibility

Tested and working on:
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)

## Need More Help?

Check these resources:
- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Spotify Web API Documentation](https://developer.spotify.com/documentation/web-api)
- [OpenAI API Documentation](https://platform.openai.com/docs)

