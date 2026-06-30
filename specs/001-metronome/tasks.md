# Tasks — Metronome

`[P]` = parallelizable / independent. Existing implementation status
is marked DONE.

## US1 — Audible click on every beat (P1)

- [DONE] T101 Inject toggle button into `#player-controls`
  (`_metInjectButton`).
- [DONE] T102 60 Hz polling loop with `setInterval` and idempotent
  re-eval (`TICK_INTERVAL_ID_KEY`).
- [DONE] T103 Binary-search current beat from `highway.getBeats()`.
- [DONE] T104 ±50 ms tolerance gating to suppress catch-up bursts on
  seek.
- [DONE] T105 Sine envelope click (60 ms) with measure / non-measure
  frequency split (1500 / 1000 Hz).

## US2 — Visual flash (P2)

- [DONE] T201 Register `addDrawHook` on the highway renderer.
- [DONE] T202 Track the highway instance the hook is bound to via
  `DRAW_HOOK_HIGHWAY_REF_KEY` and rebind on renderer swap (with a 1 s
  retry backoff to avoid spinning when the renderer is gone).
- [DONE] T203 Flash alpha decays at ×0.88/frame.
- [DONE] T204 Flash band restricted to y in [0.72H .. 0.90H].
- [DONE] T205 Checkbox toggle (`met-flash-check`).

## US3 — Persistence (P3)

- [DONE] T301 Settings live on a window-scoped object so plugin
  re-evals reuse them.
- [DONE] T302 [P] Persist settings to `localStorage` — `_metSaveSettings()` called in toggle, volume, flash, and subdiv change handlers; init merges from localStorage into window-scoped object.

## Cross-cutting / hardening

- [DONE] T401 Idempotent `playSong` wrapper.
- [DONE] T402 Dedupe button injection if `#btn-metronome` already
  exists.
- [DONE] T403 Replace legacy property handlers (`oninput`,
  `onchange`) before adding new listeners — protects against double
  binding from earlier plugin versions.
- [DONE] T404 [P] Subdivision setting (eighths, triplets) — `met-subdiv` select in UI, `_metBindSubdivSelect`, subdivision click logic in `_metTick`.
- [OPEN] T405 [P] Optional: visual count-in (3-2-1) before a song.

## Tests

- [DONE] T501 `tests/test_metronome_tick.js` (19 cases): binary-search beat index, eighth/triplet subdivision timing, ±50ms tolerance gating, measure-beat detection. Run with `node tests/test_metronome_tick.js`.
