# Recovered development stream (2026-09-07)

The newer working checkout is `/home/ssilver/development/screenmark/image-markup-app`.
Its root repository is at `816f9cf`, but its checked-out `excalidraw-ui` submodule
is at `502eef18` on the fork's `master`. The root commit still records the older
UI pin `30885a90`. The unrecorded submodule advance explains why a fresh checkout
of the root repository lacked features present in that working directory.

The old checkout has local changes in `.gitignore`, `.beads/last-touched`, and the
submodule pointer. Those changes were inspected but not modified.

Newer UI commits absent from the old recorded pin:

- `1d7146d3`: HEIC/PDF import and loading indicators
- `55d42e19`, `160b3378`: PWA cache/build-memory adjustments
- `8564a9e8`: callout element, curved pointer, arrowheads and drag handles
- `ac1620b8`: show AI image chooser as results arrive
- `e78e51ab`, `8b72432a`: isolated AI undo and accept improvements
- `404a5ee0`: region capture tool
- `7b4331da`: lasso capture
- `f3f5845a`: polygon capture and selection overlay
- `502eef18`: accept results while additional options generate

## Selective restoration

Callout restoration is isolated in `/home/ssilver/development/snapshot-ai-callout`,
branch `integration/callout-20260907`, based on `af96289d` (the deployed marker fix).
It brings forward only `8564a9e8`, with a regression fix for callout persistence:
the original implementation omitted the callout case in `restoreElement`, which
silently dropped saved callouts during reload/import.
The restoration also adds missing SVG rendering and expands export bounds to
include curved tails and arrowheads. Regression tests cover these failures.

The independent upstream integration candidate remains in
`/home/ssilver/development/snapshot-ai-upstream-review`; it is not part of this
selective restoration. The remaining newer fork features have not been promoted.
