# Agent Instructions

## Issue Tracking

This project uses **bd (beads)** for issue tracking.
Run `bd prime` for workflow context, or install hooks (`bd hooks install`) for auto-injection.

**Quick reference:**
- `bd ready` - Find unblocked work
- `bd create "Title" --type task --priority 2` - Create issue
- `bd close <id>` - Complete work
- `bd sync` - Sync with git (run at session end)

For full workflow details: `bd prime`

## Python Development

**ALWAYS use the virtual environment for Python operations.**

### Running Python Tests
```bash
cd python-server && source .venv/bin/activate && python -m pytest tests/ -v
```

### Running the Python Server
```bash
cd python-server && source .venv/bin/activate && uvicorn main:app --reload --port 8001
```

### Installing Python Dependencies
```bash
cd python-server && source .venv/bin/activate && pip install -r requirements.txt
```

### Key Directories
- `python-server/` - FastAPI backend (port 8001)
- `python-server/.venv/` - Virtual environment (Python 3.12)
- `python-server/tests/` - Pytest tests
- `python-server/schemas/` - Pydantic models
- `python-server/graphs/` - LangGraph workflows

### Backend
- Python FastAPI server: port 8001 (primary backend)
- Set `SHADOW_TEST_ENABLED=true` in python-server/.env to enable metrics collection
