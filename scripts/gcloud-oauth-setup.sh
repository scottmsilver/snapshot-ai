#!/bin/bash

# Google Cloud OAuth Setup using gcloud CLI
# This script automates as much as possible using gcloud commands

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Functions
print_header() {
    echo -e "\n${MAGENTA}=== $1 ===${NC}"
}

print_step() {
    echo -e "\n${BLUE}Step $1: $2${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI not found!"
    echo "Please install the Google Cloud SDK:"
    echo "https://cloud.google.com/sdk/docs/install"
    exit 1
fi

print_header "Google Cloud OAuth Setup"

# Get current project
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)

# Get project ID
if [ ! -z "$CURRENT_PROJECT" ]; then
    read -p "Enter Google Cloud Project ID (default: $CURRENT_PROJECT): " PROJECT_ID
    PROJECT_ID=${PROJECT_ID:-$CURRENT_PROJECT}
else
    read -p "Enter Google Cloud Project ID: " PROJECT_ID
    if [ -z "$PROJECT_ID" ]; then
        print_error "Project ID is required!"
        exit 1
    fi
fi

# Set project
print_step 1 "Setting active project"
gcloud config set project $PROJECT_ID
print_success "Project set to $PROJECT_ID"

# Check authentication
print_step 2 "Checking authentication"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    print_warning "Not authenticated. Starting login..."
    gcloud auth login
fi

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
print_success "Authenticated as: $ACTIVE_ACCOUNT"

# Enable required APIs
print_step 3 "Enabling required APIs"

APIS=(
    "drive.googleapis.com"
    "iamcredentials.googleapis.com"
    "apikeys.googleapis.com"
    "serviceusage.googleapis.com"
)

for API in "${APIS[@]}"; do
    echo -n "  Enabling $API..."
    if gcloud services enable $API --quiet 2>/dev/null; then
        echo -e " ${GREEN}✓${NC}"
    else
        # Check if already enabled
        if gcloud services list --enabled --filter="name:$API" --format="value(name)" | grep -q "$API"; then
            echo -e " ${GREEN}✓ (already enabled)${NC}"
        else
            echo -e " ${RED}✗${NC}"
        fi
    fi
done

# API Key Management
print_step 4 "Managing API Keys"

# Check if alpha commands are available
if ! gcloud alpha 2>&1 | grep -q "Available command groups"; then
    print_warning "Alpha commands not available. Installing..."
    gcloud components install alpha --quiet
fi

# First check for existing API keys
echo "Checking for existing API keys..."
EXISTING_KEYS=$(gcloud alpha services api-keys list --format=json 2>/dev/null || echo "[]")

if [ "$EXISTING_KEYS" != "[]" ] && [ "$EXISTING_KEYS" != "" ]; then
    KEY_COUNT=$(echo "$EXISTING_KEYS" | jq '. | length' 2>/dev/null || echo "0")
    if [ "$KEY_COUNT" -gt 0 ]; then
        print_success "Found $KEY_COUNT existing API key(s):"
        echo "$EXISTING_KEYS" | jq -r '.[] | "  - \(.displayName // "Unnamed") (ID: \(.name | split("/") | last))"' 2>/dev/null
        
        echo ""
        read -p "Use an existing API key? (y/N): " USE_EXISTING
        
        if [[ "$USE_EXISTING" =~ ^[Yy]$ ]]; then
            # List keys with numbers
            echo ""
            echo "$EXISTING_KEYS" | jq -r '. | to_entries | .[] | "  \(.key + 1). \(.value.displayName // "Unnamed")"' 2>/dev/null
            
            read -p "Enter the number of the key to use: " KEY_NUM
            KEY_INDEX=$((KEY_NUM - 1))
            
            # Get the selected key
            SELECTED_KEY=$(echo "$EXISTING_KEYS" | jq -r ".[$KEY_INDEX].name" 2>/dev/null)
            if [ ! -z "$SELECTED_KEY" ] && [ "$SELECTED_KEY" != "null" ]; then
                API_KEY=$(gcloud alpha services api-keys get-key-string "$SELECTED_KEY" --format="value(keyString)" 2>/dev/null || echo "")
                if [ ! -z "$API_KEY" ]; then
                    print_success "Using existing API Key: ${API_KEY:0:10}..."
                    echo "$API_KEY" > .api-key.txt
                    chmod 600 .api-key.txt
                fi
            fi
        fi
    fi
fi

# Create new API key if not using existing
if [ -z "$API_KEY" ]; then
    API_KEY_NAME="Image Markup App API Key"
    echo "Creating new API key: $API_KEY_NAME"
    
    # Create API key using REST API via gcloud
    API_KEY_RESPONSE=$(gcloud alpha services api-keys create \
        --display-name="$API_KEY_NAME" \
        --format=json 2>/dev/null || echo "")
    
    if [ ! -z "$API_KEY_RESPONSE" ]; then
        # Extract key string from response
        KEY_NAME=$(echo "$API_KEY_RESPONSE" | jq -r '.name' 2>/dev/null || echo "")
        if [ ! -z "$KEY_NAME" ]; then
            # Wait a moment for key to be ready
            sleep 2
            
            # Get the key string
            API_KEY=$(gcloud alpha services api-keys get-key-string "$KEY_NAME" --format="value(keyString)" 2>/dev/null || echo "")
            
            if [ ! -z "$API_KEY" ]; then
                print_success "API Key created: ${API_KEY:0:10}..."
                
                # Save API key to file
                echo "$API_KEY" > .api-key.txt
                chmod 600 .api-key.txt
                print_success "API Key saved to .api-key.txt (keep this secure!)"
            fi
        fi
    else
        print_warning "Could not create API key via CLI"
        echo "You'll need to create it manually in the console"
    fi
fi

# OAuth Client Configuration
print_step 5 "OAuth Client Configuration"

# Check for existing OAuth credentials
echo "Checking for existing OAuth credentials..."

# Look for downloaded credentials files
OAUTH_CLIENT_ID=""
for CRED_FILE in credentials.json client_secret*.json ~/Downloads/client_secret*.json; do
    if [ -f "$CRED_FILE" ]; then
        print_success "Found credentials file: $CRED_FILE"
        
        # Try to extract client ID
        CLIENT_ID=$(jq -r '.web.client_id // .installed.client_id' "$CRED_FILE" 2>/dev/null)
        if [ ! -z "$CLIENT_ID" ] && [ "$CLIENT_ID" != "null" ]; then
            OAUTH_CLIENT_ID="$CLIENT_ID"
            print_success "Found OAuth Client ID: ${OAUTH_CLIENT_ID:0:30}..."
            
            # Ask if user wants to use this
            read -p "Use this OAuth client? (Y/n): " USE_OAUTH
            if [[ ! "$USE_OAUTH" =~ ^[Nn]$ ]]; then
                # Copy credentials file to project
                cp "$CRED_FILE" ./oauth-credentials.json
                print_success "Copied credentials to ./oauth-credentials.json"
                break
            else
                OAUTH_CLIENT_ID=""
            fi
        fi
    fi
done

# Get app details
read -p "Enter your app name (default: Image Markup App): " APP_NAME
APP_NAME=${APP_NAME:-"Image Markup App"}

read -p "Enter your Vercel app name (e.g., image-markup-app): " VERCEL_APP
VERCEL_APP=${VERCEL_APP:-"image-markup-app"}

read -p "Enter your email address: " USER_EMAIL

read -p "Enter custom domain (optional, press Enter to skip): " CUSTOM_DOMAIN

# Generate OAuth URLs
print_step 6 "Generating OAuth configuration"

OAUTH_ORIGINS=(
    "http://localhost:5173"
    "http://localhost:5174"
    "http://localhost:4173"
    "https://$VERCEL_APP.vercel.app"
    "https://$VERCEL_APP-*.vercel.app"
)

if [ ! -z "$CUSTOM_DOMAIN" ]; then
    OAUTH_ORIGINS+=("https://$CUSTOM_DOMAIN")
    OAUTH_ORIGINS+=("https://www.$CUSTOM_DOMAIN")
fi

# Create OAuth configuration file
cat > oauth-urls.txt << EOF
=== OAuth Configuration for $APP_NAME ===

Project ID: $PROJECT_ID
App Name: $APP_NAME
Vercel App: $VERCEL_APP
${CUSTOM_DOMAIN:+Custom Domain: $CUSTOM_DOMAIN}

Authorized JavaScript Origins:
EOF

for URL in "${OAUTH_ORIGINS[@]}"; do
    echo "$URL" >> oauth-urls.txt
done

echo "" >> oauth-urls.txt
echo "Authorized Redirect URIs:" >> oauth-urls.txt

for URL in "${OAUTH_ORIGINS[@]}"; do
    echo "$URL" >> oauth-urls.txt
done

print_success "OAuth configuration saved to oauth-urls.txt"

# Create environment files
print_step 7 "Creating environment files"

# Determine what we have
HAS_CLIENT_ID=false
HAS_API_KEY=false

if [ ! -z "$OAUTH_CLIENT_ID" ]; then
    HAS_CLIENT_ID=true
fi

if [ ! -z "$API_KEY" ]; then
    HAS_API_KEY=true
fi

# Create environment files based on what we found
if [ "$HAS_CLIENT_ID" = true ] && [ "$HAS_API_KEY" = true ]; then
    # We have everything - create complete env files
    cat > .env.local << EOF
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=$OAUTH_CLIENT_ID
VITE_GOOGLE_API_KEY=$API_KEY
VITE_GOOGLE_DRIVE_APP_ID=

# Generated on $(date)
EOF
    
    cp .env.local .env.production
    print_success "Created complete .env.local and .env.production files"
    
elif [ "$HAS_CLIENT_ID" = true ] || [ "$HAS_API_KEY" = true ]; then
    # We have partial info - create template with what we have
    cat > .env.template << EOF
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=${OAUTH_CLIENT_ID:-YOUR_CLIENT_ID_HERE}
VITE_GOOGLE_API_KEY=${API_KEY:-YOUR_API_KEY_HERE}
VITE_GOOGLE_DRIVE_APP_ID=

# Generated on $(date)
EOF
    print_success "Created .env.template with partial configuration"
    print_warning "Copy to .env.local and .env.production and fill in missing values"
    
else
    # We have nothing - create empty template
    cat > .env.template << EOF
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
VITE_GOOGLE_API_KEY=YOUR_API_KEY_HERE
VITE_GOOGLE_DRIVE_APP_ID=

# Generated on $(date)
EOF
    print_warning "Created .env.template - fill in all values"
fi

print_success "Environment template created: .env.template"

# Create setup instructions
print_step 8 "Creating setup instructions"

cat > google-cloud-setup-instructions.md << EOF
# Google Cloud Console Setup Instructions

Generated on: $(date)

## Project Details
- **Project ID**: $PROJECT_ID
- **App Name**: $APP_NAME
- **Email**: $USER_EMAIL

## Quick Links
- [Google Cloud Console](https://console.cloud.google.com/welcome?project=$PROJECT_ID)
- [APIs & Services](https://console.cloud.google.com/apis/dashboard?project=$PROJECT_ID)
- [Credentials](https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID)
- [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT_ID)

## Manual Steps Required

### 1. Configure OAuth Consent Screen
1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT_ID)
2. Select "External" user type
3. Fill in:
   - **App name**: $APP_NAME
   - **User support email**: $USER_EMAIL
   - **Developer contact**: $USER_EMAIL
4. Add scopes:
   - \`openid\`
   - \`email\`
   - \`profile\`
   - \`https://www.googleapis.com/auth/drive.file\`
5. Save and continue

### 2. Create OAuth 2.0 Client ID
1. Go to [Credentials](https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID)
2. Click "+ CREATE CREDENTIALS" → "OAuth client ID"
3. Select "Web application"
4. Name: "$APP_NAME"
5. Add Authorized JavaScript origins (from oauth-urls.txt)
6. Add Authorized redirect URIs (from oauth-urls.txt)
7. Click "Create"
8. Copy the Client ID

### 3. Update Environment Files
1. Copy \`.env.template\` to \`.env.local\` and \`.env.production\`
2. Replace \`YOUR_CLIENT_ID_HERE\` with your actual Client ID
${API_KEY:+3. Your API Key is already set: ${API_KEY:0:10}...}

### 4. Deploy to Vercel
\`\`\`bash
# Set up Vercel environment variables
npx vercel env add VITE_GOOGLE_CLIENT_ID production
npx vercel env add VITE_GOOGLE_API_KEY production

# Deploy
npx vercel --prod
\`\`\`

## Files Created
- \`oauth-urls.txt\` - OAuth URLs to add in Google Cloud Console
- \`.env.template\` - Environment variable template
- \`.api-key.txt\` - Your API key (if created)
- \`google-cloud-setup-instructions.md\` - This file

## Troubleshooting
- If you see "redirect_uri_mismatch", ensure ALL URLs are added exactly as shown
- Changes may take 5-30 minutes to propagate
- For "Access blocked" errors, check the OAuth consent screen configuration
EOF

print_success "Setup instructions created: google-cloud-setup-instructions.md"

# Generate quick open URL
CONSOLE_URL="https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"

# Summary
print_header "Setup Summary"

echo -e "\n${GREEN}✓ Automated steps completed:${NC}"
echo "  • Project configured: $PROJECT_ID"
echo "  • APIs enabled"
if [ ! -z "$API_KEY" ]; then
    echo "  • API Key: ${API_KEY:0:10}..."
fi
if [ ! -z "$OAUTH_CLIENT_ID" ]; then
    echo "  • OAuth Client ID: ${OAUTH_CLIENT_ID:0:30}..."
fi
echo "  • Configuration files generated"

# Determine what manual steps are needed
MANUAL_STEPS_NEEDED=false

echo -e "\n${YELLOW}⚠ Manual steps required:${NC}"

if [ -z "$OAUTH_CLIENT_ID" ]; then
    echo "  1. Configure OAuth consent screen"
    echo "  2. Create OAuth 2.0 Client ID"
    echo "  3. Add URLs from oauth-urls.txt"
    MANUAL_STEPS_NEEDED=true
else
    echo "  1. Verify OAuth consent screen is configured"
    echo "  2. Update OAuth client with URLs from oauth-urls.txt (if needed)"
fi

if [ -z "$API_KEY" ]; then
    echo "  3. Create API key in Google Cloud Console"
    MANUAL_STEPS_NEEDED=true
fi

if [ "$HAS_CLIENT_ID" != true ] || [ "$HAS_API_KEY" != true ]; then
    echo "  4. Update .env files with missing credentials"
    MANUAL_STEPS_NEEDED=true
fi

echo -e "\n${BLUE}Quick link to Google Cloud Console:${NC}"
echo "$CONSOLE_URL"

echo -e "\n${GREEN}Next steps:${NC}"
echo "1. Open google-cloud-setup-instructions.md for detailed instructions"
echo "2. Complete manual OAuth setup in Google Cloud Console"
echo "3. Copy .env.template to .env.local and .env.production"
echo "4. Update the Client ID in your .env files"
echo "5. Deploy to Vercel"

# Open browser if possible
if command -v xdg-open &> /dev/null; then
    read -p "Open Google Cloud Console in browser? (y/N): " OPEN_BROWSER
    if [[ "$OPEN_BROWSER" =~ ^[Yy]$ ]]; then
        xdg-open "$CONSOLE_URL"
    fi
elif command -v open &> /dev/null; then
    read -p "Open Google Cloud Console in browser? (y/N): " OPEN_BROWSER
    if [[ "$OPEN_BROWSER" =~ ^[Yy]$ ]]; then
        open "$CONSOLE_URL"
    fi
fi

print_success "Setup script complete!"