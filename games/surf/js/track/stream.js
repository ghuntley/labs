// Feeds live analyser readings into a TrackBuilder as the song plays.
// Song time 0 is the capture-clock moment the music started (t0).

export class LiveFeeder {
  constructor(builder, t0) {
    this.b = builder;
    this.t0 = t0;
    this.last = { intensity: 0.15, centroid: 0.5 };
  }

  // reading: { t, intensity, centroid, onset, onsetT } from LiveAnalyser.poll()
  feed(reading) {
    const songT = reading.t - this.t0;
    const from = this.last;
    // Interpolate across the gap between polls so the ribbon stays smooth.
    const n = Math.max(1, Math.ceil((songT - this.b.end) / (1 / 30)));
    for (let i = 1; this.b.end < songT; i++) {
      const a = Math.min(1, i / n);
      this.b.push(
        from.intensity + (reading.intensity - from.intensity) * a,
        from.centroid + (reading.centroid - from.centroid) * a,
      );
    }
    this.last = { intensity: reading.intensity, centroid: reading.centroid };
    if (reading.onset) this.b.addOnset(reading.onsetT - this.t0, reading.onset.strength);
  }

  // Run-out once the music has ended.
  finish(songT) {
    while (this.b.end < songT + 4) this.b.push(0.1, 0.5);
  }
}
