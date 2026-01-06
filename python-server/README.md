# Python AI Server

FastAPI/LangGraph backend for AI-powered image editing workflows.

## Setup

1. **Create virtual environment**
   ```bash
   cd python-server
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

4. **Run the server**
   ```bash
   python main.py
   # Or with uvicorn directly:
   uvicorn main:app --reload --port 8000
   ```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API information |
| `/health` | GET | Health check |
| `/api/echo` | POST | Echo test (for proxy verification) |

## Development

The server runs on port 8000 by default. The Express server (port 3001) will proxy certain requests to this Python server.

## Architecture

```
Browser
    │
    ▼
Express Server (3001)
    │
    ├─► Handle simple requests directly
    │
    └─► Proxy AI workflow requests ──► Python Server (8000)
                                              │
                                              ▼
                                        LangGraph Workflows
                                              │
                                              ▼
                                        Gemini API
```
