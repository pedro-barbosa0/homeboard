/* Runs in every frame, and acts only inside a Homeboard website window (a frame named "hb:<card>",
   placed directly in a Homeboard page). It tells the board:
   - that the site loaded, or went to a sign-in page that only works in a real window;
   - Ctrl + scroll / pinch / Ctrl + plus, minus, 0 inside the site, so the board zooms the window (not the whole tab);
   - where you are on the site (its address and how far down), so the window comes back there next time.
   It also hides the site's scroll bars when the window asks. It reads nothing else from the site, and sends
   only to Homeboard itself. */
(() => {
if (window === window.top) return;
const m = /^hb:([\w-]+)(:noscroll)?$/.exec(window.name || '');
if (!m) return;
const api = globalThis.browser ?? globalThis.chrome;
const own = api.runtime.getURL('').replace(/\/$/, '');
if (!location.ancestorOrigins || location.ancestorOrigins[0] !== own) return;

if (m[2]) {
  const root = document.documentElement;
  const on = () => { if (!root.classList.contains('hb-noscroll')) root.classList.add('hb-noscroll'); };
  on();
  new MutationObserver(on).observe(root, { attributes: true, attributeFilter: ['class'] });   // sites that rewrite <html class>
}

const send = (kind, extra) => {
  try { return api.runtime.sendMessage({ homeboard: 'frame', card: m[1], kind, url: location.href, title: document.title, ...extra }).catch(() => null); }
  catch { return Promise.resolve(null); }               // Homeboard was reloaded
};

/* ---- zoom: the board scales the window, like Edge's own zoom does for a tab ---- */
addEventListener('wheel', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();                                   // not the browser's zoom of the whole board
  const by = -e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
  send('zoom', { by, mouse: e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50) });
}, { passive: false, capture: true });
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || !['+', '=', '-', '_', '0'].includes(e.key)) return;
  e.preventDefault();
  send('zoom', { key: e.key === '=' ? '+' : e.key === '_' ? '-' : e.key });
}, true);

/* ---- where you are: the address, and how far the page (or its main scrolling part) is scrolled ---- */
const pathOf = el => {                                  // the element as child positions from <body>
  const parts = [];
  for (let n = el; n && n !== document.body && parts.length < 40; n = n.parentElement) {
    if (!n.parentElement) return null;
    parts.unshift([...n.parentElement.children].indexOf(n));
  }
  return parts.join('.');
};
const byPath = p => { let n = document.body; for (const i of p.split('.')) { n = n && n.children[+i]; } return n || null; };
const page = () => document.scrollingElement || document.documentElement;
let timer = 0, lastUrl = location.href, touched = false;
document.addEventListener('scroll', e => {
  const t = e.target === document ? page() : e.target;
  if (!(t instanceof Element)) return;
  const main = t === page();
  if (!main && t.clientWidth * t.clientHeight < innerWidth * innerHeight * .3) return;   // a small box inside the page: not "where I am"
  clearTimeout(timer);
  timer = setTimeout(() => send('where', { path: main ? '' : pathOf(t), x: Math.round(t.scrollLeft), y: Math.round(t.scrollTop) }), 600);
}, { capture: true, passive: true });
setInterval(() => {                                     // pages that change address without loading (mail, music, maps)
  if (location.href !== lastUrl) { lastUrl = location.href; send('where', { path: '', x: 0, y: 0 }); }
}, 1000);
for (const ev of ['wheel', 'keydown', 'pointerdown', 'touchstart']) addEventListener(ev, () => { touched = true; }, { capture: true, passive: true });

/* coming back: scroll to where you were, waiting for slow pages to grow, and never against your own scrolling */
function restore(at) {
  const start = Date.now();
  const tick = () => {
    if (touched || Date.now() - start > 9000) return;
    const el = at.path ? byPath(at.path) : page();
    if (el && el.scrollHeight - el.clientHeight >= at.y - 2 && el.scrollWidth - el.clientWidth >= at.x - 2) {
      el.scrollTo(at.x, at.y);
      if (Math.abs(el.scrollTop - at.y) < 3) return;
    }
    setTimeout(tick, 250);
  };
  tick();
}

/* sign-in pages that refuse to work inside another page, whatever we do */
const SIGNIN = /^(accounts\.google\.com|login\.live\.com|login\.microsoftonline\.com|appleid\.apple\.com|account\.apple\.com)$/i;
const hello = () => send(SIGNIN.test(location.hostname) ? 'signin' : 'ok').then(r => { if (r && r.restore) restore(r.restore); });
setInterval(() => send('alive'), 4000);

/* ---- what plays here, for "Now playing" on the board (which can also pause and play it) ---- */
const medias = () => [...document.querySelectorAll('video, audio')];
function nowState() {
  const list = medias().filter(x => x.readyState > 0 || x.currentTime > 0);
  const on = list.find(x => !x.paused && !x.ended && !x.muted && x.volume > 0);
  const any = on || list.find(x => x.currentTime > 0 && !x.muted);
  if (!any) return null;
  const md = navigator.mediaSession && navigator.mediaSession.metadata;
  const art = md && md.artwork && md.artwork.length ? md.artwork[md.artwork.length - 1].src : '';
  return { playing: !!on, title: (md && md.title) || document.title, artist: (md && md.artist) || '', art: /^https?:/i.test(art) ? art : '', video: any.tagName === 'VIDEO' };
}
let told = '';
const tellMedia = () => { const st = nowState(), k = JSON.stringify(st); if (k !== told) { told = k; send('media', { media: st }); } };
for (const ev of ['play', 'playing', 'pause', 'ended', 'emptied', 'volumechange', 'loadedmetadata']) document.addEventListener(ev, () => setTimeout(tellMedia, 60), true);
setInterval(tellMedia, 2500);                            // the next song changes only the title
api.runtime.onMessage.addListener(msg => {
  if (!msg || msg.homeboard !== 'media-cmd' || msg.card !== m[1]) return;
  const list = medias();
  if (msg.action === 'pause' || (msg.action === 'toggle' && list.some(x => !x.paused))) list.forEach(x => x.pause());
  else { const x = list.find(y => y.currentTime > 0) || list[0]; if (x) x.play().catch(() => {}); }
  setTimeout(tellMedia, 200);
});                // the board reloads a window that goes silent (a crashed page)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hello, { once: true });
else hello();
})();
