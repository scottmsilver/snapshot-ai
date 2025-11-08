# Setup Script Updates

## New Features Added

### 1. Automatic Detection of Existing .env Files
The setup script now:
- Checks for existing `.env`, `.env.local`, or `.env.production` files
- If valid credentials are found, offers to:
  - Deploy directly to Vercel with those credentials
  - Reconfigure OAuth setup
  - Exit without changes

### 2. Enhanced Vercel Deployment
The `deploy_to_vercel()` function now:
- Accepts any env file as parameter (defaults to `.env.production`)
- Automatically finds and uses `.env` if no other env file exists
- Uses `vercel link` to ensure project is linked before deployment
- Sets environment variables for all environments (production, preview, development)
- Uses `--force` flag to overwrite existing variables
- Extracts and displays the production URL after deployment
- Shows exact URLs to add to Google OAuth configuration

### 3. Improved Environment Variable Handling
- Safely extracts values from env files
- Handles quotes and spaces correctly
- Sets all three required variables:
  - `VITE_GOOGLE_CLIENT_ID`
  - `VITE_GOOGLE_API_KEY`
  - `VITE_GOOGLE_DRIVE_APP_ID`

## Usage

When you run `./setup-oauth.sh` with an existing `.env` file:

1. The script detects your existing credentials
2. Shows you the found Client ID and API Key
3. Offers three options:
   - **Deploy to Vercel** - Pushes env vars and deploys
   - **Reconfigure** - Goes through full OAuth setup again
   - **Exit** - Leaves everything as is

## Example Flow

```bash
$ ./setup-oauth.sh

✓ Found existing environment file: .env
✓ OAuth setup appears to be complete!

Found credentials:
  Client ID: 316433672143-qcbnfdg8jg5cp...
  API Key: AIzaSyAdvdQLhnVfGjLy5A...

Options:
  1) Deploy to Vercel with existing credentials
  2) Reconfigure OAuth setup
  3) Exit

Choose an option (1-3): 1

▶ Deploying to Vercel
ℹ Using environment file: .env
▶ Setting environment variables in Vercel...
✓ Environment variables set!
▶ Deploying to production...
✓ Deployment complete!
```

## Benefits

1. **No Manual Copy/Paste** - Reads directly from your existing .env
2. **One Command Deploy** - Goes from local .env to live Vercel deployment
3. **Preserves Existing Setup** - Doesn't overwrite working configurations
4. **Handles All Environments** - Sets vars for dev, preview, and production