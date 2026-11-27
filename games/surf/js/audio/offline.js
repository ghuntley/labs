// Whole-song analysis for local files. Pure functions over Float32Array so the
// same code runs in the browser and under `node --test`.
//
//   analyse(samples, sampleRate) -> {
//     duration, frameDt,              seconds per analysis frame
//     rms[], centroid[], flux[],      per-frame features
//     onsets: [{ t, strength }],      strength normalised 0..1 per song
//     bpm, beatOffset,                tempo estimate and first-beat phase (s)
//   }

export const FFT_SIZE = 1024;
export const HOP = 512;

// Mix an AudioBuffer (or anything with numberOfChannels/getChannelData) to mono.
export function toMono(buffer) {
  const n = buffer.length;
  const out = new Float32Array(n);
  const ch = buffer.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / ch;
  }
  return out;
}

// In-place iterative radix-2 FFT on separate real/imag arrays.
function makeFft(n) {
  const levels = Math.log2(n);
  if (levels % 1) throw new Error('FFT size must be a power of two');
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >>> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float32Array(n / 2);
  const sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >>> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j;
          const b = a + half;
          const tr = re[b] * cos[k] + im[b] * sin[k];
          const ti = im[b] * cos[k] - re[b] * sin[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

// Per-frame features. `onProgress(fraction)` is optional; the function yields
// to the event loop periodically so the page stays responsive.
export async function analyse(samples, sampleRate, onProgress) {
  const n = FFT_SIZE;
  const frames = Math.max(0, Math.floor((samples.length - n) / HOP) + 1);
  const fft = makeFft(n);
  const win = new Float32Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const bins = n / 2;
  let prev = new Float32Array(bins);
  let cur = new Float32Array(bins);
  const rms = new Float32Array(frames);
  const centroid = new Float32Array(frames);
  const flux = new Float32Array(frames);
  // Ignore sub-30Hz rumble and keep the top end from dominating the centroid.
  const lo = Math.max(1, Math.floor((30 * n) / sampleRate));

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const s = samples[off + i];
      sq += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(sq / n);
    fft(re, im);
    let fl = 0, wsum = 0, msum = 0;
    for (let k = lo; k < bins; k++) {
      const m = Math.log1p(100 * Math.hypot(re[k], im[k]));
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0) fl += d;
      wsum += k * m;
      msum += m;
    }
    flux[f] = f === 0 ? 0 : fl;
    centroid[f] = msum > 0 ? wsum / msum / bins : 0;
    const t = prev; prev = cur; cur = t;
    if ((f & 1023) === 1023) {
      if (onProgress) onProgress(f / frames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const frameDt = HOP / sampleRate;
  // A frame's flux peaks when a transient sits near the middle of its window.
  const frameTime = (f) => (f * HOP + n / 2) / sampleRate;
  const onsets = pickOnsets(flux, frameDt, frameTime);
  const { bpm, beatOffset } = estimateTempo(flux, frameDt, frameTime);
  if (onProgress) onProgress(1);
  return { duration: samples.length / sampleRate, frameDt, frameTime, rms, centroid, flux, onsets, bpm, beatOffset };
}

// Adaptive-threshold peak picking on the flux curve.
export function pickOnsets(flux, frameDt, frameTime) {
  const w = Math.max(2, Math.round(0.1 / frameDt)); // ±100ms local window
  const minGap = 0.07;
  const peaks = [];
  for (let f = 1; f < flux.length - 1; f++) {
    const v = flux[f];
    if (v <= flux[f - 1] || v < flux[f + 1]) continue;
    let sum = 0, cnt = 0, max = 0;
    for (let j = Math.max(0, f - w); j <= Math.min(flux.length - 1, f + w); j++) {
      sum += flux[j];
      cnt++;
      if (flux[j] > max) max = flux[j];
    }
    const mean = sum / cnt;
    if (v < mean * 1.4 + 1e-3 || v < max) continue;
    // Parabolic interpolation of the peak position between frames.
    const a = flux[f - 1], b = v, c = flux[f + 1];
    const den = a - 2 * b + c;
    const delta = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    const t = frameTime(f) + delta * frameDt;
    const last = peaks[peaks.length - 1];
    if (last && t - last.t < minGap) {
      if (v > last.raw) peaks[peaks.length - 1] = { t, raw: v };
      continue;
    }
    peaks.push({ t, raw: v });
  }
  // Normalise strength against the song's own loud onsets.
  const ref = percentile(peaks.map((p) => p.raw), 0.95) || 1;
  const floor = percentile(flux, 0.5);
  return peaks
    .filter((p) => p.raw > floor * 1.5)
    .map((p) => ({ t: p.t, strength: Math.min(1, p.raw / ref) }));
}

// Autocorrelation of the onset envelope over 70..180 BPM, weighted toward
// ~120 BPM, refined to sub-frame precision. Then pick the phase whose beat
// grid lands on the most flux.
export function estimateTempo(flux, frameDt, frameTime) {
  const n = flux.length;
  if (n < 16) return { bpm: 120, beatOffset: 0 };
  let mean = 0;
  for (let i = 0; i < n; i++) mean += flux[i];
  mean /= n;
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = Math.max(0, flux[i] - mean);

  const lagFor = (bpm) => 60 / bpm / frameDt;
  const minLag = Math.floor(lagFor(180));
  const maxLag = Math.min(n - 1, Math.ceil(lagFor(70)));
  const ac = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag];
    ac[lag] = s / (n - lag);
  }
  let best = -1, bestLag = lagFor(120);
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (!(ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1])) continue;
    const bpm = 60 / (lag * frameDt);
    const weight = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.6, 2));
    const score = ac[lag] * weight;
    if (score > best) {
      best = score;
      const a = ac[lag - 1], b = ac[lag], c = ac[lag + 1];
      const den = a - 2 * b + c;
      bestLag = lag + (den !== 0 ? (0.5 * (a - c)) / den : 0);
    }
  }
  const bpm = 60 / (bestLag * frameDt);

  // Phase search over one beat period.
  const steps = Math.max(1, Math.round(bestLag));
  let bestPhase = 0, bestSum = -1;
  for (let p = 0; p < steps; p++) {
    let s = 0;
    for (let x = p; x < n; x += bestLag) s += env[Math.round(x)] || 0;
    if (s > bestSum) { bestSum = s; bestPhase = p; }
  }
  return { bpm, beatOffset: frameTime(bestPhase) };
}

// Resample per-frame features onto the track's fixed time step, normalised
// to 0..1 against the song's own range.
export function toTrackFeatures(a, dt) {
  const steps = Math.ceil(a.duration / dt);
  const iRef = percentile(a.rms, 0.95) || 1;
  const cLo = percentile(a.centroid, 0.05);
  const cHi = percentile(a.centroid, 0.95);
  const intensity = new Float32Array(steps);
  const centroid = new Float32Array(steps);
  const per = a.frameDt;
  for (let s = 0; s < steps; s++) {
    const f0 = Math.floor((s * dt) / per);
    const f1 = Math.max(f0 + 1, Math.floor(((s + 1) * dt) / per));
    let ri = 0, ci = 0, cnt = 0;
    for (let f = f0; f < f1 && f < a.rms.length; f++) {
      ri += a.rms[f];
      ci += a.centroid[f];
      cnt++;
    }
    intensity[s] = cnt ? Math.min(1, ri / cnt / iRef) : 0;
    centroid[s] = cnt && cHi > cLo ? Math.min(1, Math.max(0, (ci / cnt - cLo) / (cHi - cLo))) : 0.5;
  }
  return { intensity, centroid };
}
