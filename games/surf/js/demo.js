// A short synthesised groove so the game can be played (and tested) without
// a file or a YouTube link. Rendered into an AudioBuffer, then analysed like
// any local file. Deterministic.

import { makeRng } from './rng.js';

export function makeDemoBuffer(ctx, seconds = 64, bpm = 126) {
  const sr = ctx.sampleRate;
  const n = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const rng = makeRng(2026);
  const beat = 60 / bpm;
  const bars = Math.floor(seconds / (beat * 4));
  const bassNotes = [55, 55, 65.41, 49]; // A1 A1 C2 G1

  const add = (t0, len, fn, pan = 0) => {
    const s0 = Math.floor(t0 * sr);
    const sN = Math.min(n - s0, Math.floor(len * sr));
    for (let i = 0; i < sN; i++) {
      const v = fn(i / sr);
      L[s0 + i] += v * (1 - pan);
      R[s0 + i] += v * (1 + pan);
    }
  };

  for (let bar = 0; bar < bars; bar++) {
    const section = Math.floor(bar / 8) % 4; // 0 intro, 1 build, 2 drop, 3 break
    for (let q = 0; q < 4; q++) {
      const t = (bar * 4 + q) * beat;
      // Kick on every beat except in the break.
      if (section !== 3 || q === 0) {
        add(t, 0.35, (x) => Math.sin(2 * Math.PI * (45 + 120 * Math.exp(-x * 30)) * x) * Math.exp(-x * 9) * 0.9);
      }
      // Clap on 2 and 4 from the build on.
      if (section >= 1 && (q === 1 || q === 3)) {
        add(t, 0.2, (x) => (rng.next() - 0.5) * 0.8 * Math.exp(-x * 22));
      }
      // Hats on the off-beats (16ths in the drop).
      const hats = section === 2 ? [0.25, 0.5, 0.75] : [0.5];
      for (const h of hats) {
        add(t + h * beat, 0.05, (x) => (rng.next() - 0.5) * 0.35 * Math.exp(-x * 90), h === 0.5 ? 0.3 : -0.3);
      }
      // Bass in the build and drop.
      if (section === 1 || section === 2) {
        const f = bassNotes[bar % 4];
        add(t + beat * 0.5, beat * 0.45, (x) => Math.sign(Math.sin(2 * Math.PI * f * x)) * 0.18 * Math.exp(-x * 4));
      }
    }
    // A rising pad through the build and break.
    if (section === 1 || section === 3) {
      const f = 220 * (section === 1 ? 1 + (bar % 8) / 16 : 1);
      add(bar * 4 * beat, beat * 4, (x) => Math.sin(2 * Math.PI * f * x) * 0.06 + Math.sin(2 * Math.PI * f * 1.5 * x) * 0.04, 0.2);
    }
  }
  // Soft limiter.
  for (let i = 0; i < n; i++) {
    L[i] = Math.tanh(L[i]);
    R[i] = Math.tanh(R[i]);
  }
  return buf;
}
