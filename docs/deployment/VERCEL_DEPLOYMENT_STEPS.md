# Vercel Deployment Steps

## Step 1: Login to Vercel

Run this command and follow the prompts:
```bash
npx vercel login
```

You'll be asked to:
1. Choose your login method (GitHub, GitLab, Bitbucket, or Email)
2. Authorize in your browser
3. Return to terminal once authorized

## Step 2: Deploy to Vercel

Once logged in, run:
```bash
npx vercel
```

You'll be prompted with these questions:

1. **Set up and deploy "~/development/screenmark/image-markup-app"?** → `Y`
2. **Which scope do you want to deploy to?** → Select your account
3. **Link to existing project?** → `N` (for first time)
4. **What's your project's name?** → `image-markup-app` (or your preferred name)
5. **In which directory is your code located?** → `./` (press Enter)
6. **Want to override the settings?** → `N`

## Step 3: Set Environment Variables

After initial deployment, set your environment variables:

```bash
# Set production environment variables
npx vercel env add VITE_GOOGLE_CLIENT_ID production
npx vercel env add VITE_GOOGLE_API_KEY production
```

Or do it via the dashboard:
1. Go to https://vercel.com/dashboard
2. Click on your project
3. Go to "Settings" → "Environment Variables"
4. Add:
   - Name: `VITE_GOOGLE_CLIENT_ID`
   - Value: Your Google Client ID
   - Environment: Production
5. Repeat for `VITE_GOOGLE_API_KEY`

## Step 4: Deploy to Production

After setting environment variables:
```bash
npx vercel --prod
```

## Step 5: Update Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to "APIs & Services" → "Credentials"
4. Click on your OAuth 2.0 Client ID
5. Add to "Authorized JavaScript origins":
   - `https://image-markup-app.vercel.app`
   - `https://your-custom-domain.com` (if you have one)
   - Your preview URLs (format: `https://image-markup-app-*.vercel.app`)

## Your URLs

After deployment, you'll have:
- **Production**: `https://image-markup-app.vercel.app`
- **Preview**: `https://image-markup-app-git-main-yourusername.vercel.app`

## Next Steps

1. **Custom Domain** (optional):
   ```bash
   npx vercel domains add your-domain.com
   ```

2. **Set up Git Integration**:
   - Push your code to GitHub
   - Import project in Vercel dashboard
   - Enable automatic deployments

3. **Monitor Deployments**:
   - Dashboard: https://vercel.com/dashboard
   - Analytics: Built-in analytics in dashboard
   - Logs: Real-time function logs

## Useful Commands

```bash
# View all deployments
npx vercel ls

# View deployment details
npx vercel inspect [url]

# Remove a deployment
npx vercel rm [url]

# View environment variables
npx vercel env ls

# Pull environment variables locally
npx vercel env pull .env.local
```

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Run `npm run build` locally to test

### Environment Variables Not Working
- Redeploy after adding env vars: `npx vercel --prod`
- Ensure variable names start with `VITE_`
- Check they're set for the correct environment

### OAuth Errors
- Double-check authorized origins in Google Console
- Include both `https://` and without trailing slash
- Wait 5-10 minutes for Google changes to propagate