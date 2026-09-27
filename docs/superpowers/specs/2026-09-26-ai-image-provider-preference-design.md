# AI image provider preference

## Goal

Let a person choose Gemini or OpenAI for image rendering in the existing Preferences menu. Keep the current Gemini planning and self-check workflow. Use GPT Image Sunburst for OpenAI edits to existing screenshots.

## User behavior

- Add an **AI image provider** choice to the existing main-menu Preferences submenu, with **Gemini** and **OpenAI (Sunburst)** options. The selected option is visible and keyboard accessible.
- Default to Gemini for people who have not chosen a provider. Save the choice in browser local storage so it survives reloads; it is a browser preference, not part of the drawing or collaboration state.
- Apply the selected provider to subsequent AI image edits. An edit already in progress keeps the provider it started with. The browser never receives either provider's API key.
- If OpenAI is selected but the server lacks `OPENAI_API_KEY`, show a clear configuration error through the existing AI error path. Do not silently switch providers.

## Server behavior

- Accept an optional, validated `imageProvider` value (`gemini` or `openai`) on agentic edit, inpaint, and direct image edit requests. Omitted values mean Gemini, preserving existing callers.
- Keep Gemini for prompt planning and result evaluation. Route only image generation/editing through the selected provider, including retry iterations. Keep existing progress events and image data URL responses.
- OpenAI image edits use one server-owned model constant, `gpt-image-2.5-sunburst`, through the Images edit API. Normalize the clean source to PNG at its original pixel dimensions. Send that image first and an optional annotated guidance image second; the prompt explains their roles. Request PNG output explicitly, decode its base64 data, and expose it as a PNG data URL.
- For a supplied white-edit-area mask, require the same pixel dimensions as the clean source; reject a mismatch rather than resize an edit region. Convert it to RGBA PNG, mapping white pixels to transparent alpha, black pixels to opaque alpha, and gray pixels proportionally between them. The mask applies to the first, PNG-normalized image. Keep the existing Gemini mask path unchanged.
- Route the direct image endpoint through the same provider choice. Preserve its legacy `model` field for Gemini callers; the server-owned OpenAI model constant takes precedence for OpenAI requests.
- Log the selected provider and model without credentials or raw image bytes. Report provider errors using the existing error event or HTTP response shape.

## Configuration and limits

- Add the OpenAI Python SDK to the backend's pinned requirements and document `OPENAI_API_KEY` in the example environment file. The deployed API currently has no OpenAI key, so live OpenAI use requires that server secret.
- No model picker, provider-specific quality controls, new preferences dialog, or migration of text models is part of this change.

## Verification

- Backend tests cover defaults, OpenAI routing, source/annotation ordering, mask conversion, base64 PNG output, missing key, API failure, and progress events without live image charges.
- Frontend tests cover preference selection and persistence, request propagation, and clear error display. Existing Gemini editing and the broader build/test checks continue to pass.
