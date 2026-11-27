// YouTube: URL parsing (pure) and a thin wrapper over the official IFrame
// Player API. The game never touches YouTube's media directly; audio for
// analysis comes only from capturing this tab (see live.js).

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Returns the 11-character video id, or null.
// Accepts: youtube.com/watch?v=, m./music./www. variants, youtu.be/<id>,
// /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>, or a bare id.
export function parseYouTubeId(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

let apiPromise = null;
function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => reject(new Error('Could not load the YouTube player'));
    document.head.appendChild(tag);
  });
  return apiPromise;
}

// Creates a player inside `container` (an element) and resolves once it is
// ready. Returns { play, pause, stop, time, duration, title, isPlaying, isEnded, destroy }.
export async function createPlayer(container, videoId) {
  const YT = await loadApi();
  const host = document.createElement('div');
  container.replaceChildren(host);
  let state = -1;
  let errorCode = null;
  const player = await new Promise((resolve, reject) => {
    const p = new YT.Player(host, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => resolve(p),
        onStateChange: (e) => (state = e.data),
        onError: (e) => {
          errorCode = e.data;
          reject(new Error(youTubeError(e.data)));
        },
      },
    });
  });

  // getCurrentTime() only updates every ~250ms in some browsers; smooth it
  // with performance.now() between updates so motion stays fluid.
  let lastRaw = -1;
  let lastAt = 0;
  const time = () => {
    const raw = player.getCurrentTime() || 0;
    const now = performance.now();
    if (raw !== lastRaw) {
      lastRaw = raw;
      lastAt = now;
      return raw;
    }
    return state === YT.PlayerState.PLAYING ? raw + (now - lastAt) / 1000 : raw;
  };

  return {
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    stop: () => player.stopVideo(),
    time,
    duration: () => player.getDuration() || 0,
    title: () => (player.getVideoData && player.getVideoData().title) || videoId,
    isPlaying: () => state === YT.PlayerState.PLAYING,
    isEnded: () => state === YT.PlayerState.ENDED,
    error: () => (errorCode == null ? null : youTubeError(errorCode)),
    destroy: () => player.destroy(),
  };
}

function youTubeError(code) {
  switch (code) {
    case 2: return 'That does not look like a valid YouTube video.';
    case 5: return 'This video cannot be played in an embedded player.';
    case 100: return 'Video not found (removed or private).';
    case 101:
    case 150: return 'The owner does not allow this video to be embedded. Try another link.';
    default: return `YouTube player error ${code}.`;
  }
}
