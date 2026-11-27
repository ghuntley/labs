// Game rules, independent of rendering and audio. Advance with the song
// clock; items resolve when the clock passes their time.
//
//   pulse collected: +100 x flow multiplier (x2 during a surge), flow + 1
//   pulse missed:    flow resets
//   shard hit:       flow resets, -250 (score never drops below 0)

import { LANES } from '../track/generate.js';

export const LANE_SPEED = 9; // lanes per second when sliding

export function multiplier(flow) {
  return 1 + Math.min(flow, 32) / 8; // 1x .. 5x
}

export class Game {
  constructor(builder) {
    this.b = builder;
    this.lane = 1; // target lane (integer)
    this.lanePos = 1; // rendered lane position (float)
    this.score = 0;
    this.flow = 0;
    this.bestFlow = 0;
    this.pulses = 0;
    this.collected = 0;
    this.shardsHit = 0;
    this.next = 0; // index of the first unresolved item
    this.events = []; // { kind: 'collect'|'miss'|'shard', item } since last drain
    this.lastT = -Infinity;
  }

  setLane(l) {
    this.lane = Math.max(0, Math.min(LANES - 1, l));
  }
  move(dir) {
    this.setLane(this.lane + dir);
  }

  update(t, surge) {
    const dt = Math.max(0, Math.min(0.1, t - (Number.isFinite(this.lastT) ? this.lastT : t)));
    this.lastT = t;
    const d = this.lane - this.lanePos;
    const step = LANE_SPEED * dt;
    this.lanePos = Math.abs(d) <= step ? this.lane : this.lanePos + Math.sign(d) * step;

    const items = this.b.items;
    while (this.next < items.length && items[this.next].t <= t) {
      const it = items[this.next++];
      const inLane = Math.abs(this.lanePos - it.lane) < 0.55;
      if (it.kind === 'pulse') {
        this.pulses++;
        if (inLane) {
          this.collected++;
          this.flow++;
          this.bestFlow = Math.max(this.bestFlow, this.flow);
          this.score += Math.round(100 * multiplier(this.flow) * (surge ? 2 : 1));
          it.hit = true;
          this.events.push({ kind: 'collect', item: it });
        } else {
          this.flow = 0;
          this.events.push({ kind: 'miss', item: it });
        }
      } else if (inLane) {
        this.shardsHit++;
        this.flow = 0;
        this.score = Math.max(0, this.score - 250);
        it.hit = true;
        this.events.push({ kind: 'shard', item: it });
      }
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  get accuracy() {
    return this.pulses ? this.collected / this.pulses : 0;
  }

  results() {
    return {
      score: this.score,
      accuracy: this.accuracy,
      bestFlow: this.bestFlow,
      collected: this.collected,
      pulses: this.pulses,
      shardsHit: this.shardsHit,
    };
  }
}
