# Complete Setup Guide for Image Markup App

## Quick Start

Run the all-in-one setup script:
```bash
./setup-and-deploy.sh
```

This will guide you through:
1. Setting up Google OAuth credentials
2. Configuring Google Cloud Console
3. Deploying to Vercel

## Manual Setup Steps

### 1. Google OAuth Setup

Run the setup script to create your environment files:
```bash
./scripts/setup-google-oauth.sh
```

This will:
- Create `.env.local` for development
- Create `.env.production` for production
- Generate `google-oauth-setup.md` with detailed instructions
- Create a Vercel environment setup script

### 2. Google Cloud Console Configuration

#### Option A: Using the Helper Script (Recommended)
```bash
python3 scripts/configure-google-cloud.py
```

This will:
- Check your gcloud setup
- Generate OAuth configuration
- Provide copy-paste commands
- Create helper scripts

#### Option B: Manual Configuration

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**

2. **Create or Select a Project**

3. **Enable APIs**:
   - Navigate to "APIs & Services" → "Library"
   - Search and enable: **Google Drive API**

4. **Configure OAuth Consent Screen**:
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External" user type
   - Fill in:
     - App name: "Image Markup App"
     - User support email: Your email
     - Developer contact: Your email
   - Add scopes:
     - `openid`
     - `email`
     - `profile`
     - `https://www.googleapis.com/auth/drive.file`

5. **Create Credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "+ CREATE CREDENTIALS" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "Image Markup App"

6. **Add Authorized URLs**:
   
   **Authorized JavaScript origins:**
   ```
   http://localhost:5173
   http://localhost:5174
   http://localhost:4173
   https://your-app-name.vercel.app
   https://your-app-name-*.vercel.app
   ```
   
   **Authorized redirect URIs:**
   ```
   http://localhost:5173
   http://localhost:5174
   http://localhost:4173
   https://your-app-name.vercel.app
   https://your-app-name-*.vercel.app
   ```

7. **Copy Credentials**:
   - Copy the Client ID
   - Create an API Key (Credentials → "+ CREATE CREDENTIALS" → "API key")
   - Save both to your `.env` files

### 3. Vercel Deployment

1. **Login to Vercel**:
   ```bash
   npx vercel login
   ```

2. **Deploy**:
   ```bash
   npx vercel
   ```

3. **Set Environment Variables**:
   ```bash
   ./scripts/setup-vercel-env.sh
   ```
   
   Or manually:
   ```bash
   npx vercel env add VITE_GOOGLE_CLIENT_ID production
   npx vercel env add VITE_GOOGLE_API_KEY production
   npx vercel env add VITE_GOOGLE_DRIVE_APP_ID production
   ```

4. **Deploy to Production**:
   ```bash
   npx vercel --prod
   ```

## Environment Variables

Your app needs these environment variables:

| Variable | Description | Where to Find |
|----------|-------------|---------------|
| `VITE_GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID | Google Cloud Console → Credentials |
| `VITE_GOOGLE_API_KEY` | API Key for Google services | Google Cloud Console → Credentials |
| `VITE_GOOGLE_DRIVE_APP_ID` | (Optional) Drive app ID | Google Cloud Console → Drive API |

## File Structure After Setup

```
image-markup-app/
├── .env.local              # Local development environment
├── .env.production         # Production environment
├── google-oauth-setup.md   # Detailed OAuth setup guide
├── oauth-config.json       # OAuth URLs configuration
├── scripts/
│   ├── setup-google-oauth.sh    # Environment setup script
│   ├── setup-vercel-env.sh      # Vercel env vars script
│   ├── configure-google-cloud.py # Google Cloud helper
│   └── update-oauth-client.sh   # OAuth update helper
└── setup-and-deploy.sh     # All-in-one setup script
```

## Troubleshooting

### "redirect_uri_mismatch" Error
- Check that ALL URLs are added exactly as shown (no trailing slashes)
- Wait 5-10 minutes for Google changes to propagate
- Ensure you're using the correct Client ID

### "Access blocked: This app's request is invalid"
- Check OAuth consent screen is configured
- Ensure all required scopes are added
- Verify the app is not in "Testing" mode (or add test users)

### Environment Variables Not Working
- Redeploy after setting env vars: `npx vercel --prod`
- Check variable names start with `VITE_`
- Verify in Vercel dashboard under Settings → Environment Variables

### Login Popup Blocked
- Check browser popup settings
- Try allowing popups for your domain
- Use a different browser for testing

## Next Steps

1. **Custom Domain**: 
   ```bash
   npx vercel domains add your-domain.com
   ```

2. **Enable Analytics**: 
   - Go to Vercel Dashboard → Analytics
   - Enable Web Analytics

3. **Set Up Monitoring**:
   - Consider adding Sentry for error tracking
   - Set up uptime monitoring

## Support

- **Vercel Docs**: https://vercel.com/docs
- **Google OAuth Docs**: https://developers.google.com/identity/protocols/oauth2
- **Project Issues**: Create an issue in your GitHub repo