# ScreenMark Image Markup App - Claude Instructions

## Project Context
This is a React-based image markup application with drawing tools, measurements, PDF import, and AI-powered generative fill capabilities.

## Agent Guidelines
**IMPORTANT:** All development work must follow the guidelines in `docs/development/AGENT_GUIDE.md`.

Read and follow the AGENT_GUIDE.md for:
- Core development principles
- Code quality standards
- Testing requirements
- Workflow checklist
- Security and deployment practices

## Quick Reference
- **Stack:** Vite + React 19 + TypeScript, Konva (canvas), Framer Motion
- **Key Features:** Drawing tools, measurements, PDF import, generative fill with Gemini API
- **Settings:** User API keys stored in Google Sheets (user's Drive)
- **Auth:** Google OAuth with Drive & Sheets scopes

## Konva Naming Conventions
All Konva Layers and UI elements must have semantic `name` attributes for clean canvas export:

| Element Type | Name | Purpose |
|-------------|------|---------|
| Background layer | `backgroundLayer` | Contains background rect and grid |
| Drawing layer | `drawingLayer` | Contains user-drawn shapes |
| Grid lines | `gridLine` | Visual grid (excluded from AI exports) |
| Selection box | `selectionBox` | Drag-select rectangle |
| Selection overlays | `selectionOverlay` | Generative fill selection UI |
| Result overlay | `resultOverlay` | AI result preview |

**Why:** `captureCleanCanvas()` in `src/utils/exportUtils.ts` uses these names to exclude UI elements when capturing images for AI processing. Without proper names, grid lines and selection UI would be sent to the AI.

## Before Starting Work
1. Read `docs/development/AGENT_GUIDE.md` for detailed guidelines
2. Follow the workflow checklist defined there
3. Maintain code quality and test coverage standards

For setup, deployment, and debugging information, see the respective folders in `docs/`.
