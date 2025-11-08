# Deployment Guide for Image Markup App

## Overview
This is a static React SPA (Single Page Application) built with Vite, which means it can be deployed to any static hosting service. Here are the best deployment options ranked by ease of use and features.

## Prerequisites

1. **Environment Variables**: Create a `.env.production` file with your production credentials:
```env
VITE_GOOGLE_CLIENT_ID=your_production_client_id
VITE_GOOGLE_API_KEY=your_production_api_key
```

2. **Google OAuth Configuration**: Update your Google Cloud Console OAuth settings:
   - Add your production domain to authorized JavaScript origins
   - Add redirect URIs for your production domain

3. **Build the App**:
```bash
npm run build
```
This creates a `dist` folder with optimized static files.

## Deployment Options

### 1. **Vercel** (Recommended - Easiest)
Perfect for React apps with automatic deployments and great performance.

**Steps:**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts, or for production:
vercel --prod
```

**Pros:**
- Zero configuration needed
- Automatic HTTPS
- Great performance with edge network
- Environment variables UI
- Automatic deployments from Git
- Free tier is generous

**vercel.json** (optional):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

### 2. **Netlify** (Also Excellent)
Similar to Vercel with great developer experience.

**Option A - Drag & Drop:**
1. Build locally: `npm run build`
2. Drag the `dist` folder to [Netlify Drop](https://app.netlify.com/drop)

**Option B - CLI:**
```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy

# For production
netlify deploy --prod
```

**netlify.toml** (recommended):
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
```

### 3. **GitHub Pages** (Free for Public Repos)
Good for open source projects.

**Setup:**
1. Install gh-pages: `npm install --save-dev gh-pages`

2. Add to `package.json`:
```json
{
  "homepage": "https://yourusername.github.io/image-markup-app",
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```

3. Update `vite.config.ts`:
```typescript
export default defineConfig({
  base: '/image-markup-app/', // Your repo name
  // ... rest of config
})
```

4. Deploy: `npm run deploy`

**Note**: GitHub Pages doesn't support client-side routing well, so you may need a 404.html workaround.

### 4. **Cloudflare Pages** (Great Performance)
Excellent global CDN and generous free tier.

**Steps:**
1. Connect your GitHub repo at [pages.cloudflare.com](https://pages.cloudflare.com)
2. Build configuration:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variables: Add in dashboard

**_redirects** file in `public/`:
```
/* /index.html 200
```

### 5. **AWS S3 + CloudFront** (Enterprise Grade)
Best for large-scale applications needing fine control.

**Setup Script** (`scripts/deploy-s3.sh`):
```bash
#!/bin/bash
BUCKET_NAME="your-app-bucket"
DISTRIBUTION_ID="your-cloudfront-id"

# Build
npm run build

# Sync to S3
aws s3 sync dist/ s3://$BUCKET_NAME --delete

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

**S3 Bucket Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

### 6. **Docker** (For Self-Hosting)
If you need to deploy to your own servers.

**Dockerfile**:
```dockerfile
# Build stage
FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**nginx.conf**:
```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Post-Deployment Checklist

### 1. **Environment Variables**
- [ ] Verify all environment variables are set
- [ ] Confirm Google OAuth credentials are correct
- [ ] Test authentication flow

### 2. **Performance**
- [ ] Enable Gzip/Brotli compression
- [ ] Set up proper caching headers
- [ ] Consider using a CDN

### 3. **Security**
- [ ] Enable HTTPS (automatic with most services)
- [ ] Set security headers (CSP, X-Frame-Options, etc.)
- [ ] Review CORS settings

### 4. **Monitoring**
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Add analytics (e.g., Google Analytics)
- [ ] Monitor performance metrics

### 5. **SEO & Meta Tags**
Update `index.html`:
```html
<meta property="og:title" content="Image Markup App">
<meta property="og:description" content="Annotate and markup images with ease">
<meta property="og:image" content="https://yourdomain.com/preview.png">
```

## CI/CD Setup

### GitHub Actions (for Vercel/Netlify)
`.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npm test
      # Add deployment step for your platform
```

## Domain Setup

1. **Buy a domain** (Namecheap, Google Domains, etc.)
2. **Update DNS**:
   - Vercel/Netlify: Add their nameservers
   - Others: Add CNAME or A records
3. **SSL Certificate**: Usually automatic with platforms

## Recommended: Start with Vercel

For your app, I recommend starting with **Vercel** because:
1. Zero configuration deployment
2. Excellent performance out of the box
3. Easy environment variable management
4. Automatic HTTPS and great security defaults
5. Generous free tier
6. Automatic deployments from Git pushes

Quick start:
```bash
npx vercel
```

Follow the prompts, and your app will be live in minutes!