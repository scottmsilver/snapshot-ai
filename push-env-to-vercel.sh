#!/bin/bash

# Script to push existing .env values to Vercel

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}📤 Pushing environment variables to Vercel${NC}"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ No .env file found!${NC}"
    exit 1
fi

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}⚠️  Vercel CLI not found. Installing...${NC}"
    npm i -g vercel
fi

# Function to read env value
get_env_value() {
    local key=$1
    local value=$(grep "^$key=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    echo "$value"
}

# Read values from .env
CLIENT_ID=$(get_env_value "VITE_GOOGLE_CLIENT_ID")
API_KEY=$(get_env_value "VITE_GOOGLE_API_KEY")
DRIVE_APP_ID=$(get_env_value "VITE_GOOGLE_DRIVE_APP_ID")

echo "Found environment variables:"
echo "  CLIENT_ID: ${CLIENT_ID:0:30}..."
echo "  API_KEY: ${API_KEY:0:20}..."
echo "  DRIVE_APP_ID: $DRIVE_APP_ID"
echo ""

# Ensure we're logged in to Vercel
echo -e "${BLUE}Checking Vercel authentication...${NC}"
if ! vercel whoami &>/dev/null; then
    echo -e "${YELLOW}Please log in to Vercel:${NC}"
    vercel login
fi

# Link to Vercel project if not already linked
if [ ! -f ".vercel/project.json" ]; then
    echo -e "${BLUE}Linking to Vercel project...${NC}"
    vercel link
fi

# Set environment variables
echo -e "${BLUE}Setting environment variables in Vercel...${NC}"

# Set for all environments (development, preview, production)
echo "Setting VITE_GOOGLE_CLIENT_ID..."
echo "$CLIENT_ID" | vercel env add VITE_GOOGLE_CLIENT_ID production --force
echo "$CLIENT_ID" | vercel env add VITE_GOOGLE_CLIENT_ID preview --force
echo "$CLIENT_ID" | vercel env add VITE_GOOGLE_CLIENT_ID development --force

echo "Setting VITE_GOOGLE_API_KEY..."
echo "$API_KEY" | vercel env add VITE_GOOGLE_API_KEY production --force
echo "$API_KEY" | vercel env add VITE_GOOGLE_API_KEY preview --force
echo "$API_KEY" | vercel env add VITE_GOOGLE_API_KEY development --force

if [ ! -z "$DRIVE_APP_ID" ]; then
    echo "Setting VITE_GOOGLE_DRIVE_APP_ID..."
    echo "$DRIVE_APP_ID" | vercel env add VITE_GOOGLE_DRIVE_APP_ID production --force
    echo "$DRIVE_APP_ID" | vercel env add VITE_GOOGLE_DRIVE_APP_ID preview --force
    echo "$DRIVE_APP_ID" | vercel env add VITE_GOOGLE_DRIVE_APP_ID development --force
fi

echo ""
echo -e "${GREEN}✅ Environment variables pushed to Vercel!${NC}"
echo ""

# Ask if user wants to deploy
read -p "Would you like to deploy to Vercel now? (y/N): " DEPLOY_NOW

if [[ "$DEPLOY_NOW" =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🚀 Deploying to Vercel...${NC}"
    vercel --prod
else
    echo -e "${YELLOW}To deploy later, run: vercel --prod${NC}"
fi