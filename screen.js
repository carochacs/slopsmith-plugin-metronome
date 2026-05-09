// Metronome Overlay plugin
// Adds audible click and visual flash on beats, synced to the song's tempo.

let _metEnabled = false;
let _metAudioCtx = null;
let _metLastBeatIdx = -1;
let _metVolume = 0.4;
let _metFlashAlpha = 0;
let _metFlashEnabled = true;

function _metClick(high) {
    if (!_metAudioCtx) _metAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = _metAudioCtx.createOscillator();
    const gain = _metAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(_metAudioCtx.destination);
    osc.frequency.value = high ? 1500 : 1000;
    osc.type = 'sine';
    gain.gain.setValueAtTime(_metVolume, _metAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _metAudioCtx.currentTime + 0.06);
    osc.start(_metAudioCtx.currentTime);
    osc.stop(_metAudioCtx.currentTime + 0.06);
}

function _metFlash(isMeasure) {
    if (_metFlashEnabled) _metFlashAlpha = isMeasure ? 0.35 : 0.15;
}

// Inject toggle button into player controls
function _metInjectButton() {
    const controls = document.getElementById('player-controls');
    if (!controls || document.getElementById('btn-metronome')) return;

    const lyricsBtn = document.getElementById('btn-lyrics');
    const insertBefore = lyricsBtn?.nextSibling || controls.querySelector('button:last-child');

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
    slider.value = '40';
    slider.className = 'w-16 accent-amber-400 hidden';
    slider.oninput = function() { _metSetVolume(this.value); };
    controls.insertBefore(slider, insertBefore);

    const label = document.createElement('span');
    label.id = 'met-vol-label';
    label.className = 'text-xs text-gray-500 w-8 hidden';
    label.textContent = '40%';
    controls.insertBefore(label, insertBefore);

    const flashLabel = document.createElement('label');
    flashLabel.id = 'met-flash-label';
    flashLabel.className = 'flex items-center gap-1 text-xs text-gray-500 cursor-pointer hidden';
    flashLabel.innerHTML = '<input type="checkbox" id="met-flash-check" checked class="accent-amber-400" onchange="_metFlashEnabled=this.checked"> Flash';
    controls.insertBefore(flashLabel, insertBefore);
}

function _metToggle() {
    _metEnabled = !_metEnabled;
    const btn = document.getElementById('btn-metronome');
    const slider = document.getElementById('met-volume');
    const label = document.getElementById('met-vol-label');
    if (btn) {
        btn.className = _metEnabled
            ? 'px-3 py-1.5 bg-amber-900/50 rounded-lg text-xs text-amber-300 transition'
            : 'px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-gray-500 transition';
        btn.textContent = _metEnabled ? 'Metronome ✓' : 'Metronome';
    }
    if (slider) slider.classList.toggle('hidden', !_metEnabled);
    if (label) label.classList.toggle('hidden', !_metEnabled);
    const flashLabel = document.getElementById('met-flash-label');
    if (flashLabel) flashLabel.classList.toggle('hidden', !_metEnabled);
    _metLastBeatIdx = -1;
}

function _metSetVolume(v) {
    _metVolume = v / 100;
    document.getElementById('met-vol-label').textContent = v + '%';
}

// Main tick — called from a polling loop
function _metTick() {
    if (!_metEnabled) {
        _metFlashAlpha = 0;
        return;
    }
    const beats = highway.getBeats();
    const t = highway.getTime();
    if (!beats || beats.length === 0) return;

    // Find the current beat (the most recent beat <= current time)
    let lo = 0, hi = beats.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid].time <= t) lo = mid + 1;
        else hi = mid;
    }
    const idx = lo - 1;
    if (idx < 0 || idx === _metLastBeatIdx) {
        // Fade out flash
        _metFlashAlpha *= 0.85;
        return;
    }

    // Only trigger if we're close to the beat (within 50ms) to avoid catching up on seeks
    const beatTime = beats[idx].time;
    if (Math.abs(t - beatTime) > 0.05) {
        _metLastBeatIdx = idx;
        _metFlashAlpha *= 0.85;
        return;
    }

    _metLastBeatIdx = idx;
    const isMeasure = beats[idx].measure >= 0;
    _metClick(isMeasure);
    _metFlash(isMeasure);
}

// Register draw hook on the highway renderer for the visual flash
const DRAW_HOOK_INSTALLED_FLAG = 'slopsmithMetronomeDrawHookInstalled';
if (!window[DRAW_HOOK_INSTALLED_FLAG]) {
    window[DRAW_HOOK_INSTALLED_FLAG] = true;
    highway.addDrawHook(function(ctx, W, H) {
        if (_metFlashAlpha < 0.005) return;

        // Flash across the play line area
        const y = H * 0.72;
        const h = H * 0.18;
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, `rgba(255, 200, 60, 0)`);
        grad.addColorStop(0.5, `rgba(255, 200, 60, ${_metFlashAlpha})`);
        grad.addColorStop(1, `rgba(255, 200, 60, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, W, h);

        // Fade
        _metFlashAlpha *= 0.88;
    });
}

// Poll at 60fps for beat detection
const TICK_INTERVAL_INSTALLED_FLAG = 'slopsmithMetronomeTickIntervalInstalled';
const TICK_INTERVAL_ID_KEY = 'slopsmithMetronomeTickIntervalId';
if (!window[TICK_INTERVAL_INSTALLED_FLAG]) {
    window[TICK_INTERVAL_INSTALLED_FLAG] = true;
    window[TICK_INTERVAL_ID_KEY] = setInterval(_metTick, 1000 / 60);
}

// Hook into playSong to inject button and reset state
(function() {
    // Idempotency: if screen.js is re-evaluated (loader cache miss, hot reload,
    // older core builds without the load-side guard), don't re-wrap playSong —
    // each re-wrap captures the previous wrapper, growing the chain and
    // leaking closures.
    const PLAY_SONG_HOOK_INSTALLED_FLAG = 'slopsmithMetronomeHooksInstalled';
    if (window[PLAY_SONG_HOOK_INSTALLED_FLAG]) return;
    window[PLAY_SONG_HOOK_INSTALLED_FLAG] = true;

    const origPlaySong = window.playSong;
    window.playSong = async function(filename, arrangement) {
        _metLastBeatIdx = -1;
        await origPlaySong(filename, arrangement);
        _metInjectButton();
    };
})();
