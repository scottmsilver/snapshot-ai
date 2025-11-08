# AGENT GUIDE

## Purpose & Scope
- Define a shared rulebook for every automation agent working in this repository.
- Keep responses focused on user requests, maintain code quality, and preserve repo integrity.

## Core Principles
- Answer in ≤4 concise sentences (excluding tool I/O); no emojis unless asked.
- Never volunteer extra tasks or changes outside the explicit user scope.
- Protect secrets and credentials; refuse destructive or high-risk commands without confirmation.

## Project Context
- **Stack:** Vite + React 19 + TypeScript (strict), Konva for canvas, Framer Motion for animation.
- **Key directories:** `src/components`, `src/hooks`, `src/contexts`, `src/utils`, `public`.
- **Path aliases:** `@/*`, `@components/*`, `@hooks/*`, `@utils/*`, `@types/*`.
- **Scripts:** `npm run dev`, `npm run build`, `npm run lint`, `npm run test`, `npm run test:coverage`.

## Workflow Checklist
1. Confirm the requested scope and constraints.
2. Plan (outline or todos) before coding if work is non-trivial.
3. Implement with minimal, targeted edits following existing patterns.
4. Verify: run required lint/tests/build as applicable.
5. Summarize the work (1–4 sentences) and surface any follow-ups.

## Tooling Requirements
- Use `TodoWrite` for any task with ≥3 steps; keep statuses up to date as work progresses.
- Prefer `Read`, `LS`, `Grep`, `Glob` over shell alternatives; employ absolute paths.
- Document all command executions with the Execute tool, tagging risk correctly.
- Run lint/tests specified by the user; otherwise default to `npm run lint` and `npm run test` for substantial code changes.

## Coding Standards
- Match existing style: inline styles are common; avoid unnecessary new CSS.
- Keep comments minimal and purposeful; don’t duplicate obvious logic.
- Avoid introducing new dependencies unless approved.
- Maintain strict TypeScript typing: typed props, return types, and discriminated unions where applicable.
- Reuse utilities, hooks, and contexts instead of duplicating logic.

## React & Konva Implementation Guidelines
- **Component structure:** use function components with named exports; keep components focused and extract helpers when logic grows.
- **Typing:** define `Props` interfaces/types, prefer explicit return types, and leverage existing drawing-related types from `@/types/drawing`.
- **State & context:** rely on `useDrawing`, `useHistory`, `useAuth`, and other provided hooks; never reimplement global state that exists in contexts.
- **Side effects:** use `useEffect`/`useLayoutEffect` responsibly, clean up listeners/timers; never rely on implicit globals.
- **Konva specifics:** maintain stable IDs, update shapes via context dispatchers, batch updates when possible, and respect layer/z-index ordering.
- **Event handling:** debounce expensive pointer handlers, guard against null stage refs, and use Konva’s transformer utilities instead of manual DOM tweaks.
- **Styling & UI:** continue using inline style objects and `framer-motion` transitions already present; prefer existing UI components (toolbar, dialogs) for consistency.

## Git & Change Management
- Ensure a clean working tree before beginning; stash or reset unrelated changes.
- Review diffs for secrets before committing; never commit sensitive data.
- Follow provided commit instructions (message style, co-author metadata) if commits are requested.
- Never push unless the user explicitly commands it.

## Prohibited Actions
- Editing or adding documentation files unless the user requests it explicitly.
- Installing packages, updating configs, or running deployment scripts without approval.
- Performing destructive shell operations (`rm -rf`, altering system files) or executing untrusted code downloads.

## App-Specific Pitfalls
- Large Konva canvases rely on memoized shape updates; avoid triggering full re-renders.
- Clipboard/export flows depend on utility helpers—always reuse them to preserve behavior.
- Auth context may be optional; wrap usage in try/catch where necessary, mirroring existing patterns.

## Appendix: Quick Reference
- **Start dev server:** `npm run dev`
- **Lint:** `npm run lint`
- **Unit tests:** `npm run test`
- **Build:** `npm run build`
- **Common tools:** `TodoWrite`, `Read`, `Grep`, `LS`, `Execute`
