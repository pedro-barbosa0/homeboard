/* Runs in every frame, and acts only inside a Homeboard website window (a frame named "hb:<card>",
   placed directly in a Homeboard page). It tells the board the site loaded, or that the site went to a
   sign-in page that only works in a real window; and hides the site's scroll bars when the window asks.
   It reads nothing from the site and sends only the address and title to Homeboard itself. */
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

/* sign-in pages that refuse to work inside another page, whatever we do */
const SIGNIN = /^(accounts\.google\.com|login\.live\.com|login\.microsoftonline\.com|appleid\.apple\.com|account\.apple\.com)$/i;
const say = kind => {
  try { api.runtime.sendMessage({ homeboard: 'frame', card: m[1], kind, url: location.href, title: document.title }).catch(() => {}); }
  catch { /* Homeboard was reloaded */ }
};
const kind = () => (SIGNIN.test(location.hostname) ? 'signin' : 'ok');
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => say(kind()), { once: true });
else say(kind());
})();
