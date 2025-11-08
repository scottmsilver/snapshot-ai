# Check Your Google OAuth URLs

## Quick Steps

1. **Go to Google Cloud Console**:
   https://console.cloud.google.com/apis/credentials?project=checks-263811

2. **Click on your OAuth 2.0 Client ID** (should be something like "316433672143-qcbnfdg8jg5cpvobqd1f50jv6b3515ls.apps.googleusercontent.com")

3. **Check these sections**:

### Authorized JavaScript origins
Should include:
- `https://image-markup-app.vercel.app`
- `http://localhost:5173`
- `http://localhost:5174` 
- `http://localhost:4173`

### Authorized redirect URIs  
Should include the same URLs:
- `https://image-markup-app.vercel.app`
- `http://localhost:5173`
- `http://localhost:5174`
- `http://localhost:4173`

## The Problem

You're testing on preview URLs like:
- `https://image-markup-aecc5r1zv-scott-silvers-projects-3ea963c8.vercel.app`

But this URL is NOT in your Google OAuth configuration, so authentication fails.

## Solutions

### Option 1: Use Production URL (Easiest)
Test at: **https://image-markup-app.vercel.app**

### Option 2: Add Preview URL to Google OAuth
1. Copy the preview URL
2. Add it to both "Authorized JavaScript origins" and "Authorized redirect URIs"
3. Save and wait ~5 minutes for changes to propagate

### Option 3: Test Locally
```bash
npm run dev
```
Then test at: http://localhost:5173

## To Update Google OAuth

If `https://image-markup-app.vercel.app` is missing:
1. Click "Edit" on your OAuth client
2. Add `https://image-markup-app.vercel.app` to both sections
3. Click "Save"
4. Wait 5-10 minutes for changes to take effect
5. Clear browser cache and try again