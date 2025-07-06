#!/bin/bash

# Test script to verify OAuth setup without hanging

echo "Testing OAuth setup..."
echo ""

# Check for OAuth files
echo "1. Checking for OAuth credential files..."
for file in *.json ~/Downloads/*.json ~/Desktop/*.json; do
    if [ -f "$file" ] && grep -q '"client_id"' "$file" 2>/dev/null; then
        echo "   Found: $file"
        CLIENT_ID=$(jq -r '.web.client_id // .installed.client_id // empty' "$file" 2>/dev/null)
        if [ ! -z "$CLIENT_ID" ] && [ "$CLIENT_ID" != "null" ]; then
            echo "   Client ID: ${CLIENT_ID:0:50}..."
        fi
    fi
done

echo ""
echo "2. Checking for API key..."
if [ -f ".api-key.txt" ]; then
    echo "   Found .api-key.txt"
else
    echo "   No .api-key.txt found"
fi

echo ""
echo "3. Checking environment files..."
for env_file in .env.local .env.production .env.template; do
    if [ -f "$env_file" ]; then
        echo "   Found $env_file"
        if grep -q "VITE_GOOGLE_CLIENT_ID" "$env_file"; then
            echo "   - Has VITE_GOOGLE_CLIENT_ID"
        fi
        if grep -q "VITE_GOOGLE_API_KEY" "$env_file"; then
            echo "   - Has VITE_GOOGLE_API_KEY"
        fi
    fi
done

echo ""
echo "Test complete!"