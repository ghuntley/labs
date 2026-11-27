// Live tab-audio capture for YouTube songs.
//
// The YouTube player plays inside this tab. We ask the browser to capture
// this tab's audio. With suppressLocalAudioPlayback the browser stops playing
// the tab's sound itself, so we can analyse the captured audio *now* and play
// it back through a DelayNode LOOKAHEAD seconds later: the track is built
// LOOKAHEAD seconds ahead of what you hear, so blocks land on the beat.
//
// Without suppression (e.g. Firefox), you hear the tab directly; items still
// appear LOOKAHEAD seconds ahead on the track but arrive after the beat.

export const LOOKAHEAD = 2.5;

export function captureSupport() {
  const md = navigator.mediaDevices;
  if (!window.isSecureContext) return { ok: false, why: 'Tab capture needs https.' };
  if (!md || !md.getDisplayMedia) return { ok: false, why: 'This browser cannot capture tab audio.' };
  const sc = md.getSupportedConstraints ? md.getSupportedConstraints() : {};
  return { ok: true, suppress: !!sc.suppressLocalAudioPlayback };
}

// Must be called from a user gesture. Resolves to { stream, suppressed }.
export async function captureTabAudio() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    // Chrome requires video to be requested; we drop it immediately.
    video: { displaySurface: 'browser', frameRate: 1, width: 64, height: 64 },
    audio: {
      suppressLocalAudioPlayback: true,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
    systemAudio: 'exclude',
    monitorTypeSurfaces: 'exclude',
  });
  for (const v of stream.getVideoTracks()) v.stop();
  const audio = stream.getAudioTracks()[0];
  if (!audio) {
    throw new Error('No audio was shared. Pick "This tab" and keep "Share tab audio" switched on.');
  }
  const settings = audio.getSettings ? audio.getSettings() : {};
  return { stream, suppressed: settings.suppressLocalAudioPlayback === true };
}

// Polled once per animation frame. Reports features at capture time
// ctx.currentTime, normalised with slow automatic gain so quiet and loud
// songs both use the full range.
export class LiveAnalyser {
  constructor(ctx, stream, { routeToOutput }) {
    this.ctx = ctx;
    this.src = ctx.createMediaStreamSource(stream);
    this.an = ctx.createAnalyser();
    this.an.fftSize = 2048;
    this.an.smoothingTimeConstant = 0;
    this.src.connect(this.an);
    if (routeToOutput) {
      this.delay = ctx.createDelay(LOOKAHEAD + 1);
      this.delay.delayTime.value = LOOKAHEAD;
      this.src.connect(this.delay).connect(ctx.destination);
    }
    this.freq = new Float32Array(this.an.frequencyBinCount);
    this.time = new Float32Array(this.an.fftSize);
    this.prevMag = new Float32Array(this.an.frequencyBinCount);
    this.fluxHist = [];
    this.lastOnset = -Infinity;
    this.rmsPeak = 0.05;
    this.fluxPeak = 1;
    this.cMean = 0.15;
    this.prevFlux = 0;
  }

  poll() {
    const t = this.ctx.currentTime;
    this.an.getFloatTimeDomainData(this.time);
    this.an.getFloatFrequencyData(this.freq);
    let sq = 0;
    for (let i = 0; i < this.time.length; i++) sq += this.time[i] * this.time[i];
    const rms = Math.sqrt(sq / this.time.length);

    let flux = 0, wsum = 0, msum = 0;
    const bins = this.freq.length;
    for (let k = 2; k < bins; k++) {
      const db = this.freq[k];
      const m = Math.log1p(100 * (db > -160 ? Math.pow(10, db / 20) : 0));
      const d = m - this.prevMag[k];
      if (d > 0) flux += d;
      this.prevMag[k] = m;
      wsum += k * m;
      msum += m;
    }
    const centroidRaw = msum > 0 ? wsum / msum / bins : this.cMean;
    this.cMean += (centroidRaw - this.cMean) * 0.01;

    this.rmsPeak = Math.max(rms, this.rmsPeak * 0.9995, 0.02);
    const intensity = Math.min(1, rms / this.rmsPeak);
    const centroid = Math.max(0, Math.min(1, 0.5 + (centroidRaw - this.cMean) * 6));

    // Onset: a rising flux well above its recent average.
    const hist = this.fluxHist;
    const mean = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : flux;
    hist.push(flux);
    if (hist.length > 30) hist.shift();
    let onset = null;
    if (flux > mean * 1.5 + 0.5 && flux > this.prevFlux && t - this.lastOnset > 0.09 && rms > 0.005) {
      this.fluxPeak = Math.max(flux, this.fluxPeak * 0.999);
      onset = { strength: Math.min(1, flux / this.fluxPeak) };
      this.lastOnset = t;
    } else {
      this.fluxPeak *= 0.9999;
    }
    this.prevFlux = flux;
    // The analyser window ends "now"; the transient is on average a little earlier.
    return { t, intensity, centroid, onset, onsetT: t - 0.025 };
  }

  setDelayEnabled(on) {
    if (this.delay) this.delay.disconnect();
    if (on && this.delay) this.delay.connect(this.ctx.destination);
  }

  stop() {
    try { this.src.disconnect(); } catch {}
    try { this.delay && this.delay.disconnect(); } catch {}
  }
}
