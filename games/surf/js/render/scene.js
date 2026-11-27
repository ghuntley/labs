// three.js view of the track, items, board and effects. Reads the
// TrackBuilder and Game; owns no game state.

import * as THREE from 'three';
import { DT, basis, laneOffset } from '../track/generate.js';

const CHUNK = 15; // track samples per mesh chunk
const HALF_WIDTH = 4.6;
const STRIPS = [
  // [centre offset, half width, kind]
  [0, HALF_WIDTH, 'floor'],
  [-HALF_WIDTH, 0.16, 'edge'],
  [HALF_WIDTH, 0.16, 'edge'],
  [-1.5, 0.05, 'lane'],
  [1.5, 0.05, 'lane'],
];

const tmpColor = new THREE.Color();
const tmpM = new THREE.Matrix4();

function hueFor(intensity, surge) {
  return surge ? 0.12 : 0.56 + 0.32 * intensity; // cyan -> violet -> magenta; gold in a surge
}

function orient(obj, b) {
  tmpM.makeBasis(
    new THREE.Vector3(...b.r),
    new THREE.Vector3(...b.u),
    new THREE.Vector3(-b.f[0], -b.f[1], -b.f[2]),
  );
  obj.quaternion.setFromRotationMatrix(tmpM);
}

export class View {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05040c);
    this.scene.fog = new THREE.Fog(0x05040c, 60, 280);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1200);
    this.chunks = new Map();
    this.trackMat = new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._makeStars();
    this._makeBoard();
    this._makeItems();
    this._makeRings();
    this._makeParticles();
    this.camPos = null;
    this.shake = 0;
    this.lastT = null;
    this.resize();
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the track readable on tall phone screens.
    this.camera.fov = w / h < 0.8 ? 88 : 70;
    this.camera.updateProjectionMatrix();
  }

  setTrack(builder) {
    for (const m of this.chunks.values()) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.chunks.clear();
    this.b = builder;
    this.camPos = null;
    this.lastT = null;
  }

  // --- construction -------------------------------------------------------

  _makeStars() {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 500 + Math.random() * 300;
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
      tmpColor.setHSL(0.55 + Math.random() * 0.35, 0.6, 0.5 + Math.random() * 0.5);
      col.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, fog: false, sizeAttenuation: true }));
    this.scene.add(this.stars);
  }

  _makeBoard() {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.12, 2.6),
      new THREE.MeshBasicMaterial({ color: 0x0b1020 }),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(deck.geometry),
      new THREE.LineBasicMaterial({ color: 0x9ff7ff }),
    );
    const fin = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.9, 3),
      new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
    );
    fin.rotation.x = -Math.PI / 2;
    fin.position.set(0, 0.25, 0.7);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 3.2),
      new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.2;
    const thrust = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 1.8, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    thrust.rotation.x = -Math.PI / 2;
    thrust.position.set(0, 0, 2.1);
    g.add(deck, edges, fin, glow, thrust);
    this.board = g;
    this.boardThrust = thrust;
    this.boardGlow = glow;
    this.scene.add(g);
  }

  _makeItems() {
    this.pulseGeo = new THREE.IcosahedronGeometry(0.62, 0);
    this.shardGeo = new THREE.OctahedronGeometry(0.85, 0);
    this.pulseMat = new THREE.MeshBasicMaterial({ color: 0x7ffcff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.pulseCore = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.shardMat = new THREE.MeshBasicMaterial({ color: 0xff2d55 });
    this.shardEdge = new THREE.LineBasicMaterial({ color: 0xffb3c1 });
    this.pool = { pulse: [], shard: [] };
  }

  _item(kind, i) {
    const pool = this.pool[kind];
    while (pool.length <= i) {
      let m;
      if (kind === 'pulse') {
        m = new THREE.Group();
        m.add(new THREE.Mesh(this.pulseGeo, this.pulseMat));
        const core = new THREE.Mesh(this.pulseGeo, this.pulseCore);
        core.scale.setScalar(0.45);
        m.add(core);
      } else {
        m = new THREE.Group();
        const body = new THREE.Mesh(this.shardGeo, this.shardMat);
        body.scale.set(0.8, 1.6, 0.8);
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(this.shardGeo), this.shardEdge);
        edge.scale.copy(body.scale).multiplyScalar(1.02);
        m.add(body, edge);
      }
      this.scene.add(m);
      pool.push(m);
    }
    return pool[i];
  }

  _makeRings() {
    this.ringGeo = new THREE.TorusGeometry(8.5, 0.07, 6, 48);
    this.rings = [];
  }

  _ring(i) {
    while (this.rings.length <= i) {
      const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(m);
      this.rings.push(m);
    }
    return this.rings[i];
  }

  _makeParticles() {
    const n = 600;
    this.pN = n;
    this.pPos = new Float32Array(n * 3);
    this.pCol = new Float32Array(n * 3);
    this.pVel = new Float32Array(n * 3);
    this.pLife = new Float32Array(n);
    this.pBase = new Float32Array(n * 3);
    this.pNext = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.particles = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.45, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  burst(pos, color, count = 24, speed = 9) {
    tmpColor.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.pNext;
      this.pNext = (this.pNext + 1) % this.pN;
      this.pPos.set(pos, i * 3);
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.6);
      this.pVel.set([v * s * Math.cos(th), v * u, v * s * Math.sin(th)], i * 3);
      this.pBase.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
      this.pLife[i] = 1;
    }
  }

  // --- per frame -----------------------------------------------------------

  _buildChunk(k) {
    const b = this.b;
    const i0 = k * CHUNK, i1 = i0 + CHUNK;
    const nS = i1 - i0 + 1;
    const vPer = STRIPS.length * 2;
    const pos = new Float32Array(nS * vPer * 3);
    const col = new Float32Array(nS * vPer * 3);
    const idx = [];
    for (let s = 0; s < nS; s++) {
      const i = i0 + s;
      const fr = { yaw: b.yaw[i], pitch: b.pitch[i], roll: b.roll[i] };
      const { r, u } = basis(fr);
      const surge = b.surge[i] === 1;
      const I = b.inten[i];
      const h = hueFor(I, surge);
      STRIPS.forEach(([c, hw, kind], j) => {
        const lift = kind === 'floor' ? 0 : 0.03;
        for (let e = 0; e < 2; e++) {
          const off = c + (e ? hw : -hw);
          const v = (s * vPer + j * 2 + e) * 3;
          pos[v] = b.x[i] + r[0] * off + u[0] * lift;
          pos[v + 1] = b.y[i] + r[1] * off + u[1] * lift;
          pos[v + 2] = b.z[i] + r[2] * off + u[2] * lift;
          if (kind === 'floor') tmpColor.setHSL(h, 0.9, surge ? 0.11 : 0.05 + 0.05 * I);
          else if (kind === 'edge') tmpColor.setHSL(h, 1, 0.5 + 0.2 * I);
          else tmpColor.setHSL(h, 0.8, 0.3 + 0.2 * I);
          col[v] = tmpColor.r; col[v + 1] = tmpColor.g; col[v + 2] = tmpColor.b;
        }
        if (s < nS - 1) {
          const a = s * vPer + j * 2, c2 = a + vPer;
          idx.push(a, a + 1, c2, a + 1, c2 + 1, c2);
        }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.trackMat);
    this.scene.add(m);
    return m;
  }

  render(t, game, ahead) {
    const b = this.b;
    if (!b) return;
    const dt = this.lastT == null ? 1 / 60 : Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;

    // Track chunks in view.
    const idxOf = (tt) => Math.floor((tt - b.t0) / DT);
    const kMin = Math.max(0, Math.floor(idxOf(t - 1.5) / CHUNK));
    const kMax = Math.floor(Math.min(b.count - 1, idxOf(t + ahead)) / CHUNK);
    for (const [k, m] of this.chunks) {
      if (k < kMin || k > kMax) {
        this.scene.remove(m);
        m.geometry.dispose();
        this.chunks.delete(k);
      }
    }
    for (let k = kMin; k <= kMax; k++) {
      if (!this.chunks.has(k) && (k + 1) * CHUNK <= b.count - 1) this.chunks.set(k, this._buildChunk(k));
    }

    // Board.
    const fr = b.frameAt(t);
    const bs = basis(fr);
    const lo = laneOffset(game.lanePos);
    const bp = [
      fr.x + bs.r[0] * lo + bs.u[0] * 0.6,
      fr.y + bs.r[1] * lo + bs.u[1] * 0.6,
      fr.z + bs.r[2] * lo + bs.u[2] * 0.6,
    ];
    this.board.position.set(...bp);
    orient(this.board, bs);
    const lean = (game.lane - game.lanePos) * -0.35;
    this.board.rotateZ(lean);
    this.board.position.addScaledVector(new THREE.Vector3(...bs.u), Math.sin(t * 6) * 0.06);
    const surgeHue = hueFor(fr.intensity, fr.surge);
    tmpColor.setHSL(surgeHue, 1, 0.6);
    this.boardThrust.material.color.copy(tmpColor);
    this.boardGlow.material.color.copy(tmpColor);
    this.boardThrust.scale.set(1, 0.7 + fr.intensity * 1.2 + Math.random() * 0.15, 1);

    // Items in view (items are sorted by t; binary search the first one).
    const items = b.items;
    let lo2 = 0, hi2 = items.length;
    const tStart = t - 0.4;
    while (lo2 < hi2) {
      const mid = (lo2 + hi2) >> 1;
      if (items[mid].t < tStart) lo2 = mid + 1; else hi2 = mid;
    }
    const used = { pulse: 0, shard: 0 };
    const tmpFr = {};
    for (let i = lo2; i < items.length && items[i].t <= t + ahead; i++) {
      const it = items[i];
      if (it.hit) continue;
      const m = this._item(it.kind, used[it.kind]++);
      m.visible = true;
      const f2 = b.frameAt(it.t, tmpFr);
      const b2 = basis(f2);
      const off = laneOffset(it.lane);
      const lift = it.kind === 'pulse' ? 1.0 + Math.sin(it.t * 7 + t * 3) * 0.15 : 0.9;
      m.position.set(
        f2.x + b2.r[0] * off + b2.u[0] * lift,
        f2.y + b2.r[1] * off + b2.u[1] * lift,
        f2.z + b2.r[2] * off + b2.u[2] * lift,
      );
      orient(m, b2);
      m.rotateY(t * (it.kind === 'pulse' ? 2.5 : 1.2) + it.t);
      // Fade in at the horizon.
      const near = Math.min(1, (t + ahead - it.t) / 0.6);
      m.scale.setScalar(Math.max(0.05, near));
    }
    for (const kind of ['pulse', 'shard']) {
      for (let i = used[kind]; i < this.pool[kind].length; i++) this.pool[kind][i].visible = false;
    }

    // Rings every second of song time.
    let ri = 0;
    for (let rt = Math.ceil(t - 0.5); rt <= t + ahead && rt <= b.end; rt += 1) {
      const m = this._ring(ri++);
      m.visible = true;
      const f2 = b.frameAt(rt, tmpFr);
      const b2 = basis(f2);
      m.position.set(f2.x + b2.u[0] * 2, f2.y + b2.u[1] * 2, f2.z + b2.u[2] * 2);
      orient(m, b2);
      tmpColor.setHSL(hueFor(f2.intensity, f2.surge), 1, 0.35 + 0.35 * f2.intensity);
      m.material.color.copy(tmpColor);
      m.material.opacity = Math.min(1, (t + ahead - rt) / 0.8);
    }
    for (let i = ri; i < this.rings.length; i++) this.rings[i].visible = false;

    // Particles.
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt * 1.6;
      const l = Math.max(0, this.pLife[i]);
      for (let a = 0; a < 3; a++) {
        this.pPos[i * 3 + a] += this.pVel[i * 3 + a] * dt;
        this.pVel[i * 3 + a] *= 0.96;
        this.pCol[i * 3 + a] = this.pBase[i * 3 + a] * l;
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;

    // Camera: behind and above the board, looking down the track.
    const want = new THREE.Vector3(
      bp[0] - bs.f[0] * 9 + bs.u[0] * 3.6 - bs.r[0] * lo * 0.35,
      bp[1] - bs.f[1] * 9 + bs.u[1] * 3.6 - bs.r[1] * lo * 0.35,
      bp[2] - bs.f[2] * 9 + bs.u[2] * 3.6 - bs.r[2] * lo * 0.35,
    );
    if (!this.camPos) this.camPos = want.clone();
    this.camPos.lerp(want, 1 - Math.exp(-dt * 10));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    const look = b.frameAt(t + 0.6, tmpFr);
    const lb = basis(look);
    this.camera.up.set(...bs.u);
    this.camera.lookAt(look.x + lb.u[0] * 1.2, look.y + lb.u[1] * 1.2, look.z + lb.u[2] * 1.2);
    const fov0 = this.camera.aspect < 0.8 ? 88 : 70;
    const fov = fov0 + fr.intensity * 8;
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov += (fov - this.camera.fov) * 0.1;
      this.camera.updateProjectionMatrix();
    }

    // Sky follows the music.
    tmpColor.setHSL(surgeHue, 0.7, fr.surge ? 0.07 : 0.015 + 0.035 * fr.intensity);
    this.scene.background.lerp(tmpColor, 0.08);
    this.scene.fog.color.copy(this.scene.background);
    this.stars.position.copy(this.camera.position);

    this.renderer.render(this.scene, this.camera);
  }

  // World position of an item (for effects).
  itemPos(it) {
    const f = this.b.frameAt(it.t);
    const bs = basis(f);
    const off = laneOffset(it.lane);
    return [f.x + bs.r[0] * off + bs.u[0], f.y + bs.r[1] * off + bs.u[1], f.z + bs.r[2] * off + bs.u[2]];
  }
}
