# Quick Start Deployment Guide

## 🚀 Deploy in 5 Minutes with Vercel

### 1. One-Click Deploy (Easiest)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/image-markup-app)

### 2. Manual Deploy

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Follow the prompts**:
   - Link to existing project? → No
   - What's your project's name? → image-markup-app
   - In which directory is your code located? → ./
   - Want to override the settings? → No

4. **Set Environment Variables** in Vercel Dashboard:
   - Go to your project settings
   - Navigate to "Environment Variables"
   - Add:
     - `VITE_GOOGLE_CLIENT_ID`
     - `VITE_GOOGLE_API_KEY`

5. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

## 🌐 Deploy with Netlify

1. **Drag & Drop Method**:
   - Build locally: `npm run build`
   - Go to [app.netlify.com/drop](https://app.netlify.com/drop)
   - Drag your `dist` folder

2. **CLI Method**:
   ```bash
   npm i -g netlify-cli
   netlify init
   netlify deploy --prod
   ```

## 📋 Pre-deployment Checklist

- [ ] Update `.env.production` with production credentials
- [ ] Add production domain to Google OAuth authorized origins
- [ ] Test build locally: `npm run build && npm run preview`
- [ ] Verify all environment variables are set

## 🔧 Common Issues

### OAuth Redirect Error
- Add `https://yourdomain.com` to Google OAuth authorized JavaScript origins
- Add `https://yourdomain.com` to authorized redirect URIs

### Environment Variables Not Working
- In Vercel/Netlify dashboard, ensure variables are set for production
- Rebuild after adding environment variables

### 404 Errors on Refresh
- Already handled by `vercel.json` and `netlify.toml` configurations

## 🎉 Success!
Your app should now be live at the provided URL. Share it with the world!