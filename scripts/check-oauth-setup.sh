#!/bin/bash

# Script to check existing Google Cloud OAuth setup
# This script queries and displays existing API keys and OAuth clients

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

print_header() {
    echo -e "\n${MAGENTA}=== $1 ===${NC}"
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

print_header "Google Cloud OAuth Setup Check"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI not found!"
    echo "Please install the Google Cloud SDK:"
    echo "https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    print_error "No Google Cloud project set"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

print_success "Current project: $PROJECT_ID"

# Check authentication
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)
if [ -z "$ACTIVE_ACCOUNT" ]; then
    print_error "Not authenticated with Google Cloud"
    echo "Run: gcloud auth login"
    exit 1
fi
print_success "Authenticated as: $ACTIVE_ACCOUNT"

# Check APIs
print_header "Checking Required APIs"

REQUIRED_APIS=(
    "drive.googleapis.com"
    "iamcredentials.googleapis.com"
    "apikeys.googleapis.com"
)

ALL_APIS_ENABLED=true
for API in "${REQUIRED_APIS[@]}"; do
    if gcloud services list --enabled --filter="name:$API" --format="value(name)" | grep -q "$API"; then
        print_success "$API is enabled"
    else
        print_error "$API is NOT enabled"
        ALL_APIS_ENABLED=false
    fi
done

# Check for API Keys
print_header "Checking API Keys"

if command -v jq &> /dev/null; then
    EXISTING_KEYS=$(gcloud alpha services api-keys list --format=json 2>/dev/null || echo "[]")
    KEY_COUNT=$(echo "$EXISTING_KEYS" | jq '. | length' 2>/dev/null || echo "0")
    
    if [ "$KEY_COUNT" -gt 0 ]; then
        print_success "Found $KEY_COUNT API key(s):"
        echo "$EXISTING_KEYS" | jq -r '.[] | "  • \(.displayName // "Unnamed") (ID: \(.name | split("/") | last))"' 2>/dev/null
        
        # Get the first key's value
        FIRST_KEY=$(echo "$EXISTING_KEYS" | jq -r '.[0].name' 2>/dev/null)
        if [ ! -z "$FIRST_KEY" ] && [ "$FIRST_KEY" != "null" ]; then
            API_KEY=$(gcloud alpha services api-keys get-key-string "$FIRST_KEY" --format="value(keyString)" 2>/dev/null || echo "")
            if [ ! -z "$API_KEY" ]; then
                echo -e "\n  First API Key: ${GREEN}${API_KEY:0:10}...${NC}"
            fi
        fi
    else
        print_warning "No API keys found"
    fi
else
    print_warning "jq not installed - cannot parse API keys"
fi

# Check for OAuth Credentials
print_header "Checking OAuth Credentials"

# Check for downloaded credential files
FOUND_OAUTH=false
for CRED_FILE in credentials.json client_secret*.json oauth-credentials.json ~/Downloads/client_secret*.json; do
    if [ -f "$CRED_FILE" ]; then
        print_success "Found credentials file: $CRED_FILE"
        
        if command -v jq &> /dev/null; then
            CLIENT_ID=$(jq -r '.web.client_id // .installed.client_id' "$CRED_FILE" 2>/dev/null)
            if [ ! -z "$CLIENT_ID" ] && [ "$CLIENT_ID" != "null" ]; then
                echo -e "  Client ID: ${GREEN}${CLIENT_ID:0:30}...${NC}"
                FOUND_OAUTH=true
            fi
        fi
    fi
done

if [ "$FOUND_OAUTH" = false ]; then
    print_warning "No OAuth credential files found"
fi

# Check environment files
print_header "Checking Environment Files"

ENV_FILES=(".env.local" ".env.production" ".env.template")
FOUND_ENV=false

for ENV_FILE in "${ENV_FILES[@]}"; do
    if [ -f "$ENV_FILE" ]; then
        print_success "Found $ENV_FILE"
        FOUND_ENV=true
        
        # Check if it has the required variables
        if grep -q "VITE_GOOGLE_CLIENT_ID" "$ENV_FILE"; then
            CLIENT_ID_VALUE=$(grep "VITE_GOOGLE_CLIENT_ID" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
            if [ "$CLIENT_ID_VALUE" != "YOUR_CLIENT_ID_HERE" ] && [ ! -z "$CLIENT_ID_VALUE" ]; then
                echo "  • Has Client ID: ${CLIENT_ID_VALUE:0:30}..."
            else
                echo "  • Client ID not set"
            fi
        fi
        
        if grep -q "VITE_GOOGLE_API_KEY" "$ENV_FILE"; then
            API_KEY_VALUE=$(grep "VITE_GOOGLE_API_KEY" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
            if [ "$API_KEY_VALUE" != "YOUR_API_KEY_HERE" ] && [ ! -z "$API_KEY_VALUE" ]; then
                echo "  • Has API Key: ${API_KEY_VALUE:0:10}..."
            else
                echo "  • API Key not set"
            fi
        fi
    fi
done

if [ "$FOUND_ENV" = false ]; then
    print_warning "No environment files found"
fi

# Summary
print_header "Setup Status Summary"

echo -e "\nProject: ${BLUE}$PROJECT_ID${NC}"
echo -e "Console: ${BLUE}https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID${NC}"

if [ "$ALL_APIS_ENABLED" = true ]; then
    print_success "All required APIs are enabled"
else
    print_error "Some APIs are not enabled"
fi

if [ "$KEY_COUNT" -gt 0 ]; then
    print_success "API keys are configured"
else
    print_error "No API keys found"
fi

if [ "$FOUND_OAUTH" = true ]; then
    print_success "OAuth credentials found"
else
    print_error "OAuth credentials not found"
fi

if [ "$FOUND_ENV" = true ]; then
    print_success "Environment files exist"
else
    print_error "Environment files missing"
fi

# Quick actions
echo -e "\n${YELLOW}Quick Actions:${NC}"
echo "• Enable missing APIs: gcloud services enable drive.googleapis.com apikeys.googleapis.com"
echo "• Create API key: Run ./scripts/gcloud-oauth-setup.sh"
echo "• Open console: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"