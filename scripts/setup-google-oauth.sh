#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Google OAuth Setup Script ===${NC}\n"

# Function to validate input
validate_input() {
    if [ -z "$1" ]; then
        echo -e "${RED}Error: Input cannot be empty${NC}"
        return 1
    fi
    return 0
}

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo -e "${YELLOW}Warning: .env.local already exists${NC}"
    read -p "Do you want to overwrite it? (y/N): " overwrite
    if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env.local file"
        USE_EXISTING=true
    fi
fi

# Check if .env.production exists
if [ -f ".env.production" ]; then
    echo -e "${YELLOW}Warning: .env.production already exists${NC}"
    read -p "Do you want to overwrite it? (y/N): " overwrite_prod
    if [[ ! "$overwrite_prod" =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env.production file"
        USE_EXISTING_PROD=true
    fi
fi

echo -e "\n${GREEN}Step 1: Collecting Google OAuth Credentials${NC}"
echo "You'll need to get these from the Google Cloud Console"
echo -e "${BLUE}https://console.cloud.google.com${NC}\n"

# Collect Google Client ID
while true; do
    read -p "Enter your Google Client ID: " GOOGLE_CLIENT_ID
    if validate_input "$GOOGLE_CLIENT_ID"; then
        break
    fi
done

# Collect Google API Key
while true; do
    read -p "Enter your Google API Key: " GOOGLE_API_KEY
    if validate_input "$GOOGLE_API_KEY"; then
        break
    fi
done

# Collect Google Drive App ID (optional)
read -p "Enter your Google Drive App ID (optional, press Enter to skip): " GOOGLE_DRIVE_APP_ID

# Collect domains for OAuth
echo -e "\n${GREEN}Step 2: Domain Configuration${NC}"
read -p "Enter your Vercel app name (e.g., 'image-markup-app'): " APP_NAME
if [ -z "$APP_NAME" ]; then
    APP_NAME="image-markup-app"
fi

read -p "Do you have a custom domain? (y/N): " has_custom
if [[ "$has_custom" =~ ^[Yy]$ ]]; then
    read -p "Enter your custom domain (e.g., 'example.com'): " CUSTOM_DOMAIN
fi

# Create .env.local file
if [ "$USE_EXISTING" != true ]; then
    echo -e "\n${GREEN}Creating .env.local file...${NC}"
    cat > .env.local << EOF
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
VITE_GOOGLE_API_KEY=$GOOGLE_API_KEY
VITE_GOOGLE_DRIVE_APP_ID=$GOOGLE_DRIVE_APP_ID

# Generated on $(date)
EOF
    echo -e "${GREEN}✓ Created .env.local${NC}"
fi

# Create .env.production file
if [ "$USE_EXISTING_PROD" != true ]; then
    echo -e "\n${GREEN}Creating .env.production file...${NC}"
    cat > .env.production << EOF
# Google OAuth Configuration for Production
VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
VITE_GOOGLE_API_KEY=$GOOGLE_API_KEY
VITE_GOOGLE_DRIVE_APP_ID=$GOOGLE_DRIVE_APP_ID

# Generated on $(date)
EOF
    echo -e "${GREEN}✓ Created .env.production${NC}"
fi

# Generate OAuth configuration guide
echo -e "\n${GREEN}Generating Google Cloud Console configuration guide...${NC}"
cat > google-oauth-setup.md << EOF
# Google Cloud Console OAuth Setup

Generated on: $(date)

## Your Configuration Details

- **Client ID**: \`$GOOGLE_CLIENT_ID\`
- **API Key**: \`$GOOGLE_API_KEY\`
- **App ID**: \`$GOOGLE_DRIVE_APP_ID\`

## Required URLs to Add

### Authorized JavaScript Origins
Add ALL of these URLs to your OAuth 2.0 Client ID configuration:

\`\`\`
http://localhost:5173
http://localhost:5174
http://localhost:4173
https://$APP_NAME.vercel.app
https://$APP_NAME-*.vercel.app
EOF

if [ ! -z "$CUSTOM_DOMAIN" ]; then
    echo "https://$CUSTOM_DOMAIN" >> google-oauth-setup.md
    echo "https://www.$CUSTOM_DOMAIN" >> google-oauth-setup.md
fi

cat >> google-oauth-setup.md << EOF
\`\`\`

### Authorized Redirect URIs
Add these URIs:

\`\`\`
http://localhost:5173
http://localhost:5174
http://localhost:4173
https://$APP_NAME.vercel.app
https://$APP_NAME-*.vercel.app
EOF

if [ ! -z "$CUSTOM_DOMAIN" ]; then
    echo "https://$CUSTOM_DOMAIN" >> google-oauth-setup.md
    echo "https://www.$CUSTOM_DOMAIN" >> google-oauth-setup.md
fi

cat >> google-oauth-setup.md << EOF
\`\`\`

## Step-by-Step Instructions

1. **Go to Google Cloud Console**
   - Navigate to: https://console.cloud.google.com/
   - Select your project (or create a new one)

2. **Enable Required APIs**
   - Go to "APIs & Services" → "Library"
   - Search and enable:
     - Google Drive API
     - Google Identity Service (if not already enabled)

3. **Configure OAuth Consent Screen**
   - Go to "APIs & Services" → "OAuth consent screen"
   - Select "External" user type
   - Fill in required fields:
     - App name: "$APP_NAME"
     - User support email: Your email
     - Developer contact: Your email
   - Add scopes:
     - \`openid\`
     - \`email\`
     - \`profile\`
     - \`https://www.googleapis.com/auth/drive.file\`

4. **Update OAuth 2.0 Client ID**
   - Go to "APIs & Services" → "Credentials"
   - Click on your OAuth 2.0 Client ID
   - Add all the URLs listed above to:
     - Authorized JavaScript origins
     - Authorized redirect URIs
   - Click "Save"

5. **Important Notes**
   - Changes may take 5-30 minutes to propagate
   - Use exact URLs (no trailing slashes)
   - Include both http and https variants for localhost
   - The wildcard pattern \`*\` in \`$APP_NAME-*.vercel.app\` covers all preview deployments

## Vercel Environment Variables

Set these in your Vercel dashboard or via CLI:

\`\`\`bash
vercel env add VITE_GOOGLE_CLIENT_ID production
# Value: $GOOGLE_CLIENT_ID

vercel env add VITE_GOOGLE_API_KEY production
# Value: $GOOGLE_API_KEY

vercel env add VITE_GOOGLE_DRIVE_APP_ID production
# Value: $GOOGLE_DRIVE_APP_ID
\`\`\`

## Testing Your Configuration

1. **Local Development**:
   \`\`\`bash
   npm run dev
   \`\`\`
   Test login at http://localhost:5173

2. **Production**:
   After deploying to Vercel, test at https://$APP_NAME.vercel.app

## Troubleshooting

- **"redirect_uri_mismatch" error**: Double-check all URLs are added exactly as shown
- **"Access blocked" error**: Ensure OAuth consent screen is configured
- **Login popup blocked**: Check browser popup settings
- **Token errors**: Verify API key is correct and APIs are enabled
EOF

echo -e "${GREEN}✓ Created google-oauth-setup.md${NC}"

# Create Vercel environment setup script
echo -e "\n${GREEN}Creating Vercel environment setup script...${NC}"
cat > scripts/setup-vercel-env.sh << 'EOF'
#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Setting up Vercel environment variables...${NC}"

# Check if logged in to Vercel
if ! npx vercel whoami &> /dev/null; then
    echo "Please login to Vercel first:"
    npx vercel login
fi

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo -e "${YELLOW}Error: .env.production not found${NC}"
    echo "Please run ./scripts/setup-google-oauth.sh first"
    exit 1
fi

# Load variables from .env.production
export $(cat .env.production | grep -v '^#' | xargs)

# Set Vercel environment variables
echo "Setting VITE_GOOGLE_CLIENT_ID..."
echo "$VITE_GOOGLE_CLIENT_ID" | npx vercel env add VITE_GOOGLE_CLIENT_ID production

echo "Setting VITE_GOOGLE_API_KEY..."
echo "$VITE_GOOGLE_API_KEY" | npx vercel env add VITE_GOOGLE_API_KEY production

if [ ! -z "$VITE_GOOGLE_DRIVE_APP_ID" ]; then
    echo "Setting VITE_GOOGLE_DRIVE_APP_ID..."
    echo "$VITE_GOOGLE_DRIVE_APP_ID" | npx vercel env add VITE_GOOGLE_DRIVE_APP_ID production
fi

echo -e "\n${GREEN}✓ Environment variables set in Vercel${NC}"
echo "You can now deploy with: npx vercel --prod"
EOF

chmod +x scripts/setup-vercel-env.sh
echo -e "${GREEN}✓ Created scripts/setup-vercel-env.sh${NC}"

# Summary
echo -e "\n${BLUE}=== Setup Complete ===${NC}"
echo -e "\n${GREEN}Next Steps:${NC}"
echo "1. Review the generated files:"
echo "   - .env.local (for local development)"
echo "   - .env.production (for production)"
echo "   - google-oauth-setup.md (detailed setup instructions)"
echo ""
echo "2. Follow the instructions in ${BLUE}google-oauth-setup.md${NC} to configure Google Cloud Console"
echo ""
echo "3. Once Google is configured, set up Vercel environment variables:"
echo "   ${YELLOW}./scripts/setup-vercel-env.sh${NC}"
echo ""
echo "4. Deploy to Vercel:"
echo "   ${YELLOW}npx vercel --prod${NC}"
echo ""
echo -e "${GREEN}Generated URLs for your OAuth configuration:${NC}"
echo "- Production: https://$APP_NAME.vercel.app"
echo "- Preview: https://$APP_NAME-*.vercel.app"
if [ ! -z "$CUSTOM_DOMAIN" ]; then
    echo "- Custom: https://$CUSTOM_DOMAIN"
fi