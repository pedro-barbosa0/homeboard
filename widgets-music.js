/* YouTube Music on the board: what is playing (artwork, title, artist, progress) and the controls
   (previous, play/pause, next, seek, volume, like). It drives YouTube Music wherever it is open in
   Edge — a normal or pinned tab, or a website window on a board — through ytm.js, which Homeboard
   runs inside YouTube Music pages. Only works in the installed extension. */
(() => {
'use strict';

const REG = window.HomeboardWidgets = window.HomeboardWidgets || {};
const api = globalThis.browser ?? globalThis.chrome;
const YTM = 'https://music.youtube.com/';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  prev: svg('<path d="M7 6v12M18 6l-9 6 9 6z" fill="currentColor"/>'),
  next: svg('<path d="M17 6v12M6 6l9 6-9 6z" fill="currentColor"/>'),
  play: svg('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  pause: svg('<path d="M7 5h3.500v14H7zM13.500 5H17v14h-3.500z" fill="currentColor"/>'),
  like: svg('<path d="M7 10v10H4V10zM7 10l4-7c1.500 0 2.500 1.100 2.200 2.600L12.700 9H19a2 2 0 0 1 2 2.300l-1.200 7A2 2 0 0 1 17.800 20H7" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"/>'),
  liked: svg('<path d="M7 10v10H4V10zM7 10l4-7c1.500 0 2.500 1.100 2.200 2.600L12.700 9H19a2 2 0 0 1 2 2.300l-1.200 7A2 2 0 0 1 17.800 20H7z" fill="currentColor"/>'),
  vol: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.500 8.500a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="m17 9.500 4 5M21 9.500l-4 5" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"/>'),
  note: svg('<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.600"/><circle cx="7" cy="18" r="2.500" fill="currentColor"/><circle cx="17" cy="16" r="2.500" fill="currentColor"/>'),
};
const LOOKS = { glass: 'Glass panel', liquid: 'Liquid glass', art: 'Artwork behind', ambient: 'Ambient (big cover glow)', vinyl: 'Vinyl record', frame: 'Framed cover', pill: 'Compact pill', minimal: 'No panel' };

/* ---- the music hub: what YouTube Music plays, for every widget and for the board's colours ----
   Listens to ytm.js (in any tab or website window) like the widget does, and offers:
   subscribe(fn) -> fn(state or null) whenever the song, cover or play state changes; palette(url) -> colours of a cover. */
const hub = window.HomeboardMusic = window.HomeboardMusic || (() => {
  /* One listener and one copy of every YouTube Music player for the whole page. Widgets, frames, Now playing and the
     visuals all read from here. The players say when something changes; the hub works out the time in between. */
  const players = new Map(), subs = new Set(), watchers = new Set();
  let started = false, last = null;
  const ALIVE = 25000;                                 // a player that has not been heard from for this long is gone
  const alive = () => [...players.entries()].filter(([, p]) => Date.now() - p.seen < ALIVE && p.state && p.state.title);
  const current = () => { const list = alive(); return (list.filter(([, p]) => p.state.playing).sort((a, b) => b[1].seen - a[1].seen)[0] || list.sort((a, b) => b[1].seen - a[1].seen)[0] || [])[1] || null; };
  const state = () => current()?.state || null;
  function emit() {
    for (const f of watchers) { try { f(); } catch { /* that widget is gone */ } }   // widgets: any change at all
    const st = state(), key = st ? [st.title, st.artist, st.art, st.playing].join('|') : '';
    if (key === last) return;
    last = key;
    for (const f of subs) { try { f(st); } catch { /* that widget is gone */ } }        // frames and the rest: the song
  }
  function heard(key, tabId, frameId, st) { players.set(key, { tabId, frameId, state: st, seen: Date.now() }); emit(); }
  async function find() {
    if (!api?.tabs?.query) return;
    let tabs = [];
    try { tabs = await api.tabs.query({ url: YTM + '*' }); } catch { return; }
    for (const t of tabs) {
      try { const st = await api.tabs.sendMessage(t.id, { homeboard: 'ytm-get' }, { frameId: 0 }); if (st) players.set(t.id + ':0', { tabId: t.id, frameId: 0, state: st, seen: Date.now() }); }
      catch {                                          // a tab opened before Homeboard: give it the helper script (it then reports itself)
        try { await api.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['ytm.js'] }); } catch { /* not allowed on that page */ }
      }
    }
    emit();
  }
  function start() {
    if (started || !api?.runtime?.onMessage) return;
    started = true;
    api.runtime.onMessage.addListener((msg, sender) => {
      if (!msg || msg.homeboard !== 'ytm' || !sender.tab) return;
      heard(sender.tab.id + ':' + (sender.frameId || 0), sender.tab.id, sender.frameId || 0, msg.state);
    });
    find();
    setInterval(() => {                                // players report themselves (and every 10 s anyway); one quiet for long is asked once
      if (document.hidden) return;
      for (const [key, p] of players) {
        if (Date.now() - p.seen < 15000) continue;
        api.tabs.sendMessage(p.tabId, { homeboard: 'ytm-get' }, { frameId: p.frameId }).then(st => { if (st) { p.state = st; p.seen = Date.now(); emit(); } }, () => { players.delete(key); emit(); });
      }
      if (!players.size) find();
    }, 8000);
  }
  async function send(action, value, key) {           // to the player on top, or to one player (key "tab:frame")
    const p = key ? players.get(key) : current();
    if (!p) return;
    try { const st = await api.tabs.sendMessage(p.tabId, { homeboard: 'ytm-do', action, value }, { frameId: p.frameId }); if (st) { p.state = st; p.seen = Date.now(); emit(); } }
    catch { for (const [k, q] of players) if (q === p) players.delete(k); emit(); }   // that tab closed
  }
  /* one clock for every progress bar on the page (4 times a second, nothing while the page is hidden) */
  const clocks = new Set(); let clockTimer = 0;
  function runClock() {
    if (document.hidden) return;
    for (const f of clocks) { try { if (f() === false) clocks.delete(f); } catch { clocks.delete(f); } }
    if (!clocks.size) { clearInterval(clockTimer); clockTimer = 0; }
  }
  function onClock(fn) { clocks.add(fn); if (!clockTimer) clockTimer = setInterval(runClock, 250); return () => clocks.delete(fn); }
  /* one animation loop for everything that draws every frame (the live Wave bars) */
  const frames = new Set(); let raf = 0;
  function runFrames(now) {
    raf = 0;
    for (const f of frames) { try { if (f(now) === false) frames.delete(f); } catch { frames.delete(f); } }
    if (frames.size) raf = requestAnimationFrame(runFrames);
  }
  function onFrame(fn) { frames.add(fn); if (!raf) raf = requestAnimationFrame(runFrames); return () => frames.delete(fn); }
  function watch(fn) { start(); watchers.add(fn); return () => watchers.delete(fn); }
  /* the cover, bigger (YouTube Music hands small ones to the page) */
  const big = (url, px = 1200) => String(url || '').replace(/=w\d+-h\d+[^/]*$/, `=w${px}-h${px}-l90-rj`).replace(/\/(?:mq|hq|sd)default\.jpg/, '/maxresdefault.jpg');   // px: 600 is plenty for a blurred backdrop
  /* the colours of a cover: one vivid, one dark, one light (the extension may read any picture's pixels) */
  const colours = new Map();
  async function palette(url) {
    if (!url) return null;
    if (colours.has(url)) return colours.get(url);
    const job = (async () => {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data;
      let best = null, bestScore = -1, sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) {
        const [r, gg, b] = [d[i], d[i + 1], d[i + 2]], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0, val = mx / 255;
        sum[0] += r; sum[1] += gg; sum[2] += b;
        const score = sat * (val > .25 ? 1 : val * 3) * (val < .97 ? 1 : .5);
        if (score > bestScore) { bestScore = score; best = [r, gg, b]; }
      }
      const n = d.length / 4, avg = sum.map(v => Math.round(v / n));
      const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
      const vivid = bestScore > .25 ? best : avg;
      const lift = vivid.map(v => v + (255 - v) * .25);   // a little lighter, so it reads on dark boards
      return { vivid: hex(lift), dark: hex(avg.map(v => v * .35)), light: hex(avg.map(v => v + (255 - v) * .8)), average: hex(avg) };
    })().catch(() => null);
    colours.set(url, job);
    if (colours.size > 60) colours.delete(colours.keys().next().value);
    return job;
  }
  const heardAt = () => current()?.seen || 0;
  return { subscribe(fn) { start(); subs.add(fn); try { fn(state()); } catch { /* ignore */ } return () => subs.delete(fn); }, state, heardAt, send, palette, big,
    players, alive, watch, onClock, onFrame, find };
})();
/* a sample song for gallery previews when nothing plays: a drawn cover (a sunset over the sea), made once */
let demoSong = null;
function demo() {
  if (demoSong) return demoSong;
  const c = document.createElement('canvas'); c.width = c.height = 240; const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 240); sky.addColorStop(0, '#3a1c71'); sky.addColorStop(.55, '#d76d77'); sky.addColorStop(1, '#ffaf7b');
  g.fillStyle = sky; g.fillRect(0, 0, 240, 240);
  g.fillStyle = '#ffe29a'; g.beginPath(); g.arc(120, 150, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a1650'; g.fillRect(0, 168, 240, 72);
  g.fillStyle = 'rgba(255,226,154,.55)'; for (let y = 176; y < 236; y += 9) g.fillRect(120 - (236 - y) * .6, y, (236 - y) * 1.2, 3);
  demoSong = { title: 'Your song', artist: 'Your artist', album: 'Preview', art: c.toDataURL('image/jpeg', .9), playing: true, time: 64, duration: 212, volume: 70, muted: false, like: '', ready: true };
  return demoSong;
}
const clock = s => (isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');


/* ---- covers that fit: YouTube video pictures come in shapes that are not square, some with black bars.
   A cover is shown as a background (always cropped to the middle), zoomed past the bars when the picture has them. ---- */
function coverFit(url) {
  const u = String(url || '');
  const bars = /i\.ytimg\.com\/.*\/(hq|sd|0)default\.jpg/i.test(u);   // 4:3 pictures of 16:9 videos: bars top and bottom
  return { url: u, zoom: bars ? 1.34 : 1 };
}
function paintCover(node, url) {                     // node gets the cover as a centred, cropped background
  const f = coverFit(url);
  if (node.dataset.src === f.url) return;
  node.dataset.src = f.url;
  node.style.backgroundImage = f.url ? `url("${f.url.replace(/"/g, '%22')}")` : '';
  node.style.backgroundSize = f.zoom === 1 ? 'cover' : `auto ${Math.round(f.zoom * 100)}%`;
  const want = hub.big(f.url);                       // a bigger one when it really exists (YouTube answers a missing one with a tiny grey picture)
  if (!f.url || want === f.url) return;
  const big = new Image(); big.referrerPolicy = 'no-referrer';
  big.onload = () => { if (node.dataset.src === f.url && big.naturalWidth > 200) { node.style.backgroundImage = `url("${want.replace(/"/g, '%22')}")`; node.style.backgroundSize = 'cover'; } };
  big.src = want;
}

/* ---- progress bars with character ---- */
const BARS = { classic: 'Classic', fuse: 'Burning fuse', cigarette: 'Cigarette', snail: 'Snail', rocket: 'Rocket', wave: 'Wave', beads: 'Beads', rainbow: 'Rainbow' };

/* ---- players: whole devices, each with its own real buttons ----
   build(box, ctx) -> { update(state), tick(time, state) }; ctx.send(action, value) drives YouTube Music. */
const PLAYERS = {
  /* a classic click-wheel player: Menu on top, back / forward on the sides, play-pause below, the middle button too;
     turning a finger around the wheel (drag, or the mouse wheel over it) changes the volume, as on the real one */
  ipod(box, ctx) {
    const body = el('div', 'pl-ipod'), screen = el('div', 'pl-ipod-screen'), head = el('div', 'pl-ipod-bar');
    const clockEl = el('span'), batt = el('i', 'pl-batt');
    head.append(el('span', null, 'Now Playing'), clockEl, batt);
    const cover = el('div', 'pl-cover'), meta = el('div', 'pl-ipod-meta'), t = el('b'), a = el('span'), al = el('span');
    meta.append(t, a, al);
    const prog = el('div', 'pl-ipod-prog'), pf = el('i'), times = el('div', 'pl-ipod-times'), e1 = el('span'), e2 = el('span');
    prog.append(pf); times.append(e1, e2);
    const volBox = el('div', 'pl-ipod-vol'), vf = el('i'); volBox.append(vf);
    screen.append(head, el('div', 'pl-ipod-main', null), prog, times, volBox);
    screen.children[1].append(cover, meta);
    const wheel = el('div', 'pl-wheel'), center = el('button', 'pl-wheel-center');
    center.type = 'button'; center.title = 'Play or pause'; center.setAttribute('aria-label', 'Play or pause');
    const label = (cls, text, title, act) => { const b = el('button', 'pl-wheel-key ' + cls); b.type = 'button'; b.innerHTML = text; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', e => { e.stopPropagation(); act(); }); return b; };
    wheel.append(
      label('k-menu', 'MENU', 'Like this song', () => ctx.send('like')),
      label('k-prev', '&#9198;&#xFE0E;', 'Previous', () => ctx.send('previous')),
      label('k-next', '&#9197;&#xFE0E;', 'Next', () => ctx.send('next')),
      label('k-play', '&#9199;&#xFE0E;', 'Play or pause', () => ctx.send('toggle')),
      center);
    center.addEventListener('click', e => { e.stopPropagation(); ctx.send('toggle'); });
    body.append(screen, wheel);
    box.append(body);
    // the wheel: going round it clockwise turns the volume up
    let lastAng = null, acc = 0, showVol = 0;
    const angle = e => { const r = wheel.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    wheel.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      e.preventDefault(); e.stopPropagation(); wheel.setPointerCapture(e.pointerId); lastAng = angle(e);
    });
    wheel.addEventListener('pointermove', e => {
      if (lastAng == null) return;
      const ang = angle(e); let d = ang - lastAng; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      lastAng = ang; acc += d;
      if (Math.abs(acc) > .26) { ctx.volume(Math.sign(acc) * 4); acc = 0; showVol = Date.now(); wheel.classList.add('turning'); }
    });
    const stop = () => { lastAng = null; wheel.classList.remove('turning'); };
    wheel.addEventListener('pointerup', stop); wheel.addEventListener('pointercancel', stop);
    wheel.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); ctx.volume(e.deltaY < 0 ? 4 : -4); showVol = Date.now(); }, { passive: false });
    return {
      update(s) {
        paintCover(cover, s.art);
        t.textContent = s.title; a.textContent = s.artist || ''; al.textContent = s.album || '';
        center.classList.toggle('playing', !!s.playing);
        vf.style.width = (s.muted ? 0 : s.volume || 0) + '%';
      },
      tick(tm, s) {
        pf.style.width = s.duration ? (tm / s.duration * 100) + '%' : '0%';
        e1.textContent = clock(tm); e2.textContent = '-' + clock(Math.max(0, (s.duration || 0) - tm));
        const now = new Date(); clockEl.textContent = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
        screen.classList.toggle('show-vol', Date.now() - showVol < 1500);
        vf.style.width = (s.muted ? 0 : s.volume || 0) + '%';
      },
    };
  },

  /* a car radio: no cover, just the words on a glowing display; knobs and preset buttons */
  radio(box, ctx) {
    const face = el('div', 'pl-radio'), knobL = el('div', 'pl-knob'), knobR = el('div', 'pl-knob');
    knobL.title = 'Volume: turn (scroll or drag up/down) · click to mute'; knobR.title = 'Tune: scroll to move in the song';
    const disp = el('div', 'pl-vfd'), band = el('span', 'pl-vfd-band', 'FM 1'), freq = el('span', 'pl-vfd-freq'), mq = el('div', 'pl-vfd-marquee'), mqIn = el('span'), clockEl = el('span', 'pl-vfd-clock');
    const level = el('div', 'pl-vfd-level'); for (let i = 0; i < 12; i++) level.append(el('i'));
    mq.append(mqIn);
    disp.append(band, freq, clockEl, mq, level);
    const presets = el('div', 'pl-presets');
    const preset = (n, title, act) => { const b = el('button', 'pl-preset'); b.type = 'button'; b.innerHTML = `<b>${n}</b><small>${title}</small>`; b.title = title; b.addEventListener('click', e => { e.stopPropagation(); act(); }); return b; };
    presets.append(preset(1, '◀◀', () => ctx.send('previous')), preset(2, '▶ ‖', () => ctx.send('toggle')), preset(3, '▶▶', () => ctx.send('next')),
      preset(4, '♥', () => ctx.send('like')), preset(5, '-10s', () => ctx.seekBy(-10)), preset(6, '+10s', () => ctx.seekBy(10)));
    face.append(knobL, el('div', 'pl-radio-mid', null), knobR);
    face.children[1].append(disp, presets);
    box.append(face);
    let rot = 0;
    const turn = (k, d) => { rot += d * 12; k.style.setProperty('--rot', rot + 'deg'); };
    knobL.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); const d = e.deltaY < 0 ? 1 : -1; turn(knobL, d); ctx.volume(d * 4); }, { passive: false });
    knobL.addEventListener('click', e => { e.stopPropagation(); ctx.send('mute'); });
    let dragY = null;
    knobL.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dragY = e.clientY; knobL.setPointerCapture(e.pointerId); });
    knobL.addEventListener('pointermove', e => { if (dragY == null) return; const d = dragY - e.clientY; if (Math.abs(d) > 8) { turn(knobL, Math.sign(d)); ctx.volume(Math.sign(d) * 3); dragY = e.clientY; } });
    knobL.addEventListener('pointerup', () => { dragY = null; });
    knobR.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); const d = e.deltaY < 0 ? 1 : -1; turn(knobR, d); ctx.seekBy(d * 5); }, { passive: false });
    let text = '';
    return {
      update(s) {
        const next = `${(s.artist || '').toUpperCase()}  —  ${(s.title || '').toUpperCase()}${s.album ? '  ·  ' + s.album.toUpperCase() : ''}`;
        if (next !== text) { text = next; mqIn.textContent = next + '        ' + next + '        '; mqIn.style.animationDuration = Math.max(8, next.length * .32) + 's'; }
        face.classList.toggle('playing', !!s.playing);
        // a made-up station frequency, the same for each song
        let h = 0; for (const ch of s.title || '') h = (h * 31 + ch.charCodeAt(0)) % 205;
        freq.textContent = (87.5 + h / 10).toFixed(1) + ' MHz';
      },
      tick(tm, s) {
        clockEl.textContent = clock(tm);
        const lv = s.playing ? Math.round(5 + Math.random() * 7) : 0;
        [...level.children].forEach((b, i) => b.classList.toggle('on', i < lv));
      },
    };
  },

  /* a pocket cassette player: the tape moves from one reel to the other as the song plays; piano keys */
  cassette(box, ctx) {
    const body = el('div', 'pl-tape'), shell = el('div', 'pl-tape-shell'), lab = el('div', 'pl-tape-label'), lt = el('b'), la = el('span');
    lab.append(lt, la);
    const win = el('div', 'pl-tape-window'), r1 = el('div', 'pl-reel'), r2 = el('div', 'pl-reel'), tape1 = el('i', 'pl-tape-pack'), tape2 = el('i', 'pl-tape-pack');
    r1.append(tape1); r2.append(tape2); win.append(r1, r2);
    shell.append(lab, win);
    const keys = el('div', 'pl-keys');
    const key = (cls, text, title, act) => { const b = el('button', 'pl-key ' + cls); b.type = 'button'; b.innerHTML = text; b.title = title; b.addEventListener('click', e => { e.stopPropagation(); b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 180); act(); }); return b; };
    const T = '&#xFE0E;';                                  // text glyphs, never emoji (emoji are wider and differ per key)
    const playKey = key('k-play', '▶' + T, 'Play or pause', () => ctx.send('toggle'));
    keys.append(key('', '◀' + T + '◀' + T, 'Previous', () => ctx.send('previous')), playKey, key('', '▶' + T + '▶' + T, 'Next', () => ctx.send('next')), key('k-stop', '■' + T, 'Pause', () => ctx.pause()));
    body.append(shell, keys);
    box.append(body);
    return {
      update(s) {
        lt.textContent = s.title; la.textContent = [s.artist, s.album].filter(Boolean).join(' · ');
        body.classList.toggle('playing', !!s.playing);
        playKey.classList.toggle('held', !!s.playing);
        hub.palette(s.art).then(p => { if (p) body.style.setProperty('--tape-label', p.light); });
      },
      tick(tm, s) {
        const k = s.duration ? Math.min(1, tm / s.duration) : 0;
        tape1.style.setProperty('--size', (92 - 52 * k) + '%');        // tape leaves the left reel...
        tape2.style.setProperty('--size', (40 + 52 * k) + '%');        // ...and gathers on the right
      },
    };
  },

  /* a disc in a portable CD player: the cover printed on the disc, round, with the hole and the shine */
  cd(box, ctx) {
    const body = el('div', 'pl-cd'), disc = el('div', 'pl-disc'), print = el('div', 'pl-disc-print'), shine = el('i', 'pl-disc-shine');
    disc.append(print, shine);
    const side = el('div', 'pl-cd-side'), lcd = el('div', 'pl-cd-lcd'), track = el('b'), timeEl = el('span');
    lcd.append(track, timeEl);
    const btns = el('div', 'pl-cd-btns');
    const b = (text, title, act) => { const n = el('button', 'pl-cd-btn'); n.type = 'button'; n.innerHTML = text; n.title = title; n.addEventListener('click', e => { e.stopPropagation(); act(); }); return n; };
    btns.append(b('⏮&#xFE0E;', 'Previous', () => ctx.send('previous')), b('⏯&#xFE0E;', 'Play or pause', () => ctx.send('toggle')), b('⏭&#xFE0E;', 'Next', () => ctx.send('next')));
    side.append(lcd, el('div', 'pl-cd-meta'), btns);
    body.append(disc, side);
    box.append(body);
    return {
      update(s) {
        paintCover(print, s.art);
        body.classList.toggle('playing', !!s.playing);
        track.textContent = s.title;
        side.children[1].textContent = [s.artist, s.album].filter(Boolean).join(' · ');
      },
      tick(tm) { timeEl.textContent = clock(tm); },
    };
  },
};
const PLAYER_NAMES = { ipod: 'Click-wheel player', radio: 'Car radio', cassette: 'Cassette player', cd: 'CD player' };

function ytmusic(host, saved, onChange) {
  const st = { look: 'glass', pick: '' };
  if (saved && typeof saved === 'object') { if (LOOKS[saved.look] || PLAYERS[saved.look]) st.look = saved.look; if (typeof saved.pick === 'string') st.pick = saved.pick; if (BARS[saved.bar]) st.bar = saved.bar; }
  st.bar = st.bar || 'classic';
  st.halo = !!(saved && saved.halo);
  const preview = !!(saved && saved.__preview);         // drawn small in a gallery (no player needed to see the look)
  const keep = () => { try { onChange({ ...st }); } catch { /* host gone */ } };

  const root = el('div', 'ytm');
  const back = el('div', 'ytm-back'), art = el('div', 'ytm-art'), img = el('img');
  img.alt = ''; img.referrerPolicy = 'no-referrer'; img.draggable = false;
  const label = el('i', 'ytm-label');                // the cover itself, cropped to fit (see coverFit)
  art.append(img, label);
  const info = el('div', 'ytm-info'), title = el('div', 'ytm-title'), who = el('div', 'ytm-who');
  const bar = el('div', 'ytm-bar'), fill = el('i'), headEl = el('b', 'ytm-head'); bar.append(fill, headEl);
  bar.title = 'Click to jump';
  const times = el('div', 'ytm-times'), t1 = el('span'), t2 = el('span'); times.append(t1, t2);
  const button = (cls, label, html) => { const b = el('button', 'ytm-btn ' + cls); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = html; return b; };
  const prev = button('prev', 'Previous', ICON.prev), play = button('play', 'Play or pause', ICON.play), next = button('next', 'Next', ICON.next);
  const like = button('like', 'Like', ICON.like), mute = button('mute', 'Sound on or off', ICON.vol);
  const vol = el('input', 'ytm-vol'); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.title = 'Volume'; vol.setAttribute('aria-label', 'Volume');
  const controls = el('div', 'ytm-controls'); controls.append(like, prev, play, next, mute, vol);
  info.append(title, who, bar, times, controls);
  const empty = el('div', 'ytm-empty');
  const skinBox = el('div', 'ytm-skin');            // a whole player (click wheel, radio, cassette, CD) when one is chosen
  const haloCv = el('canvas', 'ytm-halo');            // the music halo around the cover (drawn only while something plays)
  root.append(haloCv, back, art, info, empty, skinBox);
  let skin = null, skinLook = '';
  host.append(root);

  /* the players come from the hub ("tabId:frameId" -> { tabId, frameId, state, seen }), shared by every widget */
  const alive = () => [...hub.players.entries()].filter(([, p]) => Date.now() - p.seen < 25000);
  const atOf = () => current()?.[1].seen || 0;        // when the current state arrived (the time runs on from there)
  function current() {
    const list = alive();
    if (!list.length) return preview ? ['demo', { state: demo(), seen: Date.now() - 1000, tabId: -1, frameId: 0 }] : null;   // a gallery preview: the sample song
    const picked = list.find(([k]) => k === st.pick);
    const playing = list.filter(([, p]) => p.state.playing).sort((a, b) => b[1].seen - a[1].seen)[0];
    return (picked && (picked[1].state.playing || !playing) ? picked : playing || picked || list.sort((a, b) => b[1].seen - a[1].seen)[0]) || null;
  }

  function paint() {
    const cur = current();
    root.dataset.look = st.look;
    root.dataset.bar = st.bar;
    root.classList.toggle('skinned', !!PLAYERS[st.look]);
    root.classList.toggle('none', !cur || !cur[1].state.title);
    if (!api?.tabs) {
      empty.replaceChildren(el('span', 'ytm-note', 'YouTube Music can be controlled from the installed Homeboard.'));
      return;
    }
    if (!cur || !cur[1].state.title) {
      root.dataset.playing = '0';
      const open = el('button', 'ytm-open', cur ? 'Go to YouTube Music' : 'Open YouTube Music');
      open.type = 'button';
      open.addEventListener('click', () => (cur ? focusPlayer(cur[1]) : openPlayer()));
      empty.replaceChildren(el('span', 'ytm-icon'), el('span', 'ytm-note', cur ? 'Nothing is playing yet.' : 'YouTube Music is not open.'), open);
      empty.firstChild.innerHTML = ICON.note;
      return;
    }
    const s = cur[1].state;
    root.dataset.playing = s.playing ? '1' : '0';
    paintCover(label, s.art);
    if (PLAYERS[st.look]) {
      if (skinLook !== st.look) { skinBox.replaceChildren(); skin = PLAYERS[st.look](skinBox, ctx); skinLook = st.look; }
      skin.update(s);
    } else if (skin) { skinBox.replaceChildren(); skin = null; skinLook = ''; }
    if (img.dataset.src !== s.art) {
      img.dataset.src = s.art;
      img.src = s.art || '';
      back.style.backgroundImage = s.art ? `url("${hub.big(s.art, 600).replace(/"/g, '%22')}")` : '';
      hub.palette(s.art).then(p => { if (p) { root.style.setProperty('--ytm-tint', p.vivid); root.style.setProperty('--ytm-dark', p.dark); live.tint = ''; halo.pal = p; } });
    }
    title.textContent = s.title; title.title = s.title;
    who.textContent = [s.artist, s.album].filter(Boolean).join(' · ');
    play.innerHTML = s.playing ? ICON.pause : ICON.play;
    play.title = s.playing ? 'Pause' : 'Play';
    like.innerHTML = s.like === 'LIKE' ? ICON.liked : ICON.like;
    like.classList.toggle('on', s.like === 'LIKE');
    mute.innerHTML = s.muted || !s.volume ? ICON.mute : ICON.vol;
    if (document.activeElement !== vol) vol.value = s.muted ? 0 : s.volume;
    tick();
    liveWave();
  }
  let cardEl = null, shownPct = -1, shownT1 = '', shownT2 = '';
  function tick() {
    const cur = current();
    if (!cur) return;
    if (!cardEl) cardEl = root.closest('.card');
    if (cardEl && cardEl.classList.contains('offscreen')) return;   // nobody sees it: it catches up when it is back
    const s = cur[1].state, t = Math.min(s.duration || 0, s.time + (s.playing ? (Date.now() - cur[1].seen) / 1000 : 0));
    const pct = s.duration ? Math.round(Math.min(100, (t / s.duration) * 100) * 4) / 4 : 0;   // quarter-percent steps: about a pixel
    if (pct !== shownPct) { shownPct = pct; fill.style.width = pct + '%'; headEl.style.left = pct + '%'; }
    if (skin) skin.tick(t, s);
    const a = clock(t), b = clock(s.duration);
    if (a !== shownT1) { shownT1 = a; t1.textContent = a; }
    if (b !== shownT2) { shownT2 = b; t2.textContent = b; }
  }

  /* the Wave bar, live: it swells with the loudness of what plays and every beat sends a ripple back from the head along
     what has played (levels from HomeboardAudio, the same ones the screen visuals use). Without levels the CSS wave stays. */
  const live = { cv: null, g: null, raf: 0, using: false, last: 0, phase: 0, avg: 0, kick: 0, carry: 0, hist: new Float32Array(2048), tint: '' };
  function liveWave() {
    const A = window.HomeboardAudio;
    const want = !!(A && A.available) && root.isConnected && st.bar === 'wave' && !PLAYERS[st.look] && root.dataset.playing === '1' && !document.hidden;
    if (want && !live.using) { A.start(); live.using = true; live.last = 0; }
    else if (!want && live.using) { A.stop(); live.using = false; root.classList.remove('wave-live'); }
    if (want && !live.cv) { live.cv = el('canvas', 'ytm-wave'); live.g = live.cv.getContext('2d'); bar.append(live.cv); }
    if (want && !live.raf && A.now()) { live.quiet = 0; live.raf = hub.onFrame(drawWave); }   // one shared loop, only while sound is heard (checked 4 times a second otherwise)
  }
  function drawWave(now) {
    if (!live.using) { live.raf = 0; return false; }
    if (!cardEl) cardEl = root.closest('.card');
    if (cardEl && cardEl.classList.contains('offscreen')) { live.last = 0; return; }   // off-screen: nothing drawn
    const lv = window.HomeboardAudio.now();
    if (!lv) { if ((live.quiet = (live.quiet || 0) + 1) > 60) { live.raf = 0; root.classList.remove('wave-live'); return false; } }   // silent for a second: stop drawing every frame
    else live.quiet = 0;
    const dt = live.last ? Math.min(.05, (now - live.last) / 1000) : .016; live.last = now;
    let amp = 0;
    if (lv && lv.bands && lv.bands.length) {
      const b = lv.bands; let bass = 0, all = 0;
      for (let i = 0; i < 8; i++) bass += b[i];
      for (let i = 0; i < b.length; i++) all += b[i];
      bass /= 8 * 255; all /= b.length * 255;
      live.avg += (bass - live.avg) * Math.min(1, dt * 2.5);                 // the usual bass level
      if (bass > live.avg * 1.15 + .035 && live.kick < .4) live.kick = 1;     // above it: a beat
      amp = Math.min(1.6, (all * 1.7 + live.kick * .6) * ((window.HomeboardVibe && window.HomeboardVibe.wave) || 1));   // Intensity scales the swing
    }
    live.kick = Math.max(0, live.kick - dt * 3.4);
    live.amp = (live.amp || 0) + (amp - (live.amp || 0)) * Math.min(1, dt * (amp > live.amp ? 22 : 7));   // quick up, softer down
    amp = live.amp;
    root.classList.toggle('wave-live', !!lv);
    // what the head felt travels back along the played part (about 110 px a second)
    const h = live.hist; live.carry += dt * 110;
    const n = Math.min(h.length, live.carry | 0); live.carry -= n;
    if (n) { const was = h[0]; h.copyWithin(n, 0, h.length - n); for (let i = 0; i < n; i++) h[i] = amp + (was - amp) * (i / n); }   // no steps between frames
    else h[0] = amp;
    live.phase -= dt * (3 + amp * 9);                                         // louder: it runs faster
    if (lv) {
      const cv = live.cv, g = live.g, dpr = devicePixelRatio || 1, W = bar.clientWidth, H = 20;
      if (cv.width !== Math.round(W * dpr) || cv.height !== H * dpr) { cv.width = Math.round(W * dpr); cv.height = H * dpr; }
      if (!live.tint || now - (live.tintAt || 0) > 2000) live.tintAt = now, live.tint = getComputedStyle(root).getPropertyValue('--ytm-accent').trim() || getComputedStyle(root).getPropertyValue('--ytm-tint').trim() || '#ff3d3d';
      const head = (parseFloat(fill.style.width) || 0) / 100 * W;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      g.beginPath();
      const k = Math.PI * 2 / 24;
      for (let x = head; x >= 0; x -= 1.5) {
        const d = head - x, a = Math.min(1.25, .16 + .84 * h[Math.min(h.length - 1, d | 0)]), taper = Math.min(1, d / 10);
        const y = H / 2 + Math.sin(x * k + live.phase) * a * (H / 2 - 2) * taper;
        if (x === head) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.lineWidth = 2.2; g.lineJoin = g.lineCap = 'round'; g.strokeStyle = live.tint;
      g.shadowColor = live.tint; g.shadowBlur = 2 + live.kick * 10;
      g.stroke();
    }
  }

  /* The halo: bars grow out of the cover's edge with the sound (round covers get a ring, square ones a sunburst
     from their sides), behind the cover, in the cover's own two colours. It looks for sound with the shared clock and
     draws on the shared animation loop only while something is heard. */
  const halo = { using: false, on: false, lv: new Float32Array(84), quiet: 0, pal: null };
  function haloCheck() {
    const A = window.HomeboardAudio;
    const want = st.halo && !PLAYERS[st.look] && root.isConnected && root.dataset.playing === '1' && !!(A && A.available) && !document.hidden;
    root.classList.toggle('has-halo', !!st.halo && !PLAYERS[st.look]);
    if (want && !halo.using) { A.start(); halo.using = true; }
    else if (!want && halo.using) { A.stop(); halo.using = false; }
    if (want && !halo.on && A.now() && !(cardEl && cardEl.classList.contains('offscreen'))) { halo.on = true; halo.quiet = 0; hub.onFrame(drawHalo); }
  }
  function drawHalo() {
    const A = window.HomeboardAudio, H = window.HomeboardHalo, g = haloCv.getContext('2d');
    if (!halo.using || !H) { halo.on = false; g.clearRect(0, 0, haloCv.width, haloCv.height); return false; }
    const now = A.now();
    if (!now && ++halo.quiet > 90) { halo.on = false; g.clearRect(0, 0, haloCv.width, haloCv.height); return false; }   // silence: rest
    if (now) halo.quiet = 0;
    const W = haloCv.clientWidth, Hh = haloCv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (!W || !Hh) return;
    if (haloCv.width !== Math.round(W * dpr) || haloCv.height !== Math.round(Hh * dpr)) { haloCv.width = Math.round(W * dpr); haloCv.height = Math.round(Hh * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
    H.levels(halo.lv, now, halo.lv.length);
    const cr = haloCv.getBoundingClientRect(), ar = art.getBoundingClientRect(), zoom = cr.width / W || 1;
    if (!ar.width) return;
    const round = parseFloat(getComputedStyle(art).borderTopLeftRadius) >= ar.width / zoom * .4 || st.look === 'vinyl' || st.look === 'pill';
    const shape = { cx: (ar.left - cr.left + ar.width / 2) / zoom, cy: (ar.top - cr.top + ar.height / 2) / zoom, hw: ar.width / zoom / 2, hh: ar.height / zoom / 2, round, r: Math.min(ar.width, ar.height) / zoom / 2, width: 2.6 };
    const p = halo.pal, accent = live.tint || getComputedStyle(root).getPropertyValue('--ytm-accent').trim() || '#ff3d3d';
    const colourAt = p ? (i, n) => H.mix(p.vivid, p.light, Math.abs(i / n * 2 - 1)) : () => accent;
    H.draw(g, shape, halo.lv, colourAt, Math.max(10, Math.min(46, Math.min(shape.hw, shape.hh) * .55)));
  }
  function send(action, value) {                       // to the player this widget shows (through the hub)
    const cur = current();
    if (cur) return hub.send(action, value, cur[0]);
  }
  const ctx = {
    send,
    volume(d) { const c = current(); if (c) send('volume', Math.max(0, Math.min(100, (c[1].state.muted ? 0 : c[1].state.volume || 0) + d))); },
    seekBy(d) { const c = current(); if (!c || !c[1].state.duration) return; const s = c[1].state, t = s.time + (s.playing ? (Date.now() - atOf()) / 1000 : 0); send('seek', Math.max(0, Math.min(s.duration - 1, t + d))); },
    pause() { const c = current(); if (c && c[1].state.playing) send('toggle'); },
  };
  function openPlayer() { api.tabs.create({ url: YTM, pinned: true, active: true }).catch(() => window.open(YTM, '_blank')); }
  async function focusPlayer(p) {
    try { const t = await api.tabs.update(p.tabId, { active: true }); if (api.windows?.update) await api.windows.update(t.windowId, { focused: true }); } catch { /* it closed */ }
  }

  play.addEventListener('click', () => send('toggle'));
  next.addEventListener('click', () => send('next'));
  prev.addEventListener('click', () => send('previous'));
  like.addEventListener('click', () => send('like'));
  mute.addEventListener('click', () => send('mute'));
  let volTimer = 0;
  vol.addEventListener('input', () => { clearTimeout(volTimer); volTimer = setTimeout(() => send('volume', +vol.value), 120); });
  bar.addEventListener('click', e => {
    const cur = current(), r = bar.getBoundingClientRect();
    if (cur && cur[1].state.duration) send('seek', ((e.clientX - r.left) / r.width) * cur[1].state.duration);
  });
  root.addEventListener('wheel', e => {                // scroll over the widget: volume
    if (!e.target.closest('.ytm-controls, .ytm-art')) return;
    const cur = current();
    if (!cur) return;
    e.preventDefault(); e.stopPropagation();
    send('volume', Math.max(0, Math.min(100, (cur[1].state.volume || 0) + (e.deltaY < 0 ? 5 : -5))));
  }, { passive: false });

  // the hub says when anything changes; the shared clock moves the bar; a widget taken off the board lets go of both
  let gone = false, unwatch = null;
  const done = () => { gone = true; if (unwatch) unwatch(); if (live.using) { window.HomeboardAudio.stop(); live.using = false; } if (halo.using) { window.HomeboardAudio.stop(); halo.using = false; } return false; };
  let lastAlive = 0;
  if (api?.runtime?.onMessage) unwatch = hub.watch(() => { if (gone) return; if (!root.isConnected && root.dataset.was) { done(); return; } paint(); });
  hub.onClock(() => {
    if (gone) return false;
    if (!root.isConnected) { if (root.dataset.was) return done(); return; }
    root.dataset.was = '1';
    tick();
    const n = alive().length;                          // a player went quiet for good: show that (checked with the clock, not a timer of its own)
    if (n !== lastAlive) { lastAlive = n; paint(); }
    if (!cardEl || !cardEl.classList.contains('offscreen')) { liveWave(); haloCheck(); }
  });
  paint();

  return {
    grab: e => !e.target.closest('button, input, .ytm-bar, .pl-wheel, .pl-knob'),
    menu: () => {
      const list = alive();
      return [
        { info: current()?.[1].state.title ? 'Scroll over the controls to change the volume.' : 'Play something in YouTube Music and it shows up here.' },
        current() && { label: 'Go to the player', icon: 'external', action: () => focusPlayer(current()[1]) },
        { label: 'Open YouTube Music (pinned tab)', icon: 'web', action: openPlayer },
        list.length > 1 && { label: 'Which player', icon: 'layers', items: list.map(([k, p]) => ({ label: p.state.title || 'YouTube Music (nothing playing)', checked: current()?.[0] === k, action() { st.pick = k; keep(); paint(); } })) },
        { label: 'Look', icon: 'layers', items: [
          ...Object.entries(LOOKS).map(([id, name]) => ({ label: name, checked: st.look === id, preview: () => window.HomeboardPreview && window.HomeboardPreview('ytm', { ...st, look: id, __preview: true }), action() { st.look = id; img.dataset.src = ''; keep(); paint(); } })),
          { sep: true },
          { info: 'Whole players, with their own buttons:' },
          ...Object.entries(PLAYER_NAMES).map(([id, name]) => ({ label: name, checked: st.look === id, preview: () => window.HomeboardPreview && window.HomeboardPreview('ytm', { ...st, look: id, __preview: true }), action() { st.look = id; keep(); paint(); } })),
        ] },
        !PLAYERS[st.look] && { label: 'Music halo around the cover', checked: st.halo, action() { st.halo = !st.halo; keep(); paint(); haloCheck(); } },
        !PLAYERS[st.look] && { label: 'Progress bar', icon: 'layers', items: Object.entries(BARS).map(([id, name]) => ({ label: name, checked: st.bar === id, preview: () => window.HomeboardPreview && window.HomeboardPreview('ytm', { ...st, look: PLAYERS[st.look] ? 'glass' : st.look, bar: id, halo: false, __preview: true }), action() { st.bar = id; keep(); paint(); } })) },
      ];
    },
  };
}

/* ================= Picture frame: your picture, or the cover of what plays (it changes with the song) ================= */
const FRAMES = { gilded: 'Gilded', gallery: 'Gallery black', wood: 'Wood', polaroid: 'Polaroid', white: 'Thin white', none: 'No frame',
  player: 'Click-wheel music player', tv: 'Wooden retro TV', crt: 'Small CRT monitor', arcade: 'Arcade cabinet' };
const DEVICES = new Set(['player', 'tv', 'crt', 'arcade']);
const mmss = v => (isFinite(v) && v > 0 ? `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}` : '0:00');
const SOURCES = { music: 'What’s playing', both: 'What’s playing, else my picture', picture: 'My picture' };
function pictureFrame(host, saved, onChange) {
  const st = { style: 'gilded', source: 'music', pic: '', mat: true, caption: true, finish: 'theme' };
  if (saved && typeof saved === 'object') {
    if (FRAMES[saved.style]) st.style = saved.style;
    if (SOURCES[saved.source]) st.source = saved.source;
    if (typeof saved.pic === 'string' && saved.pic.startsWith('data:image/')) st.pic = saved.pic;
    st.mat = saved.mat !== false; st.caption = saved.caption !== false;
    st.finish = saved.finish === 'classic' ? 'classic' : 'theme';
  }
  const keep = () => { try { onChange({ ...st }); } catch { /* host gone */ } };
  const root = el('div', 'pf'), frame = el('div', 'pf-frame'), mat = el('div', 'pf-mat'), img = el('img', 'pf-img'), empty = el('div', 'pf-empty'), cap = el('div', 'pf-cap');
  img.alt = ''; img.draggable = false; img.referrerPolicy = 'no-referrer';
  mat.append(img, empty); frame.append(mat, cap); root.append(frame);
  host.append(root);
  let song = null, built = '';
  const ctl = (cls, label, action, html) => { const b = el('button', 'dev-btn ' + cls); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); if (html) b.innerHTML = html; b.addEventListener('click', e => { e.stopPropagation(); action(); }); return b; };
  const vol = d => { const v = hub.state()?.volume ?? 50; hub.send('volume', Math.max(0, Math.min(100, v + d))); };
  const bar = el('div', 'dev-bar'), barFill = el('i'), t1 = el('span'), t2 = el('span'), marquee = el('div', 'dev-marquee');
  bar.append(barFill, el('div', 'dev-times'));
  bar.lastChild.append(t1, t2);
  const wheelVolume = target => target.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); vol(e.deltaY < 0 ? 5 : -5); }, { passive: false });
  function buildDevice() {                            // the skin around the screen, made once per style
    if (built === st.style) return;
    built = st.style;
    if (!DEVICES.has(st.style)) { frame.replaceChildren(mat, cap); root.replaceChildren(frame); return; }
    const dev = el('div', 'dev dev-' + st.style), screen = el('div', 'dev-screen');
    screen.append(mat);
    if (st.style === 'player') {
      screen.append(bar);
      const wheel = el('div', 'dev-wheel');
      wheel.append(ctl('menu', 'Menu: the song name on / off', () => { st.caption = !st.caption; keep(); paint(); }, 'MENU'),
        ctl('prev', 'Previous', () => hub.send('previous'), '&#9198;'), ctl('next', 'Next', () => hub.send('next'), '&#9197;'),
        ctl('pp', 'Play / pause', () => hub.send('toggle'), '&#9654;&#10074;&#10074;'), ctl('hub', 'Play / pause', () => hub.send('toggle')));
      wheelVolume(wheel);
      wheel.title = 'Scroll over the wheel for the volume';
      dev.append(screen, wheel);
    } else if (st.style === 'tv') {
      const side = el('div', 'dev-tv-side');
      const k1 = ctl('knob', 'Channel: next song (scroll: back / next)', () => hub.send('next')), k2 = ctl('knob', 'Volume: scroll over it', () => {});
      k1.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); hub.send(e.deltaY < 0 ? 'previous' : 'next'); }, { passive: false });
      wheelVolume(k2);
      side.append(el('div', 'dev-tv-dial'), k1, k2, el('div', 'dev-grille'), ctl('power', 'Power: play / pause', () => hub.send('toggle')));
      dev.append(screen, side);
    } else if (st.style === 'crt') {
      const front = el('div', 'dev-crt-front');
      front.append(ctl('small', 'Previous', () => hub.send('previous'), '&#9664;&#9664;'), ctl('small', 'Play / pause', () => hub.send('toggle'), '&#9654;&#10074;'),
        ctl('small', 'Next', () => hub.send('next'), '&#9654;&#9654;'), ctl('small', 'Volume down', () => vol(-8), '&minus;'), ctl('small', 'Volume up', () => vol(8), '+'), el('i', 'dev-led'));
      dev.append(el('div', 'dev-crt-vents'), screen, front);
    } else if (st.style === 'arcade') {
      const panel = el('div', 'dev-cp');
      panel.append(el('i', 'dev-stick'), ctl('ab red', 'Previous', () => hub.send('previous')), ctl('ab yellow', 'Play / pause', () => hub.send('toggle')), ctl('ab blue', 'Next', () => hub.send('next')));
      const base = el('div', 'dev-cab-base');
      base.append(el('i', 'dev-coin'), el('i', 'dev-coin'));
      dev.append(marquee, screen, panel, base);
    }
    root.replaceChildren(dev);
  }
  let shown = '';
  function tick() {                                    // the player's progress bar keeps moving between updates (only what changed is written)
    if (!root.isConnected) return;
    const sg = hub.state();
    let w = '0%', a = '', b = '';
    if (sg && sg.duration) {
      const t = Math.min(sg.duration, sg.time + (sg.playing ? (Date.now() - hub.heardAt()) / 1000 : 0));
      w = (Math.round(t / sg.duration * 400) / 4) + '%'; a = mmss(t); b = mmss(sg.duration);
    }
    const k = w + a + b;
    if (k === shown) return;
    shown = k; barFill.style.width = w; t1.textContent = a; t2.textContent = b;
  }
  let half = false, cardEl = null;                     // on the page's one shared clock, every other beat (2 a second)
  hub.onClock(() => {
    if (!root.isConnected) { if (root.dataset.was) { stop(); return false; } return; }
    root.dataset.was = '1';
    if (st.style !== 'player' || (half = !half)) return;
    if (!cardEl) cardEl = root.closest('.card');
    if (!cardEl || !cardEl.classList.contains('offscreen')) tick();
  });
  function paint() {
    buildDevice();
    root.dataset.style = st.style;
    root.dataset.finish = st.finish;
    marquee.textContent = song?.title || 'INSERT COIN';
    root.classList.toggle('no-mat', !st.mat || st.style === 'none' || st.style === 'polaroid');
    const music = st.source !== 'picture' && song && song.art;
    const src = music ? hub.big(song.art) : st.source !== 'music' ? st.pic : '';
    if (music && /i\.ytimg\.com\/.*\/(hq|sd|0)default/.test(song.art)) img.style.transform = 'scale(1.34)'; else img.style.transform = '';
    if (img.dataset.src !== src) {
      img.dataset.src = src;
      if (music) img.src = song.art;                    // the small cover at once, the big one when it has loaded
      if (src) { const big = new Image(); big.referrerPolicy = 'no-referrer'; big.onload = () => { if (img.dataset.src === src) img.src = src; }; big.onerror = () => { if (img.dataset.src === src && music) img.src = song.art; }; big.src = src; }
      else img.removeAttribute('src');
    }
    img.hidden = !src;
    empty.textContent = src ? '' : st.source === 'picture' ? 'Right-click → Choose a picture…' : '♪ Nothing playing';
    cap.textContent = st.caption && music ? [song.title, song.artist].filter(Boolean).join(' — ') : '';
    root.classList.toggle('playing', !!(music && song.playing));
    if (music) hub.palette(song.art).then(p => { if (p) root.style.setProperty('--pf-tint', p.vivid); });
  }
  const stop = hub.subscribe(sg => { if (!root.isConnected && root.dataset.was) { stop(); return; } song = sg || (saved && saved.__preview ? demo() : null); paint(); });
  function choose() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      try {                                             // kept smaller than the original, so the board stays light
        const bmp = await createImageBitmap(f), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        st.pic = c.toDataURL('image/jpeg', .86);
        if (st.source === 'music') st.source = 'both';
        keep(); paint();
      } catch { /* not a picture */ }
    });
    inp.click();
  }
  root.addEventListener('dblclick', () => { if (st.source !== 'picture' && song) hub.send('toggle'); });   // double-click: play / pause
  paint();
  return {
    grab: e => !e.target.closest('.dev-btn, .dev-wheel'),
    menu: () => [
      { info: st.source === 'picture' ? 'Shows your picture.' : 'Shows the cover of what plays in YouTube Music (double-click to pause or play).' },
      { label: 'Show', icon: 'media', items: Object.entries(SOURCES).map(([id, name]) => ({ label: name, checked: st.source === id, action() { st.source = id; keep(); paint(); if (id !== 'music' && !st.pic) choose(); } })) },
      { label: st.pic ? 'Change my picture…' : 'Choose a picture…', icon: 'media', action: choose },
      { label: 'Frame', icon: 'layers', items: Object.entries(FRAMES).map(([id, name]) => ({ label: name, checked: st.style === id, preview: () => window.HomeboardPreview && window.HomeboardPreview('frame', { ...st, style: id, __preview: true }), action() { st.style = id; keep(); paint(); } })) },
      DEVICES.has(st.style) && { label: 'Finish', icon: 'layers', items: [
        { label: 'Matches the board (theme colours)', checked: st.finish === 'theme', action() { st.finish = 'theme'; keep(); paint(); } },
        { label: 'Classic (real-world colours)', checked: st.finish === 'classic', action() { st.finish = 'classic'; keep(); paint(); } },
      ] },
      { label: 'White mount around the picture', checked: st.mat, action() { st.mat = !st.mat; keep(); paint(); } },
      { label: 'Song name under it', checked: st.caption, action() { st.caption = !st.caption; keep(); paint(); } },
    ],
  };
}
REG.frame = { label: 'Picture frame', menu: 'Picture frame', w: 250, h: 310, bare: true, create: pictureFrame };

REG.ytm = { label: 'YouTube Music', menu: 'YouTube Music', w: 420, h: 150, bare: true, create: ytmusic };
})();
