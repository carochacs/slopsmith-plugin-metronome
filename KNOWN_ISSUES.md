# Known UI Issues — Metronome

Findings from a frontend UI-bug audit of `screen.js` (2026-07-22, 459 lines, single IIFE — no `screen.html`/`settings.html`/`routes.py` exist in this plugin). Ranked by severity/confidence. No code changes have been made — this is a catalog for follow-up work.

## 1. `AudioContext` created outside a user-gesture call stack, never resumed (High)

`_metToggle` (`screen.js:250-256`), wired directly to the button's `onclick` (a real user gesture), only flips `_metSettings.enabled` and calls `_metSyncUi()`. The actual `new AudioContext()` happens lazily inside `_metClick` (`screen.js:60`), which is only ever invoked from `_metTick` (`screen.js:301`) via a `setInterval` callback (`screen.js:406-417`) — i.e. asynchronously, detached from any gesture. There's no `_metAudioCtx.resume()` call anywhere.

**Failure scenario:** User clicks "Metronome" to enable it. In Chrome/Safari the freshly-created `AudioContext` starts `suspended` (autoplay policy) because it wasn't created synchronously inside the click handler. `osc.start()`/`osc.stop()` calls are silently queued but produce no sound. The visual flash still works (doesn't depend on the AudioContext), so the user sees the flash but hears nothing, with no way to unstick it short of an unrelated gesture elsewhere on the page.

## 2. `setInterval` polling with hard tolerance, no catch-up (High)

`screen.js:401-417` polls at `1000/60` via `setInterval` instead of AudioContext lookahead scheduling. In `_metTick` (`screen.js:338-346`), `lastBeatIdx` advances unconditionally once a new beat index is reached, but the click/flash only fires `if (Math.abs(t - beatTime) <= 0.05)` (line 341). Browsers throttle/clamp `setInterval` in backgrounded tabs.

**Failure scenario:** User backgrounds the tab while a song plays with the metronome on, then returns. Every beat that occurred during the throttled period gets marked "visited" without ever passing the tolerance check — no catch-up, no retroactive click. The metronome goes silent for the whole backgrounded interval with no recovery.

## 3. Double, unsynchronized flash-alpha decay (Medium)

`_metState.flashAlpha` decays in two independent places at two different rates: once in the highway draw hook (`screen.js:295`, `*= 0.88`, once per rendered frame) and again in the plugin's own 60Hz tick (`screen.js:395`, `*= 0.85`, once per interval tick). Neither is synced to the other or to elapsed time.

**Failure scenario:** On a host whose render loop runs faster/slower than ~60Hz (high-refresh display, or the interval getting throttled under load), the flash decays roughly twice too fast or unevenly — visibly flickery, machine-dependent brightness instead of a deterministic fade.

## 4. Count-in overlay can get stuck full-viewport on navigation (Medium)

`_metCountInEl` (`screen.js:32-56`) is `position:fixed; inset:0; z-index:9999`, appended to `document.body`. It's only removed via `_metClearCountIn()`, called from three specific paths (count-in checkbox unchecked, natural end of the countdown, start of a new `wrappedPlaySong`) — there's no listener on `window.showScreen`/navigation.

**Failure scenario:** User enables count-in, starts playback, pauses exactly during the 4‑3‑2‑1 countdown, and navigates to a different screen without triggering `playSong` again. The full-screen countdown numeral (120px, z-index 9999) remains rendered on top of the new screen indefinitely.

## 5. 60fps polling interval never stopped on navigation (Medium)

`screen.js:402-417` stores the interval id on `window[TICK_INTERVAL_ID_KEY]` and only clears/replaces it if `screen.js` re-executes — no hook tied to leaving the player/song screen. This is the mechanism that keeps issue #4 alive and wastes CPU running `_metTick` against a stale/paused `highway` reference.

## 6. Reset-before-await race at song transition (Low-Medium)

In the `playSong` wrapper (`screen.js:442-448`), `_metState.lastBeatIdx = -1` and `_metClearCountIn()` run *before* `await playSongBaseFn(...)` resolves. During that window the still-running 60fps tick sees `highway` still pointing at the *old* song's beats/time with a freshly reset `lastBeatIdx`.

**Failure scenario:** Switching songs while the metronome is enabled can cause a spurious extra click/flash for "beat 0" of the outgoing song right as the new song is loading.

## 7. No plugin-owned fallback CSS (Low)

`plugin.json` has no `styles` key and there's no `assets/plugin.css`. No arbitrary-value Tailwind classes were found, but the UI relies on host-defined tokens (`bg-dark-600`, `bg-dark-500`, `bg-amber-900/50`) with nothing to catch a host theme/config change that removes them.

---

*Not applicable:* no keyboard shortcuts registered (nothing to clean up), no `registerFader` usage, no backend `routes.py` (so `load_sibling`/`context["log"]` conventions don't apply). The listener-dedup pattern for the settings controls (`screen.js:80-130`) and the `playSong`-wrap idempotency guard (`screen.js:420-454`) are both careful and correct — not problems.
