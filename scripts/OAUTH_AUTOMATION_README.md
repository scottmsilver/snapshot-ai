# OAuth Automation Scripts

This directory contains scripts to automate Google Cloud OAuth setup for the Image Markup App.

## Available Scripts

### 1. `automate-google-oauth.py` (Most Automated)
The most comprehensive automation using Google Cloud APIs.

**Features:**
- Uses Google Cloud APIs to automate setup
- Enables required APIs automatically
- Creates API keys programmatically
- Generates OAuth configuration files
- Creates environment files when given Client ID

**Usage:**
```bash
python3 automate-google-oauth.py
```

**What it automates:**
- ✅ Enables Google Drive API
- ✅ Enables required service APIs
- ✅ Creates API keys with restrictions
- ✅ Generates OAuth configuration
- ✅ Creates .env files
- ✅ Creates Vercel deployment scripts

**What requires manual steps:**
- ❌ OAuth consent screen configuration
- ❌ OAuth 2.0 Client ID creation (API limitations)

### 2. `gcloud-oauth-setup.sh` (CLI-based)
Uses gcloud CLI commands for automation.

**Features:**
- Works with existing gcloud authentication
- Creates API keys using gcloud alpha commands
- Generates configuration files
- Opens browser to Google Cloud Console

**Usage:**
```bash
./gcloud-oauth-setup.sh
```

**Requirements:**
- Google Cloud SDK installed
- `gcloud auth login` completed
- Alpha components (`gcloud components install alpha`)

### 3. `setup-google-oauth.sh` (Interactive)
Simple interactive script for manual setup.

**Features:**
- Prompts for all required values
- Creates .env files
- Generates detailed setup guide
- Creates Vercel deployment script

**Usage:**
```bash
./setup-google-oauth.sh
```

### 4. `configure-google-cloud.py` (Helper)
Python script that generates configuration and commands.

**Features:**
- Checks gcloud installation
- Generates OAuth configuration
- Creates helper commands
- Provides step-by-step guide

**Usage:**
```bash
python3 configure-google-cloud.py
```

## Which Script to Use?

### For Maximum Automation
Use `automate-google-oauth.py`:
- Automates the most steps
- Uses Google Cloud APIs directly
- Best for users comfortable with Python

### For CLI Users
Use `gcloud-oauth-setup.sh`:
- Uses familiar gcloud commands
- Good for users with gcloud experience
- Works well in CI/CD pipelines

### For Simple Setup
Use `setup-google-oauth.sh`:
- No dependencies beyond bash
- Interactive prompts
- Good for first-time users

### For Configuration Help
Use `configure-google-cloud.py`:
- Generates configuration files
- Provides manual commands
- Good for understanding the process

## Prerequisites

### For All Scripts
1. A Google Cloud Project
2. Billing enabled on the project
3. Owner or Editor permissions

### For Python Scripts
```bash
pip install google-cloud-iam google-auth google-api-python-client google-auth-oauthlib
```

### For gcloud Scripts
```bash
# Install Google Cloud SDK
# https://cloud.google.com/sdk/docs/install

# Login
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Install alpha components (for API key creation)
gcloud components install alpha
```

## Manual Steps Still Required

Due to Google Cloud API limitations, these steps must be done manually:

1. **OAuth Consent Screen Configuration**
   - Go to: APIs & Services → OAuth consent screen
   - Configure app details and scopes

2. **OAuth 2.0 Client ID Creation**
   - Go to: APIs & Services → Credentials
   - Create OAuth client ID
   - Add authorized origins and redirect URIs

## Typical Workflow

1. **Run automation script:**
   ```bash
   python3 automate-google-oauth.py
   ```

2. **Complete manual steps in Google Cloud Console:**
   - Configure OAuth consent screen
   - Create OAuth 2.0 Client ID
   - Add URLs from generated configuration

3. **Run script again with Client ID:**
   - Enter the Client ID when prompted
   - Script creates .env files

4. **Deploy to Vercel:**
   ```bash
   ./scripts/setup-vercel-env.sh
   npx vercel --prod
   ```

## Generated Files

After running the scripts, you'll have:

- `.env.local` - Local development environment
- `.env.production` - Production environment
- `oauth-urls.txt` - URLs to add in Google Cloud
- `oauth-client-config.json` - OAuth configuration
- `consent-screen-config.json` - Consent screen settings
- `google-cloud-setup-instructions.md` - Detailed manual steps
- `.api-key.txt` - Your API key (keep secure!)
- `scripts/setup-vercel-env.sh` - Vercel deployment script

## Troubleshooting

### "Permission denied" errors
- Ensure you have Owner/Editor role in the project
- Check `gcloud auth list` for active account

### "API not enabled" errors
- The scripts will try to enable APIs automatically
- If it fails, enable manually in Cloud Console

### "Invalid project" errors
- Verify project ID with `gcloud projects list`
- Ensure billing is enabled

### Python dependency errors
```bash
pip install --upgrade google-cloud-iam google-auth google-api-python-client
```

## Security Notes

1. **Never commit .env files or .api-key.txt to git**
2. **Keep your API keys secure**
3. **Restrict API keys to your domains**
4. **Use least-privilege IAM roles**

## Support

For issues with:
- Scripts: Check this README and script comments
- Google Cloud: See [Google Cloud Documentation](https://cloud.google.com/docs)
- OAuth: See [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)