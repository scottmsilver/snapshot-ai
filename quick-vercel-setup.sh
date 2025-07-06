#!/bin/bash

# Quick script to push .env to Vercel and deploy

echo "🚀 Quick Vercel Setup"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ No .env file found!"
    exit 1
fi

# Extract values and push to Vercel in one go
grep -E "^VITE_" .env | while IFS='=' read -r key value; do
    echo "Setting $key..."
    echo "$value" | vercel env add "$key" production preview development --force
done

echo ""
echo "✅ Environment variables set!"
echo ""

# Deploy
echo "Deploying to production..."
vercel --prod