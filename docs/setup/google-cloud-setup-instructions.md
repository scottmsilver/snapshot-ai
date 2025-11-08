# Google Cloud Console Setup Instructions

Generated on: Fri Jul  4 02:41:13 PM UTC 2025

## Project Details
- **Project ID**: checks-263811
- **App Name**: image-markup-app
- **Email**: 

## Quick Links
- [Google Cloud Console](https://console.cloud.google.com/welcome?project=checks-263811)
- [APIs & Services](https://console.cloud.google.com/apis/dashboard?project=checks-263811)
- [Credentials](https://console.cloud.google.com/apis/credentials?project=checks-263811)
- [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent?project=checks-263811)

## Manual Steps Required

### 1. Configure OAuth Consent Screen
1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent?project=checks-263811)
2. Select "External" user type
3. Fill in:
   - **App name**: image-markup-app
   - **User support email**: 
   - **Developer contact**: 
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`
5. Save and continue

### 2. Create OAuth 2.0 Client ID
1. Go to [Credentials](https://console.cloud.google.com/apis/credentials?project=checks-263811)
2. Click "+ CREATE CREDENTIALS" → "OAuth client ID"
3. Select "Web application"
4. Name: "image-markup-app"
5. Add Authorized JavaScript origins (from oauth-urls.txt)
6. Add Authorized redirect URIs (from oauth-urls.txt)
7. Click "Create"
8. Copy the Client ID

### 3. Update Environment Files
1. Copy `.env.template` to `.env.local` and `.env.production`
2. Replace `YOUR_CLIENT_ID_HERE` with your actual Client ID


### 4. Deploy to Vercel
```bash
# Set up Vercel environment variables
npx vercel env add VITE_GOOGLE_CLIENT_ID production
npx vercel env add VITE_GOOGLE_API_KEY production

# Deploy
npx vercel --prod
```

## Files Created
- `oauth-urls.txt` - OAuth URLs to add in Google Cloud Console
- `.env.template` - Environment variable template
- `.api-key.txt` - Your API key (if created)
- `google-cloud-setup-instructions.md` - This file

## Troubleshooting
- If you see "redirect_uri_mismatch", ensure ALL URLs are added exactly as shown
- Changes may take 5-30 minutes to propagate
- For "Access blocked" errors, check the OAuth consent screen configuration
