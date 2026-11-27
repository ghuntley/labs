// Runs in the "surf · music" window (player.html#<videoId>:<session>).
// Hosts the official YouTube player and is remote-controlled by the game
// tab over a BroadcastChannel. The game captures THIS tab's audio, so the
// game tab itself is never captured (no feedback, nothing muted there).

import { createPlayer, parseYouTubeId } from './audio/youtube.js';

const [rawId, session] = location.hash.slice(1).split(':');
const id = parseYouTubeId(rawId || '');
const ch = new BroadcastChannel('surf-player');
const send = (msg) => ch.postMessage({ ...msg, session });

async function main() {
  if (!id || !session) {
    document.getElementById('msg').textContent = 'Nothing to play. Start a song from the surf game.';
    return;
  }
  let p;
  try {
    p = await createPlayer(document.getElementById('player'), id);
  } catch (e) {
    send({ type: 'error', message: e.message || String(e) });
    return;
  }
  send({ type: 'ready', title: p.title(), duration: p.duration() });

  ch.onmessage = ({ data }) => {
    if (!data || data.session !== session) return;
    if (data.type === 'play') p.play();
    else if (data.type === 'pause') p.pause();
    else if (data.type === 'close') {
      p.stop();
      window.close();
    }
  };

  setInterval(() => {
    send({ type: 'state', playing: p.isPlaying(), ended: p.isEnded(), time: p.time(), duration: p.duration() });
  }, 100);
}

window.addEventListener('pagehide', () => send({ type: 'closed' }));
main();
