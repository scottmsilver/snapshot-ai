# Server Deployment Guide

This Express server handles AI operations for the image markup app. It proxies requests to the Gemini API, keeping your API key secure on the server side.

## Prerequisites

- Node.js 18+ 
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Your Gemini API key |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | Set to `production` for production |
| `ALLOWED_ORIGINS` | No | Comma-separated list of allowed CORS origins |

## Deployment Options

### Option 1: Railway (Recommended for Simplicity)

Railway offers the simplest deployment experience with generous free tier.

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Deploy from GitHub**
   ```bash
   # Push your code to GitHub first
   git add -A && git commit -m "Deploy server" && git push
   ```
   - In Railway dashboard, click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Set the root directory to `server`

3. **Configure Environment**
   - Go to your project settings
   - Add environment variables:
     - `GEMINI_API_KEY`: Your Gemini API key
     - `ALLOWED_ORIGINS`: `https://your-frontend-domain.com`

4. **Get Your URL**
   - Railway provides a URL like `https://your-project.up.railway.app`
   - Update your frontend's `VITE_API_URL` to this URL

**Estimated Cost:** Free tier includes $5/month credit, enough for light usage.

---

### Option 2: Render

Render offers free web services with some limitations (spin-down after inactivity).

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name:** `image-markup-api`
     - **Root Directory:** `server`
     - **Environment:** `Node`
     - **Build Command:** `npm install && npm run build`
     - **Start Command:** `npm start`

3. **Add Environment Variables**
   - `GEMINI_API_KEY`: Your Gemini API key
   - `NODE_ENV`: `production`
   - `ALLOWED_ORIGINS`: `https://your-frontend-domain.com`

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Your URL will be `https://image-markup-api.onrender.com`

**Note:** Free tier spins down after 15 minutes of inactivity. First request after spin-down takes ~30 seconds.

---

### Option 3: Fly.io

Fly.io offers more control and global edge deployment.

1. **Install Fly CLI**
   ```bash
   # macOS
   brew install flyctl
   
   # Linux
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login & Initialize**
   ```bash
   cd server
   fly auth login
   fly launch
   ```
   - Choose a unique app name
   - Select a region close to your users
   - Don't deploy yet (select "No")

3. **Configure fly.toml**
   The `fly launch` command creates a `fly.toml`. Ensure it includes:
   ```toml
   [build]
     builder = "heroku/buildpacks:20"

   [env]
     NODE_ENV = "production"
     PORT = "8080"

   [[services]]
     internal_port = 8080
     protocol = "tcp"

     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]
   ```

4. **Set Secrets**
   ```bash
   fly secrets set GEMINI_API_KEY=your-api-key-here
   fly secrets set ALLOWED_ORIGINS=https://your-frontend-domain.com
   ```

5. **Deploy**
   ```bash
   fly deploy
   ```

6. **Get Your URL**
   - Your app will be at `https://your-app-name.fly.dev`

**Estimated Cost:** Free tier includes 3 shared VMs, enough for a small app.

---

## Frontend Configuration

After deploying, update your frontend to use the server:

1. **Set the API URL**
   In your frontend's `.env` or deployment environment:
   ```bash
   VITE_API_URL=https://your-server-url.com
   ```

2. **Verify Server Mode is Enabled**
   Server mode is now the default. The frontend will automatically use the server API.

3. **Remove Client-Side API Key (Optional)**
   Since the server handles the API key, you can remove `VITE_GEMINI_API_KEY` from your frontend environment.

---

## Health Check

All platforms support health checks. The server exposes:
- `GET /health` - Returns `{ "status": "ok" }` if the server is running

---

## Security Considerations

1. **CORS Origins**
   - Always set `ALLOWED_ORIGINS` in production
   - Only allow your frontend domain(s)

2. **Rate Limiting**
   - Consider adding rate limiting for production (see Phase 3.5b)

3. **API Key Security**
   - Never commit your API key to git
   - Use environment variables or secrets management
   - Rotate keys periodically

---

## Troubleshooting

### "Connection refused" errors
- Check that `VITE_API_URL` matches your deployed server URL
- Ensure the server is running (check platform logs)

### CORS errors
- Verify `ALLOWED_ORIGINS` includes your frontend domain
- Check for trailing slashes (they matter!)

### API key errors
- Verify `GEMINI_API_KEY` is set correctly in server environment
- Check that the key is valid in Google AI Studio

### Slow first request (Render)
- This is normal on free tier due to spin-down
- Consider upgrading to a paid plan for always-on
