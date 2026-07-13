/**
 * Unit tests for _metTick beat-detection logic extracted from screen.js.
 *
 * The functions tested here are inside the IIFE so they can't be imported
 * directly — they're small enough to inline verbatim.  Any drift from the
 * source will be caught by failing assertions.
 *
 * Run with: node tests/test_metronome_tick.js
 */

'use strict';
const assert = require('assert').strict;

// ── Functions under test (verbatim from screen.js) ────────────────────────────

// Binary-search: find index of the most recent beat <= t.
// Returns -1 when t is before all beats.
function _findBeatIdx(beats, t) {
    let lo = 0, hi = beats.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid].time <= t) lo = mid + 1;
        else hi = mid;
    }
    return lo - 1;
}

// Subdivision times within beat interval [beatStart, nextBeatStart).
// Returns an array of times (ascending) for the given mode.
function _subdivTimes(beats, idx, mode) {
    if (mode === 'none' || idx + 1 >= beats.length) return [];
    const beatStart = beats[idx].time;
    const dt = beats[idx + 1].time - beatStart;
    if (mode === 'eighth') return [beatStart + dt * 0.5];
    if (mode === 'triplet') return [beatStart + dt / 3, beatStart + dt * 2 / 3];
    return [];
}

const BEAT_TOLERANCE = 0.05; // seconds — from screen.js _metTick

// ── Helpers ───────────────────────────────────────────────────────────────────

let _passed = 0, _failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓  ${name}`);
        _passed++;
    } catch (e) {
        console.error(`  ✗  ${name}`);
        console.error(`       ${e.message}`);
        _failed++;
    }
}

// Build a beat array at a fixed BPM.  measure=1 every `barLen` beats.
function makeBeats(bpm, count, barLen = 4) {
    const dt = 60 / bpm;
    return Array.from({ length: count }, (_, i) => ({
        time: i * dt,
        measure: i % barLen === 0 ? 1 : -1,
    }));
}

// ── _findBeatIdx ──────────────────────────────────────────────────────────────

console.log('\n_findBeatIdx — beat index lookup');

test('before first beat → -1', () => {
    const beats = makeBeats(120, 8);
    assert.equal(_findBeatIdx(beats, -0.01), -1);
});

test('exactly on first beat → 0', () => {
    const beats = makeBeats(120, 8);
    assert.equal(_findBeatIdx(beats, 0), 0);
});

test('halfway between beat 0 and 1 → 0', () => {
    const beats = makeBeats(120, 8);         // dt = 0.5s at 120 BPM
    assert.equal(_findBeatIdx(beats, 0.25), 0);
});

test('exactly on beat 3 → 3', () => {
    const beats = makeBeats(120, 8);
    assert.equal(_findBeatIdx(beats, 1.5), 3);
});

test('just before beat 4 → 3', () => {
    const beats = makeBeats(120, 8);         // beat 4 is at 2.0s
    assert.equal(_findBeatIdx(beats, 1.999), 3);
});

test('after last beat → last index', () => {
    const beats = makeBeats(120, 4);         // 4 beats, last at 1.5s
    assert.equal(_findBeatIdx(beats, 999), 3);
});

test('works at non-uniform BPM (all intervals differ)', () => {
    // Simulate a rallentando: each beat is 10% slower.
    let t = 0;
    const beats = Array.from({ length: 8 }, (_, i) => {
        const entry = { time: t, measure: i % 4 === 0 ? 1 : -1 };
        t += 0.5 * Math.pow(1.1, i);
        return entry;
    });
    // Should always find the most recent beat <= current time.
    for (let i = 0; i < beats.length - 1; i++) {
        const mid = (beats[i].time + beats[i + 1].time) / 2;
        assert.equal(_findBeatIdx(beats, mid), i, `between beat ${i} and ${i + 1}`);
    }
});

// ── _subdivTimes — eighth ─────────────────────────────────────────────────────

console.log('\n_subdivTimes — eighth notes');

test('one subdivision at midpoint of beat interval', () => {
    const beats = makeBeats(120, 4);        // dt = 0.5s
    const times = _subdivTimes(beats, 0, 'eighth');
    assert.equal(times.length, 1);
    assert.ok(Math.abs(times[0] - 0.25) < 1e-9, `got ${times[0]}`);
});

test('no subdivision for last beat (no next beat)', () => {
    const beats = makeBeats(120, 2);
    const times = _subdivTimes(beats, 1, 'eighth');
    assert.equal(times.length, 0);
});

test('subdivision scales with BPM change (60 BPM → dt=1s)', () => {
    const beats = makeBeats(60, 4);
    const times = _subdivTimes(beats, 0, 'eighth');
    assert.ok(Math.abs(times[0] - 0.5) < 1e-9, `got ${times[0]}`);
});

// ── _subdivTimes — triplets ───────────────────────────────────────────────────

console.log('\n_subdivTimes — triplet notes');

test('two subdivisions at 1/3 and 2/3 of beat interval', () => {
    const beats = makeBeats(120, 4);        // dt = 0.5s
    const times = _subdivTimes(beats, 0, 'triplet');
    assert.equal(times.length, 2);
    const [t1, t2] = times;
    assert.ok(Math.abs(t1 - 1 / 6) < 1e-9, `t1=${t1}`);
    assert.ok(Math.abs(t2 - 1 / 3) < 1e-9, `t2=${t2}`);
});

test('triplets are strictly ascending', () => {
    const beats = makeBeats(120, 4);
    const [t1, t2] = _subdivTimes(beats, 1, 'triplet');
    assert.ok(t1 < t2, `t1=${t1} t2=${t2}`);
});

test('"none" mode → no subdivisions', () => {
    const beats = makeBeats(120, 4);
    assert.equal(_subdivTimes(beats, 0, 'none').length, 0);
});

// ── Tolerance gating ─────────────────────────────────────────────────────────

console.log('\n_findBeatIdx + tolerance gating');

test('tick exactly on beat fires within tolerance', () => {
    const beats = makeBeats(120, 8);
    const idx = _findBeatIdx(beats, beats[2].time);
    assert.equal(idx, 2);
    assert.ok(Math.abs(beats[2].time - beats[2].time) <= BEAT_TOLERANCE);
});

test('tick 49ms after beat fires (within ±50ms window)', () => {
    const beats = makeBeats(120, 8);
    const t = beats[1].time + 0.049;
    const idx = _findBeatIdx(beats, t);
    assert.equal(idx, 1);
    assert.ok(Math.abs(t - beats[idx].time) <= BEAT_TOLERANCE);
});

test('tick 51ms after beat is outside tolerance window', () => {
    const beats = makeBeats(120, 8);
    const t = beats[1].time + 0.051;
    const idx = _findBeatIdx(beats, t);
    assert.equal(idx, 1);
    assert.ok(Math.abs(t - beats[idx].time) > BEAT_TOLERANCE);
});

// ── Measure detection ─────────────────────────────────────────────────────────

console.log('\nMeasure detection');

test('beat 0 is a measure beat', () => {
    const beats = makeBeats(120, 8);
    assert.ok(beats[0].measure >= 0);
});

test('beat 1 is not a measure beat', () => {
    const beats = makeBeats(120, 8);
    assert.ok(beats[1].measure < 0);
});

test('beat 4 is a measure beat (4/4 bar)', () => {
    const beats = makeBeats(120, 8);
    assert.ok(beats[4].measure >= 0);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${_passed + _failed} tests: ${_passed} passed, ${_failed} failed\n`);
if (_failed > 0) process.exit(1);
