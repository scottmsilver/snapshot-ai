#!/bin/bash

# Main setup and deployment script
# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== Image Markup App - Setup & Deploy ===${NC}\n"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Environment Setup
echo -e "${GREEN}Step 1: Setting up Google OAuth${NC}"
echo "This will create your .env files and generate configuration guides"
echo ""

if [ ! -f ".env.production" ]; then
    ./scripts/setup-google-oauth.sh
else
    echo -e "${YELLOW}Environment files already exist. Skipping...${NC}"
    echo "To reconfigure, run: ./scripts/setup-google-oauth.sh"
fi

echo ""
echo -e "${GREEN}Step 2: Google Cloud Configuration${NC}"
echo "You have two options:"
echo "1. Use the Python helper script (recommended)"
echo "2. Follow the manual guide in google-oauth-setup.md"
echo ""

read -p "Would you like to run the Python configuration helper? (y/N): " run_python
if [[ "$run_python" =~ ^[Yy]$ ]]; then
    if command_exists python3; then
        python3 scripts/configure-google-cloud.py
    else
        echo -e "${YELLOW}Python 3 not found. Please refer to google-oauth-setup.md${NC}"
    fi
else
    echo "Please follow the instructions in google-oauth-setup.md"
fi

echo ""
echo -e "${GREEN}Step 3: Vercel Deployment${NC}"

# Check if Vercel CLI is available
if ! command_exists vercel; then
    echo "Installing Vercel CLI..."
    npm i -g vercel
fi

# Login to Vercel
echo "Checking Vercel authentication..."
if ! npx vercel whoami &> /dev/null; then
    echo "Please login to Vercel:"
    npx vercel login
fi

echo ""
read -p "Have you configured Google Cloud OAuth settings? (y/N): " oauth_done
if [[ ! "$oauth_done" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Please complete the Google Cloud configuration before deploying${NC}"
    echo "Refer to google-oauth-setup.md for instructions"
    exit 1
fi

echo ""
echo -e "${GREEN}Deploying to Vercel...${NC}"

# Initial deployment
echo "Running initial deployment..."
npx vercel

echo ""
echo -e "${GREEN}Setting environment variables in Vercel...${NC}"
./scripts/setup-vercel-env.sh

echo ""
echo -e "${GREEN}Deploying to production...${NC}"
npx vercel --prod

echo ""
echo -e "${BLUE}=== Deployment Complete! ===${NC}"
echo ""
echo -e "${GREEN}Your app is now live!${NC}"
echo "Production URL: https://$(npx vercel ls --json | grep -o '"url":"[^"]*' | head -1 | cut -d'"' -f4)"
echo ""
echo -e "${YELLOW}Important: Remember to add your Vercel URLs to Google OAuth:${NC}"
echo "1. Production URL"
echo "2. Preview URLs (with wildcard pattern)"
echo "3. Any custom domain"
echo ""
echo "Check google-oauth-setup.md for the complete list of URLs to add"