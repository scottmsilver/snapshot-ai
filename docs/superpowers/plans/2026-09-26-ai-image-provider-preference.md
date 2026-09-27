# AI Image Provider Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a saved Gemini/OpenAI image-provider preference while keeping the current agentic planning and self-check behavior.

**Architecture:** The browser stores one validated provider choice and sends it with image-edit requests. Python validates the optional field, defaults old callers to Gemini, and routes only rendering calls. A small OpenAI service normalizes the source/mask, calls the Images edit API with the server-owned Sunburst model ID, and returns PNG bytes to the existing graph and endpoint response paths.

**Tech Stack:** React/TypeScript, localStorage, FastAPI/Pydantic, Pillow, OpenAI Python SDK, pytest/Vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-ai-image-provider-preference-design.md`

---

### Task 1: OpenAI image-edit service

**Files:**
- Create: `python-server/services/openai_image_client.py`
- Create: `python-server/tests/test_openai_image_client.py`
- Modify: `python-server/schemas/config.py`
- Modify: `python-server/requirements.txt`
- Modify: `python-server/.env.example`

- [ ] Write failing tests for `edit_image(prompt, source_image, annotated_image=None, mask_image=None) -> bytes`. Mock only the SDK boundary; inspect the actual PNG files sent, asserting clean image first, annotated second, exact Sunburst model, explicit PNG output, decoded PNG result, and meaningful missing-key/API errors. Test mismatched mask dimensions and white/gray/black alpha conversion.
- [ ] Run `cd python-server && source .venv/bin/activate && python -m pytest tests/test_openai_image_client.py -v`; confirm failures are from missing behavior.
- [ ] Add one `OPENAI_IMAGE_MODEL = "gpt-image-2.5-sunburst"` constant. Add the Python SDK at a resolved exact version to requirements; install with `uv pip install --python .venv/bin/python -r requirements.txt` from `python-server`. Keep `OPENAI_API_KEY` on the server only.
- [ ] Implement source PNG normalization with Pillow, mask size validation and luminance-to-alpha inversion, ordered `BytesIO` image inputs, `AsyncOpenAI.images.edit`, `output_format="png"`, and base64 decoding. Run the same test file to green and commit.

### Task 2: Backend routing and compatibility

**Files:**
- Modify: `python-server/schemas/agentic.py`
- Modify: `python-server/schemas/images.py`
- Modify: `python-server/graphs/agentic_edit.py`
- Modify: `python-server/main.py`
- Test: `python-server/tests/test_agentic_edit.py`
- Test: `python-server/tests/test_images.py`

- [ ] Add failing tests: omitted `imageProvider` routes to Gemini; `openai` routes generation iterations to the new client while planning and self-check still call Gemini; direct, `/api/images/inpaint`, and `/api/ai/inpaint-stream` endpoints accept and propagate the provider; invalid provider is 422; provider errors appear in existing SSE/HTTP error shapes; generation progress contains provider and prompt without raw secret data.
- [ ] Run the relevant tests in `.venv` and confirm the new cases fail for the intended reason.
- [ ] Add `imageProvider: Literal["gemini", "openai"] = "gemini"` to request schemas and graph state. Route the graph's generation node and direct image endpoint through a focused provider selector; preserve the legacy Gemini `model` field and current response data URL format. Propagate the provider into the separate `GraphState` constructions in both inpaint endpoints. Do not change Gemini planning/evaluation calls.
- [ ] Re-run relevant tests; commit.

### Task 3: Browser preference and request propagation

**Files:**
- Create: `excalidraw-ui/src/services/imageProviderPreference.ts`
- Create: `excalidraw-ui/excalidraw-app/components/AIImageProviderPreference.tsx`
- Modify: `excalidraw-ui/excalidraw-app/components/AppMainMenu.tsx`
- Modify: `excalidraw-ui/src/services/types.ts`
- Modify: `excalidraw-ui/src/services/apiClient.ts`
- Modify: `excalidraw-ui/src/services/agenticService.ts`
- Test: `excalidraw-ui/src/services/agenticService.test.ts`
- Test: `excalidraw-ui/excalidraw-app/tests/aiIntegration.test.tsx`

- [ ] Write failing browser tests for default Gemini, selection in Preferences, persistence after remount, safe handling of an invalid stored value, and `imageProvider` being sent with a new edit request. Ensure changing the preference does not alter a request already started. Simulate a missing-key server error after selecting OpenAI and assert the existing AI UI shows the configuration message.
- [ ] Run focused Vitest files and confirm failure.
- [ ] Add a small provider preference module with `type ImageProvider = "gemini" | "openai"`, validated localStorage read/write, and a React menu control using existing MainMenu items. Carry the selected value through the existing agentic service and API request body; keep keys off the browser. Extend direct/inpaint client request types and calls if those paths can be invoked by the UI.
- [ ] Run focused Vitest files and commit UI changes in its submodule branch.

### Task 4: Verify, merge, and release

**Files:**
- Review: backend, frontend, spec, and tests

- [ ] Run the full Python suite from `.venv`, focused frontend tests, TypeScript, lint, formatting, and production UI build. Review actual output and fix concrete failures.
- [ ] Request code review and resolve material findings. Push the UI branch, wait for CI, squash merge it, and update the root submodule pointer. Push the root branch through its review/CI workflow.
- [ ] Deploy the API and UI revisions while Gemini remains the safe default. Verify health and deployed revision. Live OpenAI use requires installing `OPENAI_API_KEY` on `screenmark-api`; never put the key in a commit or client bundle. If the key is unavailable, report that activation remains outstanding rather than claiming OpenAI requests were live-tested.
- [ ] Confirm clean statuses and one worktree per repository; close a bead issue if the database becomes available.
