# OAuth Setup Script Hanging Fix

## Problem
The setup-oauth.sh script was hanging at "Checking OAuth consent screen configuration..." due to a `gcloud alpha iap oauth-brands list` command that was taking too long to execute.

## Root Cause
The hanging was caused by:
1. A gcloud command (`gcloud alpha iap oauth-brands list`) that doesn't have a built-in timeout
2. This command was likely from an older version of the script or a related script
3. The API call was potentially blocked or very slow

## Fixes Applied

### 1. Added process cleanup
- Added `pkill -f "gcloud alpha iap oauth-brands"` at the start of setup-oauth.sh to kill any hanging processes from previous runs

### 2. Added timeouts to gcloud commands
- Added `timeout 5s` to `gcloud auth print-access-token` 
- Added `timeout 10s` to `gcloud projects describe`
- Added `timeout 10s` to find commands in get_oauth_client_config()
- Already had `timeout 5s` on the PROJECT_NUMBER fetch

### 3. Created a safe alternative script
- Created `setup-oauth-safe.sh` that avoids all potentially hanging gcloud commands
- This script focuses only on finding existing OAuth files and creating environment files
- No complex gcloud API calls that could hang

## How to Use

### Option 1: Use the updated main script
```bash
./setup-oauth.sh
```

### Option 2: Use the safe script (recommended if still having issues)
```bash
./setup-oauth-safe.sh
```

### Option 3: Manual setup
1. Download your OAuth client credentials from Google Cloud Console
2. Save as a JSON file in the project directory
3. Run the safe setup script to configure environment files

## Testing
Run the test script to verify your setup:
```bash
./test-oauth-setup.sh
```

## If Still Hanging
1. Check for hanging processes: `ps aux | grep gcloud`
2. Kill any hanging processes: `pkill -f gcloud`
3. Use the safe setup script instead
4. Manually download OAuth credentials from Google Cloud Console