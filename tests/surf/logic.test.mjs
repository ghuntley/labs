// Unit tests for the pure game logic: `node --test tests/surf/`.
// (UI behaviour is covered by the Bombadil spec in spec.ts.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, toTrackFeatures } from '../../games/surf/js/audio/offline.js';
import { parseYouTubeId } from '../../games/surf/js/audio/youtube.js';
import { buildFromAnalysis, buildFromTempo, TrackBuilder, DT } from '../../games/surf/js/track/generate.js';
import { Game } from '../../games/surf/js/game/play.js';
import { makeRng } from '../../games/surf/js/rng.js';

const SR = 44100;

function clickTrack(bpm, seconds, start = 0.5) {
  const out = new Float32Array(Math.round(SR * seconds));
  const rng = makeRng(1);
  for (let i = 0; i < out.length; i++) out[i] = (rng.next() - 0.5) * 0.002;
  const clicks = [];
  for (let t = start; t < seconds - 0.2; t += 60 / bpm) {
    clicks.push(t);
    const s0 = Math.round(t * SR);
    for (let i = 0; i < 0.03 * SR; i++) out[s0 + i] += (rng.next() - 0.5) * 1.6 * Math.exp(-i / (0.006 * SR));
  }
  return { samples: out, clicks };
}

test('onsets land on clicks within 20ms', async () => {
  const { samples, clicks } = clickTrack(120, 20);
  const a = await analyse(samples, SR);
  for (const c of clicks) {
    const near = a.onsets.reduce((m, o) => Math.min(m, Math.abs(o.t - c)), Infinity);
    assert.ok(near < 0.02, `click at ${c.toFixed(3)} nearest onset ${(near * 1000).toFixed(1)}ms`);
  }
  assert.ok(a.onsets.length <= clicks.length * 1.1, `too many onsets: ${a.onsets.length} vs ${clicks.length}`);
});

for (const bpm of [92, 120, 140, 174]) {
  test(`tempo of a ${bpm} BPM click track is within 1 BPM`, async () => {
    const { samples } = clickTrack(bpm, 30);
    const a = await analyse(samples, SR);
    assert.ok(Math.abs(a.bpm - bpm) < 1 || Math.abs(a.bpm - bpm * 2) < 2 || Math.abs(a.bpm - bpm / 2) < 1,
      `estimated ${a.bpm.toFixed(2)}`);
  });
}

test('track features are normalised to 0..1', async () => {
  const { samples } = clickTrack(120, 10);
  const a = await analyse(samples, SR);
  const f = toTrackFeatures(a, DT);
  for (const arr of [f.intensity, f.centroid]) for (const v of arr) assert.ok(v >= 0 && v <= 1);
});

test('same input and seed build an identical track', () => {
  const a = buildFromTempo(128, 60, 42);
  const b = buildFromTempo(128, 60, 42);
  assert.deepEqual(a.items, b.items);
  assert.deepEqual(a.x, b.x);
  const c = buildFromTempo(128, 60, 43);
  assert.notDeepEqual(a.items, c.items);
});

test('a shard never blocks every lane at the same time', () => {
  for (let seed = 0; seed < 50; seed++) {
    const b = buildFromTempo(150, 120, seed);
    const byT = new Map();
    for (const it of b.items) if (it.kind === 'shard') byT.set(it.t, (byT.get(it.t) || 0) + 1);
    for (const n of byT.values()) assert.ok(n < 3);
  }
});

test('items are in time order and in valid lanes', () => {
  const b = buildFromTempo(100, 90, 7);
  for (let i = 1; i < b.items.length; i++) assert.ok(b.items[i].t >= b.items[i - 1].t);
  for (const it of b.items) assert.ok([0, 1, 2].includes(it.lane));
});

test('frameAt is continuous', () => {
  const b = buildFromTempo(120, 30, 3);
  let prev = b.frameAt(0);
  for (let t = 0.01; t < 30; t += 0.01) {
    const f = b.frameAt(t);
    const d = Math.hypot(f.x - prev.x, f.y - prev.y, f.z - prev.z);
    assert.ok(d < 2, `jump of ${d} at ${t}`);
    prev = f;
  }
});

test('perfect play collects every pulse', () => {
  const b = buildFromTempo(120, 60, 9);
  const g = new Game(b);
  for (let t = 0; t < 61; t += 1 / 120) {
    const nextPulse = b.items.slice(g.next).find((it) => it.kind === 'pulse');
    if (nextPulse) { g.setLane(nextPulse.lane); g.lanePos = nextPulse.lane; }
    g.update(t, false);
  }
  assert.equal(g.collected, g.pulses);
  assert.ok(g.pulses > 50);
  assert.equal(g.bestFlow, g.pulses);
});

test('YouTube URL shapes', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}&list=RD`,
    `https://youtu.be/${id}?si=abc`,
    `youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) assert.equal(parseYouTubeId(u), id, u);
  for (const u of ['', 'hello', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=short', null])
    assert.equal(parseYouTubeId(u), null, String(u));
});
