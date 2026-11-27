// The track: a ribbon through space indexed by song time, plus the items on
// it. One TrackBuilder serves every music source:
//   - files:        all features pushed up front (buildFromAnalysis)
//   - tab capture:  features pushed live, a few seconds ahead of the player
//   - tempo mode:   synthetic features from a BPM and a seed (buildFromTempo)
// Everything is deterministic for a given seed and input.

import { makeRng } from '../rng.js';

export const DT = 1 / 30; // seconds per track sample
export const LANES = 3;
export const LANE_WIDTH = 3;
export const PRE_ROLL = 3; // seconds of calm track before the song starts

const SURGE_ON = 0.78;
const SURGE_OFF = 0.6;
const SURGE_HOLD = 2.0; // seconds above SURGE_ON before a surge starts

export class TrackBuilder {
  constructor(seed) {
    this.rng = makeRng(seed);
    this.curveRng = makeRng(seed ^ 0x9e3779b9);
    this.t0 = -PRE_ROLL;
    // Per-sample state (plain arrays; they grow during live play).
    this.x = []; this.y = []; this.z = [];
    this.yaw = []; this.pitch = []; this.roll = [];
    this.inten = []; this.surge = []; this.dist = [];
    this.items = []; // { t, lane, kind: 'pulse' | 'shard' }
    // Integrator state.
    this._pos = [0, 0, 0];
    this._yaw = 0; this._pitch = 0; this._roll = 0; this._d = 0;
    this._slowI = 0; this._fastI = 0; this._surge = false; this._hot = 0;
    this._noise = { a: 0, b: this.curveRng.range(-1, 1), phase: 0 };
    this._lastLane = 1; this._lastItemT = -Infinity; this._lastShardT = -Infinity;
    this._laneBusy = new Array(LANES).fill(-Infinity);
    for (let t = this.t0; t < 0; t += DT) this.push(0.15, 0.5);
  }

  get count() { return this.x.length; }
  // Song time of the newest sample.
  get end() { return this.t0 + (this.count - 1) * DT; }

  // Append one DT step. intensity and centroid are normalised 0..1.
  push(intensity, centroid) {
    this._fastI += (intensity - this._fastI) * 0.25;
    this._slowI += (intensity - this._slowI) * 0.04;
    const I = this._fastI;

    // Surge: hysteresis on the slow envelope.
    if (!this._surge) {
      this._hot = this._slowI > SURGE_ON ? this._hot + DT : 0;
      if (this._hot >= SURGE_HOLD) this._surge = true;
    } else if (this._slowI < SURGE_OFF) {
      this._surge = false;
      this._hot = 0;
    }

    const speed = 34 + 46 * I; // units per second
    const ds = speed * DT;

    // Curves: smooth seeded noise, sharper when the sound is brighter.
    const n = this._noise;
    n.phase += DT / 2.5;
    if (n.phase >= 1) {
      n.phase -= 1;
      n.a = n.b;
      n.b = this.curveRng.range(-1, 1);
    }
    const s = n.phase * n.phase * (3 - 2 * n.phase);
    const bend = n.a + (n.b - n.a) * s;
    const yawRate = bend * (0.004 + 0.012 * centroid); // radians per unit
    this._yaw += yawRate * ds;

    // Climb in quiet passages, dive in loud ones.
    const targetPitch = Math.max(-0.32, Math.min(0.22, (0.35 - this._slowI) * 0.55));
    this._pitch += (targetPitch - this._pitch) * 0.03;
    const targetRoll = Math.max(-0.5, Math.min(0.5, -yawRate * speed * 0.9));
    this._roll += (targetRoll - this._roll) * 0.1;

    const cp = Math.cos(this._pitch);
    this._pos[0] += Math.sin(this._yaw) * cp * ds;
    this._pos[1] += Math.sin(this._pitch) * ds;
    this._pos[2] += -Math.cos(this._yaw) * cp * ds;
    this._d += ds;

    this.x.push(this._pos[0]); this.y.push(this._pos[1]); this.z.push(this._pos[2]);
    this.yaw.push(this._yaw); this.pitch.push(this._pitch); this.roll.push(this._roll);
    this.inten.push(I); this.surge.push(this._surge ? 1 : 0); this.dist.push(this._d);
  }

  // Add an item for an onset at song time t (must be non-decreasing).
  addOnset(t, strength) {
    if (t < 0.5 || strength < 0.12) return;
    if (t - this._lastItemT < 0.11) return;
    const rng = this.rng;
    const free = (lane) => t - this._laneBusy[lane] > 0.22;

    if (strength > 0.82 && t - this._lastShardT > 0.9 && rng.next() < 0.65) {
      // Shard in the lane the player is probably in; on huge hits block two
      // lanes, always leaving one open.
      const lanes = [this._lastLane];
      if (strength > 0.95 && rng.next() < 0.5) {
        const others = [0, 1, 2].filter((l) => l !== this._lastLane);
        lanes.push(rng.pick(others));
      }
      for (const lane of lanes) {
        this.items.push({ t, lane, kind: 'shard' });
        this._laneBusy[lane] = t;
      }
      this._lastShardT = t;
      this._lastItemT = t;
      // Nudge the next pulse out of the blocked lane(s).
      const open = [0, 1, 2].filter((l) => !lanes.includes(l));
      this._lastLane = rng.pick(open);
      return;
    }

    const gap = t - this._lastItemT;
    let lane = this._lastLane;
    const r = rng.next();
    if (gap > 0.45 && r < 0.2) lane = this._lastLane === 1 ? rng.pick([0, 2]) : 2 - this._lastLane;
    else if (r < 0.55) lane = Math.max(0, Math.min(LANES - 1, this._lastLane + rng.pick([-1, 1])));
    if (!free(lane)) {
      const alt = [0, 1, 2].filter(free);
      if (!alt.length) return;
      lane = rng.pick(alt);
    }
    this.items.push({ t, lane, kind: 'pulse' });
    this._lastLane = lane;
    this._lastItemT = t;
  }

  // Interpolated frame at song time t (clamped to the built range).
  frameAt(t, out = {}) {
    const f = Math.max(0, Math.min(this.count - 1, (t - this.t0) / DT));
    const i = Math.min(this.count - 2, Math.floor(f));
    const a = f - i;
    const L = (arr) => arr[i] + (arr[i + 1] - arr[i]) * a;
    out.x = L(this.x); out.y = L(this.y); out.z = L(this.z);
    out.yaw = L(this.yaw); out.pitch = L(this.pitch); out.roll = L(this.roll);
    out.intensity = L(this.inten); out.surge = this.surge[Math.round(f)] === 1;
    out.dist = L(this.dist);
    return out;
  }

  // Song time of sample i.
  timeOf(i) { return this.t0 + i * DT; }
}

// Basis vectors for a frame: forward, right, up (unit, right-handed, -z ahead).
export function basis(fr) {
  const cp = Math.cos(fr.pitch), sp = Math.sin(fr.pitch);
  const sy = Math.sin(fr.yaw), cy = Math.cos(fr.yaw);
  const f = [sy * cp, sp, -cy * cp];
  // Unrolled right and up.
  let r = [cy, 0, sy];
  let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  // Apply roll about forward.
  const cr = Math.cos(fr.roll), sr = Math.sin(fr.roll);
  const r2 = [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr];
  const u2 = [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr];
  return { f, r: r2, u: u2 };
}

export function laneOffset(lane) {
  return (lane - (LANES - 1) / 2) * LANE_WIDTH;
}

// Whole song from a local-file analysis (see audio/offline.js).
export function buildFromAnalysis(features, onsets, seed) {
  const b = new TrackBuilder(seed);
  const { intensity, centroid } = features;
  for (let i = 0; i < intensity.length; i++) b.push(intensity[i], centroid[i]);
  for (let i = 0; i < 4 / DT; i++) b.push(0.1, 0.5); // run-out after the song
  for (const o of onsets) b.addOnset(o.t, o.strength);
  return b;
}

// Synthetic song for tempo mode: a beat grid with seeded patterns and
// sections whose energy rises and falls every 16 bars.
export function tempoFeatures(bpm, duration, seed, offset = 0) {
  const rng = makeRng(seed ^ 0x5bd1e995);
  const beat = 60 / bpm;
  const sectionLen = beat * 4 * 16;
  const sections = [];
  for (let s = 0; s * sectionLen < duration + sectionLen; s++) sections.push(rng.range(0.25, 1));
  const energyAt = (t) => {
    const i = Math.max(0, t / sectionLen);
    const a = Math.floor(i), f = i - a;
    const e0 = sections[a] ?? 0.5, e1 = sections[a + 1] ?? e0;
    return e0 + (e1 - e0) * Math.min(1, f * 4); // quick ramp at section starts
  };
  const steps = Math.ceil(duration / DT);
  const intensity = new Float32Array(steps);
  const centroid = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    const e = energyAt(t);
    const pulse = Math.exp(-(((t - offset) % beat) + beat) % beat / 0.12);
    intensity[i] = Math.min(1, e * (0.75 + 0.25 * pulse));
    centroid[i] = 0.5 + 0.4 * Math.sin(t / (beat * 8));
  }
  const onsets = [];
  for (let k = 0; offset + k * beat < duration; k++) {
    const t = offset + k * beat;
    const e = energyAt(t);
    const downbeat = k % 4 === 0;
    onsets.push({ t, strength: downbeat ? Math.min(1, 0.55 + e * 0.45) : 0.35 + e * 0.35 });
    if (e > 0.55 && rng.next() < e - 0.3) onsets.push({ t: t + beat / 2, strength: 0.3 + e * 0.2 });
  }
  return { features: { intensity, centroid }, onsets };
}

export function buildFromTempo(bpm, duration, seed, offset = 0) {
  const { features, onsets } = tempoFeatures(bpm, duration, seed, offset);
  return buildFromAnalysis(features, onsets, seed);
}
