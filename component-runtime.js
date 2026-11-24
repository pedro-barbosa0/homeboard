/* Homeboard component runtime. Runs inside component.html, a sandboxed page: it puts a component's HTML, CSS and
   scripts on the page and gives it `window.homeboard`, the only bridge to the board. Full reference:
   docs/COMPONENTS.md.

     homeboard.time            the current time (a Date); homeboard.on('time', fn) every second, on the second
     homeboard.theme           the board's colours and look { accent, text, muted, surface, raise, bg, border, radius,
                               font, scheme }; also as CSS variables (--accent, --text, ...); on('theme', fn)
     homeboard.music           what plays in YouTube Music { title, artist, album, art, playing, time, duration,
                               volume, colors: { vivid, dark, light } } or null; on('music', fn)
     homeboard.levels          the sound right now: 96 bands, 0..255, bass first (a Uint8Array) or null when quiet;
                               on('levels', fn) about 30 times a second while something plays
     homeboard.size            { w, h } of the card; on('size', fn)
     homeboard.settings        this card's own saved settings; homeboard.save({ ... }) keeps them (merged)
     homeboard.open(url)       opens an http(s) address in a new tab
     homeboard.control(action) play / pause / next / previous for YouTube Music ('toggle', 'next', 'previous')
*/
(() => {
  'use strict';
  const listeners = Object.create(null);
  const send = msg => { try { parent.postMessage(Object.assign({ hb: '' }, msg), '*'); } catch { /* no board */ } };
  const wants = new Set();
  const hb = window.homeboard = {
    time: new Date(), theme: {}, music: null, levels: null, size: { w: innerWidth, h: innerHeight }, settings: {},
    on(kind, fn) {
      if (typeof fn !== 'function') return () => {};
      (listeners[kind] ||= []).push(fn);
      if ((kind === 'levels' || kind === 'music') && !wants.has(kind)) { wants.add(kind); send({ hb: 'want', what: kind }); }
      if (kind === 'time') { try { fn(hb.time); } catch (e) { fail(e); } }
      return () => { listeners[kind] = (listeners[kind] || []).filter(f => f !== fn); };
    },
    save(settings) {
      if (!settings || typeof settings !== 'object') return;
      hb.settings = Object.assign({}, hb.settings, settings);
      send({ hb: 'save', settings: hb.settings });
    },
    open(url) { send({ hb: 'open', url: String(url || '') }); },
    control(action) { send({ hb: 'control', action: String(action || '') }); },
  };
  const emit = (kind, value) => { for (const fn of listeners[kind] || []) { try { fn(value); } catch (e) { fail(e); } } };

  /* errors are shown on the card (and sent to the editor), never thrown away */
  function fail(e) {
    const box = document.getElementById('hb-error');
    const text = (e && (e.stack || e.message)) || String(e);
    if (box) { box.textContent = text.split('\n').slice(0, 6).join('\n'); box.style.display = 'block'; }
    send({ hb: 'error', message: String(e && e.message || e).slice(0, 500) });
  }
  addEventListener('error', e => fail(e.error || e.message));
  addEventListener('unhandledrejection', e => fail(e.reason));

  function applyTheme(t) {
    hb.theme = t || {};
    const r = document.documentElement.style;
    for (const [k, v] of Object.entries(hb.theme)) if (typeof v === 'string' && k !== 'scheme') r.setProperty('--' + k, v);
    if (hb.theme.scheme) r.colorScheme = hb.theme.scheme;
  }

  /* the component: an HTML document or fragment. Styles go to <head>, the rest to <body>, then its scripts run in
     order (each as a new <script>, so they really run) */
  let rendered = false;
  function render(code) {
    if (rendered) return;                              // one component per page: new code comes with a fresh page
    rendered = true;
    const doc = new DOMParser().parseFromString(String(code || ''), 'text/html');
    for (const n of [...doc.head.children]) if (n.tagName === 'STYLE' || (n.tagName === 'LINK' && /stylesheet/i.test(n.rel))) document.head.append(document.importNode(n, true));
    const scripts = [];
    for (const n of [...doc.body.childNodes]) {
      if (n.nodeType === 1 && n.tagName === 'SCRIPT') { scripts.push(n); continue; }
      if (n.nodeType === 1) for (const s of n.querySelectorAll('script')) { scripts.push(s); s.remove(); }
      document.body.append(document.importNode(n, true));
    }
    for (const n of doc.head.querySelectorAll('script')) scripts.unshift(n);
    for (const old of scripts) {
      const s = document.createElement('script');
      if (old.type) s.type = old.type;
      if (old.src) s.src = old.src; else s.textContent = old.textContent;
      document.body.append(s);
    }
    send({ hb: 'rendered' });
  }

  addEventListener('message', e => {
    if (e.source !== parent) return;
    const m = e.data || {};
    if (m.hb === 'init') { applyTheme(m.theme); hb.settings = m.settings || {}; hb.music = m.music || null; render(m.code); }
    else if (m.hb === 'theme') { applyTheme(m.theme); emit('theme', hb.theme); }
    else if (m.hb === 'music') { hb.music = m.music || null; emit('music', hb.music); }
    else if (m.hb === 'levels') { hb.levels = m.levels ? Uint8Array.from(m.levels) : null; emit('levels', hb.levels); }
    else if (m.hb === 'settings') { hb.settings = m.settings || {}; emit('settings', hb.settings); }
    else if (m.hb === 'click' && isFinite(m.x) && isFinite(m.y)) {   // the first click on the card, passed on by the board
      const t = document.elementFromPoint(m.x, m.y) || document.body, o = { bubbles: true, cancelable: true, composed: true, clientX: m.x, clientY: m.y, view: window, button: 0 };
      t.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerId: 1, isPrimary: true, buttons: 1 }));
      t.dispatchEvent(new MouseEvent('mousedown', { ...o, buttons: 1 }));
      t.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerId: 1, isPrimary: true }));
      t.dispatchEvent(new MouseEvent('mouseup', o));
      t.dispatchEvent(new MouseEvent('click', o));
      if (typeof t.focus === 'function') t.focus({ preventScroll: true });
    }
  });
  function tick() { hb.time = new Date(); emit('time', hb.time); setTimeout(tick, 1000 - (Date.now() % 1000) + 5); }
  setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  addEventListener('resize', () => { hb.size = { w: innerWidth, h: innerHeight }; emit('size', hb.size); });
  send({ hb: 'ready' });
})();
