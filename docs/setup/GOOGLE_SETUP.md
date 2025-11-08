# Google OAuth and Drive API Setup Guide

## Prerequisites

1. A Google account
2. Access to Google Cloud Console

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (next to "Google Cloud" logo)
3. Click "NEW PROJECT" in the modal that appears
4. Enter project details:
   - Project name: "Image Markup App"
   - Leave organization as is (or select if you have one)
5. Click "CREATE"
6. Wait for project creation (notification will appear)

## Step 2: Enable Required APIs

1. Make sure your new project is selected in the dropdown
2. Click the hamburger menu (☰) → "APIs & Services" → "Enabled APIs"
3. Click "+ ENABLE APIS AND SERVICES" at the top
4. Search for "Google Drive API"
5. Click on it and press "ENABLE"
6. Wait for it to enable (may take a few seconds)

## Step 3: Configure OAuth Consent Screen

1. Go to hamburger menu (☰) → "APIs & Services" → "OAuth consent screen"
2. If you see user type options:
   - For personal Google accounts: You might not see any options and go directly to configuration
   - For Google Workspace: You might see "Internal" and "External" options
   - If no options appear, just proceed to the next step
3. Fill in "App information":
   - App name: "Image Markup App"
   - User support email: Select your email from dropdown
   - App logo: (optional, skip this)
4. App domain fields (all optional for testing):
   - Application home page: (leave blank)
   - Application privacy policy link: (leave blank)
   - Application terms of service link: (leave blank)
5. Under "Developer contact information", add your email
6. Click "SAVE AND CONTINUE"
7. On "Scopes" page:
   - Click "ADD OR REMOVE SCOPES"
   - In the panel that opens on the right:
     - You can manually add scope: `https://www.googleapis.com/auth/drive.file`
     - Or filter/search for "drive" and select the scope that says "See, create, and delete only the specific Google Drive files you use with this app"
   - Click "UPDATE" at the bottom of the panel
   - Click "SAVE AND CONTINUE"
8. On "Test users" page (if it appears):
   - Click "+ ADD USERS"
   - Enter your email address
   - Click "ADD"
   - Click "SAVE AND CONTINUE"
9. Review the summary and click "BACK TO DASHBOARD" or "BACK TO CREDENTIALS"

## Step 4: Create OAuth 2.0 Credentials

1. Go to hamburger menu (☰) → "APIs & Services" → "Credentials"
2. Click "+ CREATE CREDENTIALS" at the top
3. Select "OAuth client ID"
4. If prompted about consent screen, make sure it's configured
5. Application type: Select "Web application"
6. Name: "Image Markup Web Client"
7. Under "Authorized JavaScript origins":
   - Click "+ ADD URI"
   - Add: `http://localhost:5173`
   - Add: `http://localhost` (sometimes needed)
8. Under "Authorized redirect URIs":
   - Click "+ ADD URI"
   - Add: `http://localhost:5173`
9. Click "CREATE"
10. A modal will show your credentials:
    - Copy the "Client ID" (looks like: xxx.apps.googleusercontent.com)
    - You can ignore the Client Secret for this app

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