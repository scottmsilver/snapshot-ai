# Deployment Guide

ScreenMark runs its frontend on Fly.io and its production Python API on
`sukkot` through Cloudflare Tunnel, with Cloudflare Access protection. The Fly.io
API deployment remains available for manual rollback and stops when idle.

## Architecture

```
User → Cloudflare (Google login) → Fly.io Frontend
                                  ↓
                  api.oursilverfamily.com → Cloudflare Tunnel → sukkot:8001
```

- **Frontend**: Static React app served by nginx
- **Backend**: FastAPI with LangGraph for AI processing
- **Auth**: Cloudflare Access (Google login, no code changes needed)

## Production API on sukkot

The API binds only to `127.0.0.1:8001`. The `screenmark-api` Cloudflare Tunnel
routes `api.oursilverfamily.com` to that port. Both services are enabled as user
systemd services; user lingering is enabled so they start at boot without login.

Local service files and configuration:

- `~/.config/systemd/user/screenmark-api.service`
- `~/.config/systemd/user/cloudflared-screenmark-api.service`
- `~/.config/screenmark/production.env` (private production credentials; do not commit)
- `~/.cloudflared/config-screenmark-api.yml`
- `~/.local/state/screenmark/sessions/` (private image session logs)

The production environment carries the deployed API's provider keys,
`CF_ACCESS_SECRET`, and `ALLOWED_ORIGINS`. The application validates the
`X-Proxy-Secret` header supplied by the existing Cloudflare rule.

```bash
systemctl --user status screenmark-api cloudflared-screenmark-api
curl --fail http://127.0.0.1:8001/health
journalctl --user -u screenmark-api -u cloudflared-screenmark-api -n 100
```

After updating backend code or the private production environment, restart it:

```bash
systemctl --user restart screenmark-api
```

The service uses the checkout's `python-server/.venv` and reads code from the
checkout, so backend edits affect the next restart. The production service
occupies port 8001; use another loopback port for development.

### Roll back the API to Fly.io

In Cloudflare DNS, change the existing `api.oursilverfamily.com` CNAME target
back to `screenmark-api.fly.dev`, keeping proxying enabled. The original DNS
record is saved privately in `~/.config/screenmark/dns-before-tunnel.json`.
The existing Access and header rules remain attached to the same hostname.
Request `https://api.oursilverfamily.com/health` and verify the production app.
Fly starts its stopped API machine on demand; rollback is manual.

The rest of this guide describes deploying or refreshing the Fly fallback.

## Prerequisites

1. [Fly.io account](https://fly.io) (usage billing)
2. [Cloudflare account](https://cloudflare.com) (free)
3. Custom domain (optional but recommended for Cloudflare Access)
4. Gemini API key from [Google AI Studio](https://aistudio.google.com/)

## Step 1: Deploy Backend

```bash
cd python-server

# First time setup
fly launch --name screenmark-api --region ord

# Set secrets
fly secrets set GEMINI_API_KEY=your-gemini-api-key
fly secrets set CF_ACCESS_SECRET=$(openssl rand -hex 32)

# Note the CF_ACCESS_SECRET value - you'll need it for Cloudflare

# Deploy
fly deploy
```

Your API is now at: `https://screenmark-api.fly.dev`

## Step 2: Deploy Frontend

```bash
cd excalidraw-ui

# Edit fly.toml to set your API URL
# Change: VITE_API_BASE_URL = ""
# To:     VITE_API_BASE_URL = "https://screenmark-api.fly.dev"

# First time setup
fly launch --name screenmark-app --region ord

# Deploy
fly deploy --build-arg VITE_APP_GIT_SHA="$(git rev-parse --short HEAD)"
```

Your app is now at: `https://screenmark-app.fly.dev`

## Step 3: Set Up Cloudflare Access (Optional but Recommended)

This adds Google login protection so only authorized users can access your app.

### 3a. Add Domain to Cloudflare

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Add your domain
3. Update nameservers at your registrar

### 3b. Point Domain to Fly.io

Add CNAME records:
```
app.yourdomain.com  → screenmark-app.fly.dev
api.yourdomain.com  → screenmark-api.fly.dev
```

Enable "Proxy" (orange cloud) for both.

### 3c. Configure Cloudflare Access

1. Go to **Zero Trust** → **Access** → **Applications**
2. Click **Add an application** → **Self-hosted**
3. Configure:
   - **Application name**: ScreenMark
   - **Session duration**: 24 hours
   - **Application domain**: `app.yourdomain.com`
4. Add policy:
   - **Policy name**: Allow Users
   - **Action**: Allow
   - **Include**: Emails ending in `@yourdomain.com` (or specific emails)
5. Choose **Google** as identity provider (or add it under Authentication)

### 3d. Add Secret Header to Cloudflare

This prevents direct access to `*.fly.dev` URLs.

1. Go to **Rules** → **Transform Rules** → **Modify Request Header**
2. Create rule:
   - **Name**: Add CF Access Secret
   - **When**: Hostname equals `api.yourdomain.com`
   - **Then**: Set static header
     - **Header name**: `X-Proxy-Secret`
     - **Value**: (the secret you generated in Step 1)

### 3e. Update Frontend API URL

Redeploy frontend with your custom domain:

```bash
cd excalidraw-ui

# Edit fly.toml
# Change: VITE_API_BASE_URL = "https://screenmark-api.fly.dev"
# To:     VITE_API_BASE_URL = "https://api.yourdomain.com"

fly deploy --build-arg VITE_APP_GIT_SHA="$(git rev-parse --short HEAD)"
```

## Environment Variables

### Backend (python-server)

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `OPENAI_API_KEY` | For OpenAI image edits | Server-side OpenAI API key; install with `fly secrets set OPENAI_API_KEY=... -a screenmark-api` |
| `CF_ACCESS_SECRET` | No | Secret for Cloudflare header validation |
| `ALLOWED_ORIGINS` | No | CORS origins (default: localhost) |

### Frontend (excalidraw-app)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes (prod) | Backend API URL |

## Costs

| Service | Free Tier | Typical Cost |
|---------|-----------|--------------|
| Fly.io | Usage billing | Frontend runtime, stopped-machine storage, traffic; API fallback stops when idle |
| Cloudflare | 50 users | Free |
| Gemini API | Varies | Pay per use |

## Troubleshooting

### "Forbidden: Invalid or missing access token"

The request isn't coming through Cloudflare. Check:
- DNS is proxied (orange cloud in Cloudflare)
- Transform rule is adding the header
- `CF_ACCESS_SECRET` matches in both places

### App works but API calls fail

Check CORS:
```bash
fly secrets set ALLOWED_ORIGINS=https://app.yourdomain.com
```

### Cold starts are slow

Fly.io scales to zero by default. To keep one instance running:
```toml
# In fly.toml
min_machines_running = 1
```

This increases cost slightly.
