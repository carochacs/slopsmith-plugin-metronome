// Metronome Overlay plugin
// Adds audible click and visual flash on beats, synced to the song's tempo.

(function () {
'use strict';

let _metAudioCtx = null;
const MET_SETTINGS_KEY = 'slopsmithMetronomeSettings';
const DRAW_HOOK_RETRY_DELAY_MS = 1000;
const _metSettingsDefaults = { enabled: false, volume: 0.4, flashEnabled: true, subdivision: 'none', countInEnabled: false };
let _metSettingsParsed = null;
try { _metSettingsParsed = JSON.parse(localStorage.getItem(MET_SETTINGS_KEY) || 'null'); } catch (_e) {}
const _metSettings = window[MET_SETTINGS_KEY] || (window[MET_SETTINGS_KEY] =
    Object.assign({}, _metSettingsDefaults, _metSettingsParsed || {}));
function _metSaveSettings() {
    try { localStorage.setItem(MET_SETTINGS_KEY, JSON.stringify(_metSettings)); } catch (_e) {}
}
// Ensure fields added after initial release exist on saved state
if (!_metSettings.subdivision) _metSettings.subdivision = 'none';
if (_metSettings.countInEnabled === undefined) _metSettings.countInEnabled = false;

const MET_STATE_KEY = 'slopsmithMetronomeState';
const _metState = window[MET_STATE_KEY] || (window[MET_STATE_KEY] = {
    lastBeatIdx: -1,
    flashAlpha: 0,
    lastSubdivInBeat: -1,
});
if (_metState.lastSubdivInBeat === undefined) _metState.lastSubdivInBeat = -1;

let _metNextDrawHookRetryAtMs = 0;

let _metCountInEl = null;  // DOM overlay for count-in numbers

function _metUpdateCountIn(count, alpha) {
    if (!_metCountInEl) {
        const el = document.createElement('div');
        el.id = 'met-count-in-overlay';
        el.style.cssText =
            'position:fixed;inset:0;z-index:9999;pointer-events:none;' +
            'display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(el);
        _metCountInEl = el;
    }
    _metCountInEl.style.opacity = alpha.toFixed(3);
    if (_metCountInEl.dataset.count !== String(count)) {
        _metCountInEl.dataset.count = String(count);
        _metCountInEl.innerHTML =
            '<span style="font-size:120px;font-weight:900;color:#f59e0b;' +
            'text-shadow:0 2px 40px rgba(245,158,11,0.6);font-family:sans-serif;">' +
            count + '</span>';
    }
}

function _metClearCountIn() {
    if (_metCountInEl) { _metCountInEl.remove(); _metCountInEl = null; }
}

// type: 'high' = downbeat, 'mid' = regular beat, 'low' = subdivision
function _metClick(type) {
    if (!_metAudioCtx) _metAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_metSettings.volume <= 0) return;
    const osc = _metAudioCtx.createOscillator();
    const gain = _metAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(_metAudioCtx.destination);
    const freq = type === 'high' ? 1500 : type === 'mid' ? 1000 : 660;
    const vol = (type === 'low' ? 0.4 : 1.0) * _metSettings.volume;
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol, _metAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _metAudioCtx.currentTime + 0.06);
    osc.start(_metAudioCtx.currentTime);
    osc.stop(_metAudioCtx.currentTime + 0.06);
}

function _metFlash(alpha) {
    if (_metSettings.flashEnabled) _metState.flashAlpha = alpha;
}

function _metBindVolumeSlider(slider) {
    if (typeof slider.oninput === 'function') {
        // Clear legacy property handler from earlier plugin versions.
        slider.oninput = null;
    }
    if (slider._metVolumeListener) {
        slider.removeEventListener('input', slider._metVolumeListener);
    }
    slider.value = Math.round(_metSettings.volume * 100);
    const volLabel = document.getElementById('met-vol-label');
    if (volLabel) volLabel.textContent = `${slider.value}%`;
    slider._metVolumeListener = function() { _metSetVolume(this.value); };
    slider.addEventListener('input', slider._metVolumeListener);
}

function _metBindFlashCheck(flashCheck) {
    if (typeof flashCheck.onchange === 'function') {
        // Clear legacy property/inline handler from earlier plugin versions.
        flashCheck.onchange = null;
    }
    if (flashCheck._metFlashListener) {
        flashCheck.removeEventListener('change', flashCheck._metFlashListener);
    }
    flashCheck.checked = _metSettings.flashEnabled;
    flashCheck._metFlashListener = function() { _metSettings.flashEnabled = this.checked; _metSaveSettings(); };
    flashCheck.addEventListener('change', flashCheck._metFlashListener);
}

function _metBindCountInCheck(check) {
    if (check._metCountInListener) check.removeEventListener('change', check._metCountInListener);
    check.checked = !!_metSettings.countInEnabled;
    check._metCountInListener = function() {
        _metSettings.countInEnabled = this.checked;
        _metSaveSettings();
        if (!this.checked) _metClearCountIn();
    };
    check.addEventListener('change', check._metCountInListener);
}

function _metBindSubdivSelect(sel) {
    if (sel._metSubdivListener) {
        sel.removeEventListener('change', sel._metSubdivListener);
    }
    sel.value = _metSettings.subdivision;
    sel._metSubdivListener = function() {
        _metSettings.subdivision = this.value;
        _metState.lastSubdivInBeat = -1;
        _metSaveSettings();
    };
    sel.addEventListener('change', sel._metSubdivListener);
}

// Inject toggle button into player controls
function _metInjectButton() {
    // v3: mount the metronome controls into the host's stable plugin-control
    // slot (Plugins rail popover). In v3 #btn-lyrics lives in the auto-hiding
    // transport (not the slot), so we append into the slot in order
    // (insertBefore=null) rather than anchoring to a node that isn't a child
    // of the slot.
    const isV3 = !!(window.slopsmith && window.slopsmith.uiVersion === 'v3');
    let slot = null;
    if (isV3 && window.slopsmith.ui && typeof window.slopsmith.ui.playerControlSlot === 'function') {
        try { const _s = window.slopsmith.ui.playerControlSlot(); if (_s instanceof Element) slot = _s; }
        catch (_e) { /* host slot API failure → fall back to legacy container */ }
    }
    const controls = slot || document.getElementById('player-controls');
    if (!controls) return;
    const existingBtn = document.getElementById('btn-metronome');
    if (existingBtn) {
        const existingSlider = document.getElementById('met-volume');
        const existingFlashCheck = document.getElementById('met-flash-check');
        const existingSubdivSel = document.getElementById('met-subdiv');
        const existingCountInCheck = document.getElementById('met-count-in-check');
        existingBtn.onclick = _metToggle;
        if (existingSlider) _metBindVolumeSlider(existingSlider);
        if (existingFlashCheck) _metBindFlashCheck(existingFlashCheck);
        if (existingSubdivSel) _metBindSubdivSelect(existingSubdivSel);
        if (existingCountInCheck) _metBindCountInCheck(existingCountInCheck);
        _metSyncUi();
        return;
    }

    const lyricsBtn = document.getElementById('btn-lyrics');
    const insertBefore = isV3 ? null : (lyricsBtn?.nextSibling || controls.querySelector(':scope > button:last-of-type'));

    const btn = document.createElement('button');
    btn.id = 'btn-metronome';
    btn.className = 'px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-gray-500 transition';
    btn.textContent = 'Metronome';
    btn.title = 'Toggle metronome click';
    btn.onclick = _metToggle;
    controls.insertBefore(btn, insertBefore);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'met-volume';
    slider.min = '0';
    slider.max = '100';
    slider.className = 'w-16 accent-amber-400 hidden';
    _metBindVolumeSlider(slider);
    controls.insertBefore(slider, insertBefore);

    const label = document.createElement('span');
    label.id = 'met-vol-label';
    label.className = 'text-xs text-gray-500 w-8 hidden';
    label.textContent = `${Math.round(_metSettings.volume * 100)}%`;
    controls.insertBefore(label, insertBefore);

    const flashLabel = document.createElement('label');
    flashLabel.id = 'met-flash-label';
    flashLabel.className = 'flex items-center gap-1 text-xs text-gray-500 cursor-pointer hidden';
    const flashCheck = document.createElement('input');
    flashCheck.type = 'checkbox';
    flashCheck.id = 'met-flash-check';
    flashCheck.className = 'accent-amber-400';
    flashLabel.appendChild(flashCheck);
    flashLabel.appendChild(document.createTextNode(' Flash'));
    controls.insertBefore(flashLabel, insertBefore);
    _metBindFlashCheck(flashCheck);

    const subdivSel = document.createElement('select');
    subdivSel.id = 'met-subdiv';
    subdivSel.className = 'bg-dark-600 text-xs text-gray-400 rounded px-1 py-0.5 border border-dark-500 hidden';
    subdivSel.title = 'Subdivision clicks';
    [['none', 'Beats only'], ['eighth', '8th notes'], ['triplet', 'Triplets']].forEach(([val, text]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = text;
        subdivSel.appendChild(opt);
    });
    controls.insertBefore(subdivSel, insertBefore);
    _metBindSubdivSelect(subdivSel);

    const countInLabel = document.createElement('label');
    countInLabel.id = 'met-count-in-label';
    countInLabel.className = 'flex items-center gap-1 text-xs text-gray-500 cursor-pointer hidden';
    countInLabel.title = 'Show 4-3-2-1 countdown before the first beat';
    const countInCheck = document.createElement('input');
    countInCheck.type = 'checkbox';
    countInCheck.id = 'met-count-in-check';
    countInCheck.className = 'accent-amber-400';
    countInLabel.appendChild(countInCheck);
    countInLabel.appendChild(document.createTextNode(' Count-in'));
    controls.insertBefore(countInLabel, insertBefore);
    _metBindCountInCheck(countInCheck);

    _metSyncUi();
}

function _metSyncUi() {
    const enabled = _metSettings.enabled;
    const btn = document.getElementById('btn-metronome');
    const slider = document.getElementById('met-volume');
    const label = document.getElementById('met-vol-label');
    const flashLabel = document.getElementById('met-flash-label');
    const subdivSel = document.getElementById('met-subdiv');
    if (btn) {
        btn.className = enabled
            ? 'px-3 py-1.5 bg-amber-900/50 rounded-lg text-xs text-amber-300 transition'
            : 'px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-gray-500 transition';
        btn.textContent = enabled ? 'Metronome ✓' : 'Metronome';
    }
    const countInLabel = document.getElementById('met-count-in-label');
    if (slider) slider.classList.toggle('hidden', !enabled);
    if (label) label.classList.toggle('hidden', !enabled);
    if (flashLabel) flashLabel.classList.toggle('hidden', !enabled);
    if (subdivSel) subdivSel.classList.toggle('hidden', !enabled);
    if (countInLabel) countInLabel.classList.toggle('hidden', !enabled);
}

function _metToggle() {
    _metSettings.enabled = !_metSettings.enabled;
    _metSaveSettings();
    _metSyncUi();
    _metState.lastBeatIdx = -1;
    _metState.lastSubdivInBeat = -1;
}

function _metSetVolume(v) {
    _metSettings.volume = v / 100;
    _metSaveSettings();
    const volLabel = document.getElementById('met-vol-label');
    if (volLabel) volLabel.textContent = v + '%';
}

const DRAW_HOOK_HIGHWAY_REF_KEY = 'slopsmithMetronomeDrawHookHighwayRef';

function _metGetHighway() {
    return typeof highway !== 'undefined' ? highway : null;
}

function _metEnsureDrawHookInstalled() {
    const currentHighway = _metGetHighway();
    if (
        !currentHighway ||
        typeof currentHighway.addDrawHook !== 'function' ||
        window[DRAW_HOOK_HIGHWAY_REF_KEY] === currentHighway
    ) {
        return;
    }

    currentHighway.addDrawHook(function(ctx, W, H) {
        if (_metState.flashAlpha < 0.005) return;

        // Flash across the play line area
        const y = H * 0.72;
        const h = H * 0.18;
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, `rgba(255, 200, 60, 0)`);
        grad.addColorStop(0.5, `rgba(255, 200, 60, ${_metState.flashAlpha})`);
        grad.addColorStop(1, `rgba(255, 200, 60, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, W, h);

        // Fade
        _metState.flashAlpha *= 0.88;
    });
    window[DRAW_HOOK_HIGHWAY_REF_KEY] = currentHighway;
}

// Main tick — called from a polling loop
function _metTick() {
    const currentHighway = _metGetHighway();
    if (
        !currentHighway ||
        typeof currentHighway.getBeats !== 'function' ||
        typeof currentHighway.getTime !== 'function'
    ) {
        return;
    }
    if (!_metSettings.enabled) {
        _metState.flashAlpha = 0;
        return;
    }
    const beats = currentHighway.getBeats();
    const t = currentHighway.getTime();
    if (!beats || beats.length === 0) return;

    // Find the current beat (the most recent beat <= current time)
    let lo = 0, hi = beats.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid].time <= t) lo = mid + 1;
        else hi = mid;
    }
    const idx = lo - 1;

    // Reset subdivision state when we enter a new beat interval
    if (idx !== _metState.lastBeatIdx) {
        _metState.lastSubdivInBeat = -1;
    }

    if (idx < 0) {
        _metState.flashAlpha *= 0.85;
        return;
    }

    // Trigger full beat click on new beat
    if (idx !== _metState.lastBeatIdx) {
        _metState.lastBeatIdx = idx;
        const beatTime = beats[idx].time;
        if (Math.abs(t - beatTime) <= 0.05) {
            const isMeasure = beats[idx].measure >= 0;
            _metClick(isMeasure ? 'high' : 'mid');
            _metFlash(isMeasure ? 0.35 : 0.15);
        }
    }

    // Check subdivisions within the current beat interval.
    // Subdivision times are interpolated between this beat and the next, so
    // they naturally follow any playback-speed change applied by the host.
    const subdivMode = _metSettings.subdivision || 'none';
    if (subdivMode !== 'none' && idx + 1 < beats.length) {
        const beatStart = beats[idx].time;
        const dt = beats[idx + 1].time - beatStart;
        const subdivTimes = subdivMode === 'eighth'
            ? [beatStart + dt * 0.5]
            : [beatStart + dt / 3, beatStart + dt * 2 / 3];

        for (let s = 0; s < subdivTimes.length; s++) {
            if (s <= _metState.lastSubdivInBeat) continue;
            if (t < subdivTimes[s]) break;  // ordered ascending; nothing further is due yet
            _metState.lastSubdivInBeat = s;
            if (Math.abs(t - subdivTimes[s]) <= 0.05) {
                _metClick('low');
                // Dim flash for subdivision — only raise alpha, never lower a beat flash in progress
                if (_metSettings.flashEnabled && _metState.flashAlpha < 0.07) {
                    _metState.flashAlpha = 0.07;
                }
            }
        }
    }

    // Count-in overlay: show 4-3-2-1 before the first beat
    if (_metSettings.countInEnabled && beats && beats.length >= 2) {
        const firstBeatTime = beats[0].time;
        const beatInterval = beats[1].time - beats[0].time;
        const remaining = firstBeatTime - t;
        if (remaining > 0.01 && beatInterval > 0.01) {
            const count = Math.ceil((remaining + 0.001) / beatInterval);
            if (count >= 1 && count <= 4) {
                // alpha: 1.0 at the start of each count beat, fades to ~0.3 before the next
                const beatPhase = ((remaining + 0.001) % beatInterval) / beatInterval;
                _metUpdateCountIn(count, 0.3 + 0.7 * (1 - beatPhase));
            } else {
                _metClearCountIn();
            }
        } else {
            _metClearCountIn();
        }
    } else if (_metCountInEl) {
        _metClearCountIn();
    }

    // Fade flash every tick (draw hook also fades per frame)
    _metState.flashAlpha *= 0.85;
}

// Register draw hook on the highway renderer for the visual flash
_metEnsureDrawHookInstalled();

// Poll at 60fps for beat detection
const TICK_INTERVAL_ID_KEY = 'slopsmithMetronomeTickIntervalId';
if (window[TICK_INTERVAL_ID_KEY]) {
    clearInterval(window[TICK_INTERVAL_ID_KEY]);
}
window[TICK_INTERVAL_ID_KEY] = setInterval(function() {
    const currentHighway = _metGetHighway();
    const now = Date.now();
    if (
        window[DRAW_HOOK_HIGHWAY_REF_KEY] !== currentHighway &&
        now >= _metNextDrawHookRetryAtMs
    ) {
        _metEnsureDrawHookInstalled();
        _metNextDrawHookRetryAtMs = now + DRAW_HOOK_RETRY_DELAY_MS;
    }
    _metTick();
}, 1000 / 60);

// Hook into playSong to inject button and reset state
(function() {
    const METRONOME_HOOKS_INSTALLED_KEY = '__slopsmithMetronomeHooksInstalled';
    const INSTALLED_PLAY_SONG_WRAPPER_REF_KEY = '__slopsmithMetronomeInstalledPlaySongWrapperRef';
    const PLAY_SONG_WRAPPED_TAG = 'slopsmithMetronomePlaySongWrapped';
    const PLAY_SONG_ORIGINAL_REF_TAG = 'slopsmithMetronomePlaySongOriginalRef';
    const currentPlaySong = window.playSong;
    if (typeof currentPlaySong !== 'function') return;
    const installedPlaySongRef = window[INSTALLED_PLAY_SONG_WRAPPER_REF_KEY];
    if (
        window[METRONOME_HOOKS_INSTALLED_KEY] === true &&
        installedPlaySongRef === currentPlaySong &&
        currentPlaySong[PLAY_SONG_WRAPPED_TAG] === true
    ) {
        return;
    }
    const playSongBaseFn = (
        currentPlaySong[PLAY_SONG_WRAPPED_TAG] === true &&
        typeof currentPlaySong[PLAY_SONG_ORIGINAL_REF_TAG] === 'function'
    )
        ? currentPlaySong[PLAY_SONG_ORIGINAL_REF_TAG]
        : currentPlaySong;

    const wrappedPlaySong = async function(filename, arrangement) {
        _metState.lastBeatIdx = -1;
        _metState.lastSubdivInBeat = -1;
        _metClearCountIn();
        await playSongBaseFn(filename, arrangement);
        _metInjectButton();
    };
    wrappedPlaySong[PLAY_SONG_WRAPPED_TAG] = true;
    wrappedPlaySong[PLAY_SONG_ORIGINAL_REF_TAG] = playSongBaseFn;
    window.playSong = wrappedPlaySong;
    window[INSTALLED_PLAY_SONG_WRAPPER_REF_KEY] = wrappedPlaySong;
    window[METRONOME_HOOKS_INSTALLED_KEY] = true;
})();

// Rebind existing controls immediately on script initialization/re-evaluation.
_metInjectButton();

})();
