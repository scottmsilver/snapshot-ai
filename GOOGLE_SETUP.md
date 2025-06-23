# Google OAuth and Drive API Setup Guide

## Prerequisites

1. A Google account
2. Access to Google Cloud Console

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name your project (e.g., "Image Markup App")
4. Click "Create"

## Step 2: Enable Required APIs

1. In your project, go to "APIs & Services" → "Library"
2. Search for and enable these APIs:
   - Google Drive API
   - Google Identity and Access Management (IAM) API

## Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" user type (unless you have a Google Workspace account)
3. Fill in the required fields:
   - App name: "Image Markup App"
   - User support email: Your email
   - Developer contact information: Your email
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`
5. Add test users (your email and any others you want to test with)
6. Save and continue

## Step 4: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: "Image Markup Web Client"
5. Authorized JavaScript origins:
   - `http://localhost:5173` (for development)
   - Your production URL (when you deploy)
6. Authorized redirect URIs:
   - `http://localhost:5173`
   - Your production URL
7. Click "Create"
8. Copy the Client ID

## Step 5: Create API Key (Optional)

1. Click "Create Credentials" → "API key"
2. Restrict the API key:
   - Application restrictions: "HTTP referrers"
   - Website restrictions: Add your domains
   - API restrictions: Select "Google Drive API"
3. Copy the API key

## Step 6: Configure the Application

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id-here
   VITE_GOOGLE_API_KEY=your-api-key-here (optional)
   VITE_GOOGLE_DRIVE_APP_ID=your-project-number (from project settings)
   ```

## Step 7: Test the Integration

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Click "Sign in with Google"
3. Authorize the app
4. Try saving a markup to Google Drive

## Important Notes

- The app only requests access to files it creates (`drive.file` scope)
- User data is stored in localStorage for session persistence
- Tokens are automatically refreshed when needed
- Files are saved as JSON with embedded image data

## Troubleshooting

### "Access blocked" error
- Make sure you've added your email to test users in OAuth consent screen
- Check that all redirect URIs match exactly

### "Invalid client" error
- Verify the Client ID is correct in .env
- Check that the domain is added to authorized origins

### Drive API errors
- Ensure Google Drive API is enabled in your project
- Check that the user has granted all required permissions