// App flow: menu -> loading -> countdown -> ride -> results.
// <body data-state="..."> mirrors the current state (used by styles and tests).

import { analyse, toMono, toTrackFeatures } from './audio/offline.js';
import { parseYouTubeId, createPlayer } from './audio/youtube.js';
import { captureSupport, captureTabAudio, LiveAnalyser, LOOKAHEAD } from './audio/live.js';
import { TrackBuilder, buildFromAnalysis, buildFromTempo, DT } from './track/generate.js';
import { LiveFeeder } from './track/stream.js';
import { Game, multiplier } from './game/play.js';
import { attachInput } from './input.js';
import { hashString } from './rng.js';
import { makeDemoBuffer } from './demo.js';

const $ = (id) => document.getElementById(id);
const COUNTDOWN = 3;

let View = null; // three.js is loaded lazily so the menu appears instantly
let view = null;
let audioCtx = null;
let session = null; // the current ride; see ride()

function setState(s) {
  document.body.dataset.state = s;
}

function toast(msg, ms = 5000) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), ms);
}

function status(msg) {
  $('status-text').textContent = msg;
}

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

async function getView() {
  if (!view) {
    status('Loading graphics…');
    ({ View } = await import('./render/scene.js'));
    view = new View($('game'));
    window.addEventListener('resize', () => view.resize());
  }
  return view;
}

function outLatency(ctx) {
  return ctx.outputLatency || ctx.baseLatency || 0;
}

// --- music sources -----------------------------------------------------------

async function playBuffer(buf, title, songKey) {
  const ctx = getCtx();
  status('Analysing the song…');
  const a = await analyse(toMono(buf), buf.sampleRate, (p) => status(`Analysing the song… ${Math.round(p * 100)}%`));
  const features = toTrackFeatures(a, DT);
  const builder = buildFromAnalysis(features, a.onsets, hashString(songKey));
  await getView();

  let src = null;
  let startAt = 0;
  const start = () => {
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    startAt = ctx.currentTime + COUNTDOWN;
    src.start(startAt);
  };
  ride({
    mode: 'file',
    badge: `Beat-locked · ${Math.round(a.bpm)} BPM`,
    title,
    songKey,
    builder,
    ahead: 4,
    duration: () => a.duration,
    clock: () => ctx.currentTime - startAt - outLatency(ctx),
    start,
    pause: () => ctx.suspend(),
    resume: () => ctx.resume(),
    stop: () => { try { src && src.stop(); } catch {} },
  });
}

async function playFile(file) {
  if (!file) return;
  setState('loading');
  try {
    const ctx = getCtx();
    status('Decoding…');
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    await playBuffer(buf, file.name.replace(/\.[^.]+$/, ''), `file:${file.name}:${file.size}`);
  } catch (e) {
    console.warn(e);
    backToMenu();
    toast(`Could not play that file: ${e.message || e}`);
  }
}

async function playDemo() {
  setState('loading');
  try {
    const ctx = getCtx();
    status('Synthesising the demo…');
    await new Promise((r) => setTimeout(r, 0));
    // ?demo=<seconds> shortens the demo (quick tries, tests).
    const secs = Math.max(4, Math.min(300, Number(new URLSearchParams(location.search).get('demo')) || 64));
    await playBuffer(makeDemoBuffer(ctx, secs), 'Demo groove', `demo:v1:${secs}`);
  } catch (e) {
    console.warn(e);
    backToMenu();
    toast(`Demo failed: ${e.message || e}`);
  }
}

async function playYouTube(input) {
  const id = parseYouTubeId(input);
  if (!id) {
    toast('That does not look like a YouTube link.');
    return;
  }
  const ctx = getCtx();
  setState('loading');

  // Ask for tab audio first, while we still have the click's user activation.
  let capture = null;
  const support = captureSupport();
  if (support.ok && !$('force-tempo').checked) {
    status('Choose "This tab" and keep "Share tab audio" on…');
    try {
      capture = await captureTabAudio();
    } catch (e) {
      console.warn(e);
      toast(`${e.name === 'NotAllowedError' ? 'Tab audio was not shared' : e.message}. Using tempo mode instead.`, 7000);
    }
  } else if (!support.ok && !$('force-tempo').checked) {
    toast(`${support.why} Using tempo mode instead.`, 7000);
  }

  let player;
  try {
    status('Loading the YouTube player…');
    $('yt').hidden = false;
    player = await createPlayer($('yt-player'), id);
  } catch (e) {
    console.warn(e);
    if (capture) capture.stream.getTracks().forEach((t) => t.stop());
    backToMenu();
    toast(e.message || String(e), 8000);
    return;
  }
  await getView();
  const songKey = `yt:${id}`;

  if (capture) {
    const delayed = capture.suppressed;
    const analyser = new LiveAnalyser(ctx, capture.stream, { routeToOutput: delayed });
    const builder = new TrackBuilder(hashString(songKey));
    let t0 = null;
    let feeder = null;
    let ended = false;
    let endSongT = Infinity;
    const songT = () => (t0 == null ? -LOOKAHEAD : ctx.currentTime - t0);
    if (!delayed) toast('This browser keeps playing the tab sound directly, so blocks arrive slightly after the beat.', 8000);
    capture.stream.getAudioTracks()[0].addEventListener('ended', () => {
      if (session && !ended) toast('Tab audio sharing stopped.');
      ended = true;
      endSongT = songT();
    });
    ride({
      mode: 'live',
      badge: delayed ? 'Live · beat-locked' : 'Live',
      title: player.title(),
      songKey,
      builder,
      ahead: LOOKAHEAD - 0.15,
      duration: () => player.duration(),
      clock: () => songT() - LOOKAHEAD - (delayed ? outLatency(ctx) : 0),
      start: () => {
        player.play();
        waitForPlayback(player, () => {
          t0 = ctx.currentTime;
          feeder = new LiveFeeder(builder, t0);
        });
      },
      tick: () => {
        const r = analyser.poll();
        if (!feeder) return;
        if (!ended && player.isEnded()) {
          ended = true;
          endSongT = songT();
        }
        if (!ended) feeder.feed(r);
        else feeder.finish(endSongT);
      },
      isOver: (t) => ended && t > endSongT + 0.5,
      pause: () => { player.pause(); ctx.suspend(); },
      resume: () => { ctx.resume(); player.play(); },
      stop: () => {
        analyser.stop();
        capture.stream.getTracks().forEach((t) => t.stop());
        player.destroy();
      },
    });
    return;
  }

  // Tempo mode: no audio access, so build from the BPM and sync to the player.
  const bpm = Math.max(40, Math.min(240, Number($('bpm').value) || 120));
  const duration = player.duration() || 240;
  const builder = buildFromTempo(bpm, duration, hashString(songKey));
  let startAtMs = 0;
  let playing = false;
  ride({
    mode: 'tempo',
    badge: `Tempo · ${bpm} BPM`,
    title: player.title(),
    songKey: `${songKey}:${bpm}`,
    builder,
    ahead: 4,
    duration: () => duration,
    clock: () => (playing ? player.time() : (performance.now() - startAtMs) / 1000 - COUNTDOWN),
    start: () => {
      startAtMs = performance.now();
      setTimeout(() => {
        if (!session) return;
        player.play();
        waitForPlayback(player, () => (playing = true));
      }, COUNTDOWN * 1000);
    },
    isOver: (t) => player.isEnded() || t > duration + 1,
    pause: () => player.pause(),
    resume: () => player.play(),
    stop: () => player.destroy(),
  });
}

// Browsers may block autoplay; if the video has not started after a moment,
// show a button that starts it from a fresh click.
function waitForPlayback(player, onPlaying) {
  const started = performance.now();
  const check = () => {
    if (!session) return;
    if (player.isPlaying()) {
      $('tap-start').hidden = true;
      onPlaying();
      return;
    }
    if (performance.now() - started > 2500) $('tap-start').hidden = false;
    requestAnimationFrame(check);
  };
  $('tap-start').onclick = () => {
    player.play();
    $('tap-start').hidden = true;
  };
  check();
}

// --- the ride ------------------------------------------------------------------

function ride(opts) {
  const game = new Game(opts.builder);
  view.setTrack(opts.builder);
  view.resize();
  const detach = attachInput($('game'), {
    move: (d) => session && !session.paused && game.move(d),
    setLane: (l) => session && !session.paused && game.setLane(l),
    pause: () => togglePause(),
  });
  session = { ...opts, game, detach, paused: false, raf: 0 };
  $('song-title').textContent = opts.title;
  $('mode').textContent = opts.badge;
  $('yt').classList.toggle('corner', opts.mode !== 'file');
  $('yt').hidden = opts.mode === 'file';
  setState('countdown');
  opts.start();

  const frame = () => {
    const s = session;
    if (!s) return;
    s.raf = requestAnimationFrame(frame);
    if (s.paused) return;
    if (s.tick) s.tick();
    const t = s.clock();
    const fr = s.builder.frameAt(t);
    if (t >= 0 && document.body.dataset.state === 'countdown') setState('ride');
    if (t < 0) $('countdown').textContent = String(Math.min(COUNTDOWN, Math.ceil(-t)));
    game.update(t, fr.surge);
    for (const e of game.drainEvents()) {
      if (e.kind === 'collect') view.burst(view.itemPos(e.item), fr.surge ? 0xffd34d : 0x7ffcff, 22, 9);
      else if (e.kind === 'shard') {
        view.burst(view.itemPos(e.item), 0xff2d55, 40, 14);
        view.shake = 1.2;
        flash();
      }
    }
    updateHud(game, fr, t, s.duration());
    view.render(t, game, s.ahead);
    const over = s.isOver ? s.isOver(t) : t > s.duration() + 1;
    if (over) finish();
  };
  session.raf = requestAnimationFrame(frame);
}

let lastHud = '';
function updateHud(game, fr, t, duration) {
  const key = `${game.score}|${game.flow}|${fr.surge}`;
  if (key !== lastHud) {
    lastHud = key;
    $('score').textContent = game.score.toLocaleString();
    $('flow').textContent = String(game.flow);
    $('mult').textContent = `×${(multiplier(game.flow) * (fr.surge ? 2 : 1)).toFixed(2).replace(/\.?0+$/, '')}`;
    $('surge').hidden = !fr.surge;
  }
  $('progress-bar').style.width = `${duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0}%`;
}

function flash() {
  const el = $('flash');
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

function togglePause(force) {
  const s = session;
  if (!s) return;
  const st = document.body.dataset.state;
  if (st !== 'ride' && st !== 'countdown' && st !== 'paused') return;
  const pause = force ?? !s.paused;
  if (pause === s.paused) return;
  s.paused = pause;
  if (pause) {
    s.stateBeforePause = st;
    s.pause();
    setState('paused');
  } else {
    s.resume();
    setState(s.stateBeforePause || 'ride');
  }
}

function endSession() {
  const s = session;
  if (!s) return;
  session = null;
  cancelAnimationFrame(s.raf);
  s.detach();
  try { s.stop(); } catch (e) { console.warn(e); }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  $('tap-start').hidden = true;
  $('yt').hidden = true;
  $('yt').classList.remove('corner');
}

function finish() {
  const s = session;
  const r = s.game.results();
  endSession();
  const key = `surf:best:${s.songKey}`;
  let best = 0;
  try { best = Number(localStorage.getItem(key)) || 0; } catch {}
  const isBest = r.score > best;
  if (isBest) {
    try { localStorage.setItem(key, String(r.score)); } catch {}
  }
  $('r-title').textContent = s.title;
  $('r-score').textContent = r.score.toLocaleString();
  $('r-acc').textContent = `${Math.round(r.accuracy * 100)}%`;
  $('r-pulses').textContent = `${r.collected} / ${r.pulses}`;
  $('r-flow').textContent = String(r.bestFlow);
  $('r-shards').textContent = String(r.shardsHit);
  $('r-best').textContent = isBest ? 'New best!' : `Best: ${best.toLocaleString()}`;
  setState('results');
}

function backToMenu() {
  endSession();
  setState('menu');
}

// --- menu wiring -------------------------------------------------------------------

function initMenu() {
  const file = $('file');
  file.addEventListener('change', () => playFile(file.files[0]));
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) playFile(f);
  });
  $('demo').addEventListener('click', () => playDemo());
  $('yt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    playYouTube($('yt-url').value);
  });

  // Tap tempo: average the last few intervals.
  let taps = [];
  $('tap').addEventListener('click', () => {
    const now = performance.now();
    taps = taps.filter((t) => now - t < 3000);
    taps.push(now);
    if (taps.length >= 3) {
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      $('bpm').value = String(Math.round(60000 / iv));
    }
  });

  const support = captureSupport();
  $('capture-note').textContent = support.ok
    ? support.suppress
      ? 'You will be asked to share this tab’s audio so the track can follow the song exactly.'
      : 'You will be asked to share this tab’s audio. In this browser blocks follow the music but arrive slightly after the beat; Chrome or Edge gives exact timing.'
    : `${support.why} YouTube songs will use tempo mode (set the BPM below).`;

  $('resume').addEventListener('click', () => togglePause(false));
  $('quit').addEventListener('click', () => backToMenu());
  $('pause-btn').addEventListener('click', () => togglePause(true));
  $('again').addEventListener('click', () => setState('menu'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) togglePause(true);
  });
  setState('menu');
}

initMenu();
