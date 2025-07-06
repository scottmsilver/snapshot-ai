#!/bin/bash

# Safe Google OAuth Setup Script for Image Markup App
# This version avoids all potentially hanging gcloud commands

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Helper functions
print_header() {
    echo -e "\n${MAGENTA}${BOLD}$1${NC}"
    echo -e "${MAGENTA}$(printf '=%.0s' {1..60})${NC}"
}

print_step() {
    echo -e "\n${BLUE}▶ $1${NC}"
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

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

# Main setup
print_header "Safe Google OAuth Setup"

# Step 1: Find existing OAuth credential files
print_step "Searching for existing OAuth credential files..."

FOUND_OAUTH=false
OAUTH_CLIENT_ID=""
OAUTH_FILE=""

# Search in common locations
SEARCH_PATHS=(
    "."
    "$HOME/Downloads"
    "$HOME/Desktop"
    "$HOME/Documents"
    "./credentials"
    "./.credentials"
)

for SEARCH_PATH in "${SEARCH_PATHS[@]}"; do
    if [ -d "$SEARCH_PATH" ]; then
        # Use simple find with timeout
        for pattern in "*client*.json" "*credentials*.json" "*oauth*.json"; do
            while IFS= read -r file; do
                if [ -f "$file" ]; then
                    # Check if it's a valid OAuth client file
                    if grep -q '"client_id"' "$file" 2>/dev/null && \
                       (grep -q '"web"' "$file" 2>/dev/null || grep -q '"installed"' "$file" 2>/dev/null); then
                        
                        CLIENT_ID=$(jq -r '.web.client_id // .installed.client_id // empty' "$file" 2>/dev/null)
                        if [ ! -z "$CLIENT_ID" ] && [ "$CLIENT_ID" != "null" ]; then
                            print_success "Found OAuth client file: ${file##*/}"
                            echo "  Client ID: ${CLIENT_ID:0:50}..."
                            FOUND_OAUTH=true
                            OAUTH_CLIENT_ID="$CLIENT_ID"
                            OAUTH_FILE="$file"
                            break 3
                        fi
                    fi
                fi
            done < <(find "$SEARCH_PATH" -maxdepth 2 -name "$pattern" 2>/dev/null)
        done
    fi
done

# Step 2: Handle OAuth client
if [ "$FOUND_OAUTH" = true ]; then
    print_success "Using OAuth client from: ${OAUTH_FILE##*/}"
    
    # Copy to project directory
    cp "$OAUTH_FILE" ./oauth-credentials.json
    print_success "OAuth credentials copied to ./oauth-credentials.json"
else
    print_warning "No OAuth client files found"
    echo ""
    echo "Please:"
    echo "1. Go to https://console.cloud.google.com/apis/credentials"
    echo "2. Create or download your OAuth 2.0 Client ID"
    echo "3. Save the JSON file and run this script again"
    echo ""
    read -p "Enter OAuth Client ID manually (or press Enter to skip): " MANUAL_CLIENT_ID
    if [ ! -z "$MANUAL_CLIENT_ID" ]; then
        OAUTH_CLIENT_ID="$MANUAL_CLIENT_ID"
    fi
fi

# Step 3: Get API Key
print_step "API Key Setup"

API_KEY=""
if [ -f ".api-key.txt" ]; then
    API_KEY=$(cat .api-key.txt)
    print_success "Found existing API key file"
else
    echo ""
    echo "To get an API key:"
    echo "1. Go to https://console.cloud.google.com/apis/credentials"
    echo "2. Click '+ CREATE CREDENTIALS' → 'API key'"
    echo "3. Copy the API key"
    echo ""
    read -p "Enter your Google API Key: " MANUAL_API_KEY
    if [ ! -z "$MANUAL_API_KEY" ]; then
        API_KEY="$MANUAL_API_KEY"
        echo "$API_KEY" > .api-key.txt
        chmod 600 .api-key.txt
        print_success "API key saved to .api-key.txt"
    fi
fi

# Step 4: Create environment files
if [ ! -z "$OAUTH_CLIENT_ID" ] && [ ! -z "$API_KEY" ]; then
    print_step "Creating environment files..."
    
    cat > .env.local << EOF
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=$OAUTH_CLIENT_ID
VITE_GOOGLE_API_KEY=$API_KEY
VITE_GOOGLE_DRIVE_APP_ID=

# Generated on $(date)
EOF
    
    cp .env.local .env.production
    
    print_success "Environment files created successfully!"
    
    # Step 5: Deployment prompt
    print_step "Deployment Options"
    echo ""
    echo "Your app is now configured! Next steps:"
    echo ""
    echo "1. Test locally:"
    echo "   npm run dev"
    echo ""
    echo "2. Deploy to Vercel:"
    echo "   npx vercel"
    echo ""
    read -p "Would you like to deploy to Vercel now? (y/N): " DEPLOY_NOW
    
    if [[ "$DEPLOY_NOW" =~ ^[Yy]$ ]]; then
        print_info "Starting Vercel deployment..."
        npx vercel
    fi
else
    print_warning "Setup incomplete"
    echo ""
    echo "Missing configuration:"
    [ -z "$OAUTH_CLIENT_ID" ] && echo "  - OAuth Client ID"
    [ -z "$API_KEY" ] && echo "  - API Key"
    echo ""
    echo "Please obtain the missing credentials from:"
    echo "https://console.cloud.google.com/apis/credentials"
    
    # Create template file
    cat > .env.template << EOF
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=${OAUTH_CLIENT_ID:-YOUR_CLIENT_ID_HERE}
VITE_GOOGLE_API_KEY=${API_KEY:-YOUR_API_KEY_HERE}
VITE_GOOGLE_DRIVE_APP_ID=

# Generated on $(date)
EOF
    
    print_info "Created .env.template with partial configuration"
fi

print_success "Setup complete!"