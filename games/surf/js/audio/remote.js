// The game-tab side of the "surf · music" window (player.html / player.js).

const FEATURES = 'popup,width=480,height=380';

// Must be called synchronously inside a click handler (popup blocker).
// Returns null if the popup was blocked.
export function openRemotePlayer(videoId) {
  const session = Math.random().toString(36).slice(2, 10);
  const win = window.open(`player.html#${videoId}:${session}`, 'surf-music', FEATURES);
  if (!win) return null;
  return new RemotePlayer(win, session);
}

class RemotePlayer {
  constructor(win, session) {
    this.win = win;
    this.session = session;
    this.ch = new BroadcastChannel('surf-player');
    this.st = { playing: false, ended: false, time: 0, duration: 0 };
    this.info = { title: 'YouTube', duration: 0 };
    this.closed = false;
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The music window did not load. Is it still open?')), 25000);
      this.ch.onmessage = ({ data }) => {
        if (!data || data.session !== session) return;
        switch (data.type) {
          case 'ready':
            clearTimeout(timer);
            this.info = { title: data.title, duration: data.duration };
            resolve(this.info);
            break;
          case 'error':
            clearTimeout(timer);
            reject(new Error(data.message));
            break;
          case 'state':
            this.st = data;
            break;
          case 'closed':
            this.closed = true;
            break;
        }
      };
    });
  }

  send(type) {
    this.ch.postMessage({ type, session: this.session });
  }
  play() { this.send('play'); }
  pause() { this.send('pause'); }
  isPlaying() { return this.st.playing; }
  isEnded() { return this.st.ended || this.closed || this.win.closed; }
  duration() { return this.st.duration || this.info.duration; }
  title() { return this.info.title; }
  focus() { try { this.win.focus(); } catch {} }
  destroy() {
    this.send('close');
    try { this.win.close(); } catch {}
    this.ch.close();
  }
}
