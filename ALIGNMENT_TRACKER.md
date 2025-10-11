# ALIGNMENT TRACKER

## Legend
- [ ] Agent Task Pending
- [x] Agent Task Complete
- (QA) Human review checklist item

---

### 1. Type Safety & Component Contracts
- [x] Agent: Audit components for explicit `Props`/return types and eliminate `any` usage.
- [x] Agent: Update ESLint configuration or ruleset to enforce explicit returns.
- (QA) Confirm lint passes (`npm run lint`) and spot-check IDE typings.
- Notes:
  - `npm run lint` currently fails on longstanding hook ordering and unused variable errors in existing files; needs follow-up remediation before QA sign-off.

### 2. Component Decomposition & Separation of Concerns
- [ ] Agent: Refactor `App.tsx` into focused containers/hooks.
- [ ] Agent: Extract shared logic to hooks/services with tests.
- (QA) Manual regression test of drawing flows; reviewer approval.
- Notes:

### 3. React & Konva Best Practices
- [ ] Agent: Route shape mutations through contexts, guard refs, batch updates.
- [ ] Agent: Validate transformer/z-index handling and add safeguards.
- (QA) Human executes drawing/editing smoke test; confirm no console errors.
- Notes:

### 4. Styling & UI Consistency
- [ ] Agent: Centralize reused inline styles/animation settings.
- [ ] Agent: Standardize Framer Motion transitions across components.
- (QA) Visual inspection in Chrome/Firefox; confirm animation timings.
- Notes:

### 5. Testing & Tooling Enhancements
- [ ] Agent: Add Vitest coverage for contexts/hooks/utilities.
- [ ] Agent: Integrate lint/test checks into CI or documented workflow.
- (QA) Human runs `npm run lint && npm run test`; reviewer verifies new tests’ relevance.
- Notes:

### 6. Documentation & Onboarding Aids
- [ ] Agent: Update `AGENT_GUIDE` appendices post-refactor.
- [ ] Agent: Add subsystem quick-start notes for future agents.
- (QA) Documentation reviewer validates instructions match new structure.
- Notes:
