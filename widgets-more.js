/* More Homeboard widgets: clock, 2048, Minesweeper, Sudoku, sliding puzzle.
 * Same contract as widgets.js: create(host, saved, onChange) -> { menu(), grab(event) }.
 * All of them are "bare": no card frame, options on the right-click menu, sized by the card.
 */
(() => {
'use strict';

const REG = window.HomeboardWidgets = window.HomeboardWidgets || {};
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clock2 = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/* Ask for a picture and hand back a square, cropped copy small enough to keep in the board's data. */
function pickPicture(size, done) {
  const input = el('input');
  input.type = 'file'; input.accept = 'image/*';
  input.addEventListener('change', async () => {
    try {
      const bmp = await createImageBitmap(input.files[0]);
      const cv = el('canvas');
      cv.width = cv.height = size;
      const k = Math.max(size / bmp.width, size / bmp.height);
      cv.getContext('2d').drawImage(bmp, (size - bmp.width * k) / 2, (size - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
      done(cv.toDataURL('image/jpeg', .85));
    } catch { /* not a readable picture */ }
  });
  input.click();
}
const PICTURE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/* ================================================================== *
 *  Clock
 * ================================================================== */
const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const ARABIC = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const CLOCKS = {
  minimal: { name: 'Minimal', analog: true, ticks: 12, face: 'none', ink: 'currentColor', second: 'var(--accent)' },
  theme: { name: 'Theme colours', analog: true, ticks: 12, face: 'var(--surface)', rim: 'var(--accent)', ink: 'var(--text)', second: 'var(--accent)' },
  classic: { name: 'Classic', analog: true, ticks: 60, numerals: ARABIC, face: '#f7f4ec', rim: '#2a2a2e', ink: '#1d1d20', second: '#d0342c', font: 'Georgia, serif' },
  roman: { name: 'Roman', analog: true, ticks: 12, numerals: ROMAN, face: '#14211b', rim: '#c9a94b', ink: '#e6c36a', second: '#f1e3b0', font: 'Georgia, serif' },
  bold: { name: 'Bold', analog: true, ticks: 60, face: '#ffffff', rim: '#cfd2d6', ink: '#111214', second: '#e0342c', thick: true },
  neon: { name: 'Neon', analog: true, ticks: 12, face: '#0b0a18', rim: 'var(--accent)', ink: 'color-mix(in srgb, var(--accent) 45%, #ffffff)', second: 'var(--accent)', glow: true },   // glows in the accent (which can follow the cover)
  digital: { name: 'Digital', analog: false },
  led: { name: 'LED', analog: false, kind: 'led' },
  flip: { name: 'Flip clock', analog: false, kind: 'flip' },
  nixie: { name: 'Nixie tubes', analog: false, kind: 'nixie' },
  lcd: { name: 'LCD watch', analog: false, kind: 'lcd' },
  matrix: { name: 'Dot matrix', analog: false, kind: 'matrix' },
  thin: { name: 'Thin and big', analog: false, kind: 'thin' },
  tube: { name: 'Neon tube', analog: false, kind: 'tube' },
};
const CLOCK_DIGITAL = Object.keys(CLOCKS).filter(k => !CLOCKS[k].analog);

/* ---- the music halo: bars that grow out of a shape's edge with the sound (a circle, or a rounded box), drawn by any
   widget that wears one (the clock, YouTube Music). lv: levels 0..1 around the shape, folded so it is symmetric;
   colourAt(i, n, v) gives each bar its colour. ---- */
window.HomeboardHalo = window.HomeboardHalo || {
  levels(lv, now, n) {                                 // smooth the bands into n levels around the shape (bass at the top)
    for (let i = 0; i < n; i++) {
      const k = i < n / 2 ? i : n - 1 - i, band = Math.min(95, Math.floor(k / (n / 2) * 80));
      const target = now ? Math.min(1, (now.bands[band] / 255) ** 1.5) : 0;
      lv[i] += (target - lv[i]) * (target > lv[i] ? .5 : .14);
    }
  },
  draw(g, shape, lv, colourAt, max) {
    const n = lv.length, { cx, cy } = shape;
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 - Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
      // where the ray leaves the shape: the circle, or the box (with its rounded corners near enough)
      const d = shape.round ? shape.r : Math.min(Math.abs(dx) > 1e-6 ? shape.hw / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? shape.hh / Math.abs(dy) : 1e9);
      const r0 = d + 3, len = 1 + lv[i] * max, col = colourAt(i, n, lv[i]);
      g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 4 + lv[i] * 10; g.globalAlpha = .55 + lv[i] * .45;
      g.lineWidth = shape.width || 2.5;
      g.beginPath(); g.moveTo(cx + dx * r0, cy + dy * r0); g.lineTo(cx + dx * (r0 + len), cy + dy * (r0 + len)); g.stroke();
    }
    g.restore();
  },
  mix(a, b, k) {                                       // two #rrggbb colours mixed (for gradients around the ring)
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b);
    return 'rgb(' + x.map((v, j) => Math.round(v + (y[j] - v) * k)).join(',') + ')';
  },
};
function clock(host, saved, onChange) {
  const st = { skin: 'minimal', seconds: true, date: true, h24: true, music: false, musicColor: 'own' };
  if (saved && typeof saved === 'object') {
    if (CLOCKS[saved.skin]) st.skin = saved.skin;
    if (saved.musicColor === 'cover') st.musicColor = 'cover';
    for (const k of ['seconds', 'date', 'h24', 'music']) if (typeof saved[k] === 'boolean') st[k] = saved[k];
  }
  const root = el('div', 'clock-widget');
  host.append(root);
  let hands = null, timeEl = null, hhEl = null, mmEl = null, secEl = null, dateEl = null, faceEl = null;
  const musicCv = el('canvas', 'clock-music');      // the music around it (drawn only while something plays)

  function build() {
    const s = CLOCKS[st.skin];
    root.replaceChildren(musicCv);
    root.dataset.skin = st.skin;
    root.classList.toggle('music', st.music);
    hands = timeEl = hhEl = mmEl = secEl = faceEl = null;
    if (s.analog) {
      let g = s.face === 'none' ? '' : `<circle cx="100" cy="100" r="95" fill="${s.face}" stroke="${s.rim}" stroke-width="${s.thick ? 8 : 4}"/>`;
      for (let i = 0; i < s.ticks; i++) {
        const hour = i % (s.ticks / 12) === 0, quarter = i % (s.ticks / 4) === 0;
        if (hour && s.numerals) continue;
        const len = hour ? (s.thick ? 20 : quarter ? 13 : 9) : 5, w = hour ? (s.thick ? 6 : quarter ? 3 : 2) : 1;
        g += `<line x1="100" y1="13" x2="100" y2="${13 + len}" stroke="${s.ink}" stroke-width="${w}" stroke-linecap="${s.thick ? 'butt' : 'round'}" opacity="${hour ? 1 : .55}" transform="rotate(${i * 360 / s.ticks} 100 100)"/>`;
      }
      if (s.numerals) s.numerals.forEach((t, i) => {
        const a = i * Math.PI / 6;
        g += `<text x="${100 + 73 * Math.sin(a)}" y="${100 - 73 * Math.cos(a)}" text-anchor="middle" dominant-baseline="central" font-size="${t.length > 2 ? 12 : 16}" font-weight="600" font-family="${s.font}" fill="${s.ink}">${t}</text>`;
      });
      const hand = (cls, y2, w, color) => `<line class="${cls}" x1="100" y1="${cls === 'cs' ? 122 : 110}" x2="100" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="${s.thick ? 'butt' : 'round'}"/>`;
      g += hand('ch', 52, s.thick ? 9 : 6, s.ink) + hand('cm', 24, s.thick ? 6 : 4, s.ink) + hand('cs', 20, s.thick ? 2.5 : 1.6, s.second)
        + `<circle cx="100" cy="100" r="${s.thick ? 7 : 4.5}" fill="${s.second}"/>`;
      const svg = el('div', 'clock-face' + (s.glow ? ' glow' : ''));
      svg.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">${g}</svg>`;
      root.append(svg);
      faceEl = svg;
      hands = { h: svg.querySelector('.ch'), m: svg.querySelector('.cm'), s: svg.querySelector('.cs') };
    } else {
      const row = el('div', 'clock-digits' + (s.kind ? ' ' + s.kind : ''));
      timeEl = el('span', 'clock-time'); secEl = el('span', 'clock-sec');
      hhEl = el('b'); mmEl = el('b');
      timeEl.append(hhEl, el('i', 'clock-colon', ':'), mmEl);
      row.append(timeEl, secEl);
      root.append(row);
      faceEl = row;
    }
    tint = '';
    dateEl = el('div', 'clock-date');
    root.append(dateEl);
    tick();
  }
  function tick() {
    const d = new Date(), h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    if (hands) {
      hands.h.setAttribute('transform', `rotate(${(h % 12 + m / 60) * 30} 100 100)`);
      hands.m.setAttribute('transform', `rotate(${(m + s / 60) * 6} 100 100)`);
      hands.s.setAttribute('transform', `rotate(${s * 6} 100 100)`);
      hands.s.style.display = st.seconds ? '' : 'none';
    } else {
      const hh = String(st.h24 ? h : (h % 12 || 12)).padStart(2, '0'), mm = String(m).padStart(2, '0');
      if (hhEl.textContent !== hh) hhEl.textContent = hh;
      if (mmEl.textContent !== mm) mmEl.textContent = mm;
      secEl.textContent = st.seconds ? String(s).padStart(2, '0') : st.h24 ? '' : h < 12 ? 'am' : 'pm';
    }
    dateEl.hidden = !st.date;
    const text = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    if (dateEl.textContent !== text) dateEl.textContent = text;
    root.setAttribute('aria-label', 'Clock: ' + d.toLocaleTimeString());
  }
  let shown = false;                                  // stop ticking once the card has been on the page and is gone
  const timer = setInterval(() => {
    if (root.isConnected) shown = true; else if (shown) { clearInterval(timer); return; }
    tick();
  }, 1000);
  /* Music around it: a ring of bars around a round face, an equaliser behind digits, in the clock's own colour.
     It looks for sound 4 times a second and draws every frame only while something plays (HomeboardAudio). */
  let tint = '', tintAt = 0, listening = false, raf = 0, wait = 0, quiet = 0, pal = null, unPal = null;
  function coverColours(on) {                         // the two colours of the cover of what plays, kept up to date
    const M = window.HomeboardMusic;
    if (on && !unPal && M) unPal = M.subscribe(sg => { if (sg && sg.art) M.palette(sg.art).then(p => { pal = p; }); else pal = null; });
    if (!on && unPal) { unPal(); unPal = null; pal = null; }
  }
  const shownLv = new Float32Array(72);
  const A = () => window.HomeboardAudio;
  function music(on) {
    const a = A();
    if (on && a && a.available && !listening) { a.start(); listening = true; look(); }
    if (!on && listening) { a.stop(); listening = false; cancelAnimationFrame(raf); raf = 0; clearTimeout(wait); musicCv.getContext('2d').clearRect(0, 0, musicCv.width, musicCv.height); }
  }
  function look() {                                   // nothing heard: check again soon, without drawing
    clearTimeout(wait);
    if (!listening) return;
    if (!root.isConnected && shown) { music(false); return; }
    if (A().now() && !document.hidden && !root.closest('.card.offscreen')) { quiet = 0; raf = requestAnimationFrame(drawMusic); }
    else wait = setTimeout(look, 250);
  }
  function drawMusic() {
    raf = 0;
    if (!listening) return;
    const lv = A().now(), w = root.clientWidth, h = root.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (musicCv.width !== Math.round(w * dpr) || musicCv.height !== Math.round(h * dpr)) { musicCv.width = Math.round(w * dpr); musicCv.height = Math.round(h * dpr); }
    const g = musicCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const n = shownLv.length;
    const H = window.HomeboardHalo;
    H.levels(shownLv, lv, n);
    if (!tint || performance.now() - tintAt > 2000) tintAt = performance.now(), tint = getComputedStyle(faceEl || root).getPropertyValue('--clock-tint').trim() || getComputedStyle(root).getPropertyValue('--accent').trim() || '#7aa2ff';
    const colourAt = st.musicColor === 'cover' && pal ? (i, nn) => H.mix(pal.vivid, pal.light, Math.abs(i / nn * 2 - 1)) : () => tint;
    g.strokeStyle = g.fillStyle = tint; g.lineCap = 'round';
    const fr = faceEl ? faceEl.getBoundingClientRect() : null, rr = root.getBoundingClientRect();
    const zoom = rr.width / (root.offsetWidth || rr.width || 1);           // the board's zoom (rects are scaled, the canvas is not)
    if (CLOCKS[st.skin].analog && fr) {
      const cx = (fr.left - rr.left + fr.width / 2) / zoom, cy = (fr.top - rr.top + fr.height / 2) / zoom, r0 = fr.width / zoom / 2 + 3;
      const max = Math.max(6, Math.min(w, h) / 2 - r0 - 2);
      H.draw(g, { cx, cy, round: true, r: r0 - 3, width: Math.max(1.5, Math.min(4, 2 * Math.PI * r0 / n * .45)) }, shownLv, colourAt, max);
    } else {                                           // digits: a mirrored equaliser across the clock, behind the numbers
      const bars = Math.max(16, Math.min(n, Math.round(w / 9))), bw = w / bars, mid = h / 2;
      for (let i = 0; i < bars; i++) {
        const v = shownLv[Math.floor(i / bars * n)], bh = 2 + v * h * .46;
        g.globalAlpha = .18 + v * .4; g.fillStyle = colourAt(i, bars, v);
        g.beginPath(); g.roundRect(i * bw + bw * .2, mid - bh, bw * .6, bh * 2, Math.min(bw * .3, 3)); g.fill();
      }
    }
    g.globalAlpha = 1;
    if (!lv) { if (++quiet > 90) { g.clearRect(0, 0, w, h); look(); return; } } else quiet = 0;   // a second and a half of silence: rest
    if (!root.isConnected) { if (shown) music(false); else look(); return; }   // not on the board yet: wait; taken off: stop
    raf = requestAnimationFrame(drawMusic);
  }
  const set = fn => () => { fn(); build(); music(st.music); coverColours(st.music && st.musicColor === 'cover'); try { onChange({ ...st }); } catch { /* host gone */ } };
  build();
  music(st.music);
  coverColours(st.music && st.musicColor === 'cover');
  return {
    menu: () => [
      { label: 'Change clock', icon: 'layers', items: [
        { info: 'With hands' },
        ...Object.entries(CLOCKS).filter(([, c]) => c.analog).map(([id, c]) => ({ label: c.name, checked: st.skin === id, preview: () => window.HomeboardPreview && window.HomeboardPreview('clock', { ...st, skin: id, music: false }), action: set(() => { st.skin = id; }) })),
        { sep: true }, { info: 'Digital' },
        ...CLOCK_DIGITAL.map(id => ({ label: CLOCKS[id].name, checked: st.skin === id, preview: () => window.HomeboardPreview && window.HomeboardPreview('clock', { ...st, skin: id, music: false }), action: set(() => { st.skin = id; }) })),
      ] },
      { label: 'Music around it (moves with what plays)', checked: st.music, action: set(() => { st.music = !st.music; }) },
      st.music && { label: 'Colour of the music', icon: 'layers', items: [
        { label: 'The clock’s own colour', checked: st.musicColor === 'own', action: set(() => { st.musicColor = 'own'; }) },
        { label: 'The colours of the cover', checked: st.musicColor === 'cover', action: set(() => { st.musicColor = 'cover'; }) },
      ] },
      { label: 'Show seconds', checked: st.seconds, action: set(() => { st.seconds = !st.seconds; }) },
      { label: 'Show the date', checked: st.date, action: set(() => { st.date = !st.date; }) },
      { label: '24-hour time (digital)', checked: st.h24, action: set(() => { st.h24 = !st.h24; }) },
    ],
  };
}

/* ================================================================== *
 *  2048: slide the tiles, equal ones merge.
 * ================================================================== */
function g2048(host, saved, onChange) {
  let tiles = [], score = 0, best = 0, over = false, nextId = 1;
  const root = el('div', 'g48');
  root.tabIndex = 0;
  const head = el('div', 'game-head'), scoreEl = el('span', 'game-stat'), bestEl = el('span', 'game-stat dim');
  head.append(el('b', null, '2048'), scoreEl, bestEl);
  const board = el('div', 'g48-board'), layer = el('div', 'g48-tiles'), banner = el('div', 'game-banner');
  for (let i = 0; i < 16; i++) board.append(el('i', 'g48-cell'));
  board.append(layer, banner);
  const fit = el('div', 'game-fit');
  fit.append(board);
  root.append(head, fit);
  host.append(root);
  const nodes = new Map();

  const free = () => { const out = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!tiles.some(t => !t.dead && t.r === r && t.c === c)) out.push([r, c]); return out; };
  const spawn = () => { const f = free(); if (!f.length) return; const [r, c] = f[Math.floor(Math.random() * f.length)]; tiles.push({ id: nextId++, v: Math.random() < .9 ? 2 : 4, r, c, fresh: true }); };
  const stuck = () => {
    if (free().length) return false;
    const at = (r, c) => tiles.find(t => !t.dead && t.r === r && t.c === c);
    return !tiles.some(t => !t.dead && [[0, 1], [1, 0]].some(([dr, dc]) => at(t.r + dr, t.c + dc)?.v === t.v));
  };
  const remember = () => { try { onChange({ tiles: tiles.filter(t => !t.dead).map(t => [t.v, t.r, t.c]), score, best }); } catch { /* host gone */ } };
  function start() { tiles = []; score = 0; over = false; spawn(); spawn(); draw(); remember(); }

  function draw() {
    for (const t of tiles) {
      let n = nodes.get(t.id);
      if (!n) { n = el('div', 'g48-tile'); n.append(el('span')); nodes.set(t.id, n); layer.append(n); }
      n.style.setProperty('--r', t.r); n.style.setProperty('--c', t.c);
      n.dataset.v = t.v > 2048 ? 'big' : t.v;
      n.firstChild.textContent = t.v;
      n.classList.toggle('pop', !!(t.fresh || t.merged));
      n.classList.toggle('dead', !!t.dead);
      t.fresh = t.merged = false;
    }
    const dead = tiles.filter(t => t.dead);
    tiles = tiles.filter(t => !t.dead);
    if (dead.length) setTimeout(() => dead.forEach(t => { nodes.get(t.id)?.remove(); nodes.delete(t.id); }), 140);
    for (const [id, n] of nodes) if (!tiles.some(t => t.id === id) && !dead.some(t => t.id === id)) { n.remove(); nodes.delete(id); }
    scoreEl.textContent = score; bestEl.textContent = 'best ' + best;
    banner.textContent = over ? 'No more moves' : '';
    banner.hidden = !over;
    root.setAttribute('aria-label', `2048. Score ${score}.${over ? ' Game over.' : ''}`);
  }
  function move(dx, dy) {
    if (over) return;
    const at = (r, c) => tiles.find(t => !t.dead && t.r === r && t.c === c);
    const order = tiles.slice().sort((a, b) => (dx ? (dx > 0 ? b.c - a.c : a.c - b.c) : dy > 0 ? b.r - a.r : a.r - b.r));
    let moved = false;
    for (const t of order) {
      let r = t.r, c = t.c;
      for (;;) {
        const nr = r + dy, nc = c + dx;
        if (nr < 0 || nr > 3 || nc < 0 || nc > 3) break;
        const o = at(nr, nc);
        if (!o) { r = nr; c = nc; continue; }
        if (o.v === t.v && !o.merged) { t.dead = true; r = nr; c = nc; o.v *= 2; o.merged = true; score += o.v; }
        break;
      }
      if (r !== t.r || c !== t.c) { t.r = r; t.c = c; moved = true; }
    }
    if (!moved) return;
    best = Math.max(best, score);
    spawn();
    tiles.filter(t => t.dead).forEach(t => { t.merged = false; });
    over = stuck();
    draw(); remember();
  }

  root.addEventListener('keydown', e => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[e.key];
    if (!k || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); e.stopPropagation();
    move(k[0], k[1]);
  });
  let swipe = null;
  board.addEventListener('pointerdown', e => { if (e.button === 0) { swipe = { x: e.clientX, y: e.clientY }; root.focus({ preventScroll: true }); try { board.setPointerCapture(e.pointerId); } catch { /* synthetic */ } } });
  board.addEventListener('pointerup', e => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx), 0); else move(0, Math.sign(dy));
  });

  if (saved && Array.isArray(saved.tiles) && saved.tiles.length && saved.tiles.every(t => Array.isArray(t) && t[0] >= 2 && t[1] >= 0 && t[1] < 4 && t[2] >= 0 && t[2] < 4)) {
    tiles = saved.tiles.map(([v, r, c]) => ({ id: nextId++, v, r, c }));
    score = +saved.score || 0; best = +saved.best || 0; over = stuck();
    draw();
  } else { best = saved && +saved.best || 0; start(); }

  return {
    grab: e => !board.contains(e.target),
    menu: () => [
      { info: `Score ${score} · best ${best}. Arrow keys, or drag across the board.` },
      { label: 'New game', icon: 'reload', action: start },
    ],
  };
}

/* ================================================================== *
 *  Minesweeper
 * ================================================================== */
const MINE_LEVELS = { easy: { name: 'Easy · 9 × 9', w: 9, h: 9, mines: 10 }, medium: { name: 'Medium · 16 × 16', w: 16, h: 16, mines: 40 }, hard: { name: 'Hard · 30 × 16', w: 30, h: 16, mines: 99 } };
function mines(host, saved, onChange) {
  let level = 'easy', w, h, count, cells, started, over, won, secs, timer = 0;
  const root = el('div', 'ms');
  const head = el('div', 'game-head'), leftEl = el('span', 'game-stat'), timeEl = el('span', 'game-stat dim');
  const face = el('button', 'ms-face'); face.type = 'button'; face.title = 'New game';
  head.append(leftEl, face, timeEl);
  const fit = el('div', 'game-fit'), grid = el('div', 'ms-grid');
  fit.append(grid);
  root.append(head, fit);
  host.append(root);

  const around = i => { const r = Math.floor(i / w), c = i % w, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if ((dr || dc) && rr >= 0 && rr < h && cc >= 0 && cc < w) out.push(rr * w + cc); } return out; };
  const remember = () => { try { onChange({ level, started, over, won, secs, cells: cells.map(c => (c.m ? 1 : 0) | (c.o ? 2 : 0) | (c.f ? 4 : 0)) }); } catch { /* host gone */ } };
  function clockOn() {
    clearInterval(timer);
    if (!started || over) return;
    timer = setInterval(() => { if (!root.isConnected) { clearInterval(timer); return; } secs++; timeEl.textContent = clock2(secs); if (secs % 10 === 0) remember(); }, 1000);
  }
  function start(lv = level) {
    level = MINE_LEVELS[lv] ? lv : 'easy';
    ({ w, h, mines: count } = MINE_LEVELS[level]);
    cells = Array.from({ length: w * h }, () => ({ m: false, o: false, f: false, n: 0 }));
    started = over = won = false; secs = 0;
    clearInterval(timer);
    build(); remember();
  }
  function plant(safe) {
    const banned = new Set([safe, ...around(safe)]);
    const spots = shuffle([...cells.keys()].filter(i => !banned.has(i))).slice(0, count);
    spots.forEach(i => { cells[i].m = true; });
    number();
  }
  const number = () => cells.forEach((c, i) => { c.n = around(i).filter(j => cells[j].m).length; });
  function open(i) {
    const stack = [i];
    while (stack.length) {
      const j = stack.pop(), c = cells[j];
      if (c.o || c.f) continue;
      c.o = true;
      if (c.m) { over = true; c.hit = true; return; }
      if (!c.n) stack.push(...around(j));
    }
  }
  function click(i) {
    if (over) return;
    const c = cells[i];
    if (c.f) return;
    if (!started) { started = true; plant(i); clockOn(); }
    if (c.o) {                                       // a number with all its flags placed opens the rest around it
      if (c.n && around(i).filter(j => cells[j].f).length === c.n) around(i).forEach(j => { if (!over) open(j); });
    } else open(i);
    if (!over && cells.every(x => x.o || x.m)) { over = won = true; cells.forEach(x => { if (x.m) x.f = true; }); }
    if (over) clearInterval(timer);
    paint(); remember();
  }
  function flag(i) {
    if (over || cells[i].o) return;
    cells[i].f = !cells[i].f;
    paint(); remember();
  }
  function build() {
    grid.style.setProperty('--w', w); grid.style.setProperty('--h', h);
    grid.replaceChildren(...cells.map((c, i) => {
      const b = el('button', 'ms-cell');
      b.type = 'button';
      b.addEventListener('click', () => click(i));
      b.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); flag(i); });   // right-click here means "flag"
      return b;
    }));
    paint();
  }
  function paint() {
    cells.forEach((c, i) => {
      const b = grid.children[i], show = c.o || (over && c.m && !c.f);
      b.className = 'ms-cell' + (show ? ' open' : '') + (c.hit ? ' hit' : '') + (over && c.f && !c.m ? ' wrong' : '');
      b.textContent = c.f && !(over && c.m && c.o) ? '⚑' : show ? (c.m ? '✹' : c.n || '') : '';
      b.dataset.n = show && !c.m ? c.n : '';
    });
    leftEl.textContent = '⚑ ' + (count - cells.filter(c => c.f).length);
    timeEl.textContent = clock2(secs);
    face.textContent = won ? '😎' : over ? '😵' : '🙂';
    root.setAttribute('aria-label', `Minesweeper. ${won ? 'Cleared.' : over ? 'Boom.' : ''}`);
  }
  face.addEventListener('click', () => start());

  const lv = saved && MINE_LEVELS[saved.level] ? saved.level : 'easy', L = MINE_LEVELS[lv];
  if (saved && Array.isArray(saved.cells) && saved.cells.length === L.w * L.h) {
    level = lv; ({ w, h, mines: count } = L);
    cells = saved.cells.map(b => ({ m: !!(b & 1), o: !!(b & 2), f: !!(b & 4), n: 0 }));
    number();
    started = !!saved.started; over = !!saved.over; won = !!saved.won; secs = +saved.secs || 0;
    build(); clockOn();
  } else start(lv);

  return {
    grab: e => !grid.contains(e.target) && e.target !== face,
    menu: () => [
      { info: 'Click to open a square, right-click to flag it.' },
      { label: 'New game', icon: 'reload', action: () => start() },
      { label: 'Size', icon: 'layers', items: Object.entries(MINE_LEVELS).map(([id, l]) => ({ label: l.name, checked: level === id, action: () => start(id) })) },
    ],
  };
}

/* ================================================================== *
 *  Sudoku
 * ================================================================== */
const SUDOKU_LEVELS = { easy: { name: 'Easy', clues: 40 }, medium: { name: 'Medium', clues: 32 }, hard: { name: 'Hard', clues: 26 } };
function sudokuSolutions(g, limit) {                 // how many ways the grid can be completed (stops at `limit`)
  let found = 0;
  const fits = (i, v) => {
    const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3;
    for (let k = 0; k < 9; k++) if (g[r * 9 + k] === v || g[k * 9 + c] === v || g[(br + Math.floor(k / 3)) * 9 + bc + k % 3] === v) return false;
    return true;
  };
  const go = () => {
    let at = -1, opts = null;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const cs = [];
      for (let v = 1; v <= 9; v++) if (fits(i, v)) cs.push(v);
      if (!opts || cs.length < opts.length) { at = i; opts = cs; if (!cs.length) return; }
    }
    if (at < 0) { found++; return; }
    for (const v of opts) { g[at] = v; go(); g[at] = 0; if (found >= limit) return; }
  };
  go();
  return found;
}
function sudokuNew(clues) {
  const three = () => shuffle([0, 1, 2]);
  const rows = three().flatMap(g => three().map(r => g * 3 + r)), cols = three().flatMap(g => three().map(c => g * 3 + c));
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const sol = rows.flatMap(r => cols.map(c => nums[(3 * (r % 3) + Math.floor(r / 3) + c) % 9]));
  const puz = sol.slice();
  let left = 81;
  for (const i of shuffle([...Array(81).keys()])) {    // take numbers away while the puzzle keeps a single answer
    if (left <= clues) break;
    const keep = puz[i];
    puz[i] = 0;
    if (sudokuSolutions(puz.slice(), 2) === 1) left--; else puz[i] = keep;
  }
  return { puz, sol };
}
function sudoku(host, saved, onChange) {
  let level = 'easy', puz, sol, val, notes, sel = -1, pencil = false, mistakes = true, secs = 0, done = false, timer = 0;
  const root = el('div', 'sdk');
  root.tabIndex = 0;
  const head = el('div', 'game-head'), nameEl = el('span', 'game-stat'), timeEl = el('span', 'game-stat dim');
  head.append(el('b', null, 'Sudoku'), nameEl, timeEl);
  const fit = el('div', 'game-fit'), grid = el('div', 'sdk-grid'), banner = el('div', 'game-banner');
  const pad = el('div', 'sdk-pad');
  fit.append(grid);
  root.append(head, fit, pad);
  host.append(root);

  const remember = () => { try { onChange({ level, puz, sol, val, notes, secs, mistakes }); } catch { /* host gone */ } };
  function clockOn() {
    clearInterval(timer);
    if (done) return;
    timer = setInterval(() => { if (!root.isConnected) { clearInterval(timer); return; } secs++; timeEl.textContent = clock2(secs); if (secs % 15 === 0) remember(); }, 1000);
  }
  function start(lv = level) {
    level = SUDOKU_LEVELS[lv] ? lv : 'easy';
    ({ puz, sol } = sudokuNew(SUDOKU_LEVELS[level].clues));
    val = puz.slice(); notes = Array(81).fill(0); sel = -1; secs = 0; done = false;
    build(); clockOn(); remember();
  }
  function put(v) {                                   // v: 1-9, or 0 to clear
    if (sel < 0 || puz[sel] || done) return;
    if (pencil && v) { if (!val[sel]) notes[sel] ^= 1 << v; }
    else {
      val[sel] = val[sel] === v ? 0 : v;
      notes[sel] = 0;
      if (val[sel]) {                                 // tidy the notes that this number rules out
        const r = Math.floor(sel / 9), c = sel % 9, br = r - r % 3, bc = c - c % 3;
        for (let k = 0; k < 9; k++) for (const j of [r * 9 + k, k * 9 + c, (br + Math.floor(k / 3)) * 9 + bc + k % 3]) notes[j] &= ~(1 << v);
      }
    }
    done = val.every((x, i) => x === sol[i]);
    if (done) clearInterval(timer);
    paint(); remember();
  }
  function build() {
    grid.replaceChildren(...Array.from({ length: 81 }, (_, i) => {
      const b = el('button', 'sdk-cell');
      b.type = 'button';
      b.addEventListener('click', () => { sel = i; root.focus({ preventScroll: true }); paint(); });
      return b;
    }), banner);
    pad.replaceChildren(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => { const b = el('button', 'sdk-key', v); b.type = 'button'; b.addEventListener('click', () => put(v)); return b; }));
    const erase = el('button', 'sdk-key', '⌫'); erase.type = 'button'; erase.title = 'Clear the square'; erase.addEventListener('click', () => put(0));
    const pen = el('button', 'sdk-key pen', '✎'); pen.type = 'button'; pen.title = 'Notes: small pencil marks instead of answers';
    pen.addEventListener('click', () => { pencil = !pencil; paint(); });
    pad.append(erase, pen);
    paint();
  }
  function paint() {
    const same = sel >= 0 ? val[sel] : 0, sr = Math.floor(sel / 9), sc = sel % 9;
    for (let i = 0; i < 81; i++) {
      const b = grid.children[i], r = Math.floor(i / 9), c = i % 9, v = val[i];
      const peer = sel >= 0 && (r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3)));
      b.className = 'sdk-cell' + (puz[i] ? ' given' : '') + (i === sel ? ' sel' : peer ? ' peer' : '') + (v && v === same && i !== sel ? ' same' : '')
        + (mistakes && v && !puz[i] && v !== sol[i] ? ' bad' : '') + (c % 3 === 2 && c < 8 ? ' br' : '') + (r % 3 === 2 && r < 8 ? ' bb' : '');
      if (v) b.textContent = v;
      else if (notes[i]) { b.replaceChildren(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => el('i', null, notes[i] & (1 << n) ? n : ''))); b.classList.add('noted'); }
      else b.textContent = '';
    }
    pad.querySelector('.pen').classList.toggle('on', pencil);
    nameEl.textContent = SUDOKU_LEVELS[level].name; timeEl.textContent = clock2(secs);
    banner.textContent = done ? `Solved in ${clock2(secs)}` : '';
    banner.hidden = !done;
    root.setAttribute('aria-label', `Sudoku, ${SUDOKU_LEVELS[level].name}.${done ? ' Solved.' : ''}`);
  }
  root.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const arrow = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key];
    if (/^[1-9]$/.test(e.key)) put(+e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') put(0);
    else if (e.key.toLowerCase() === 'n') { pencil = !pencil; paint(); }
    else if (arrow) {
      if (sel < 0) sel = 40;
      else if (Math.abs(arrow) === 1 ? Math.floor((sel + arrow) / 9) === Math.floor(sel / 9) : sel + arrow >= 0 && sel + arrow < 81) sel += arrow;
      paint();
    } else return;
    e.preventDefault(); e.stopPropagation();          // keep Delete from removing the card
  });

  const ok = a => Array.isArray(a) && a.length === 81 && a.every(n => Number.isInteger(n) && n >= 0);
  if (saved && ok(saved.puz) && ok(saved.sol) && ok(saved.val) && ok(saved.notes)) {
    level = SUDOKU_LEVELS[saved.level] ? saved.level : 'easy';
    ({ puz, sol, val, notes } = saved);
    secs = +saved.secs || 0; mistakes = saved.mistakes !== false;
    done = val.every((x, i) => x === sol[i]);
    build(); clockOn();
  } else start(saved && saved.level);

  return {
    grab: e => !grid.contains(e.target) && !pad.contains(e.target),
    menu: () => [
      { info: 'Click a square, then type or tap a number. N switches pencil notes.' },
      { label: 'New game', icon: 'reload', items: Object.entries(SUDOKU_LEVELS).map(([id, l]) => ({ label: l.name, checked: level === id, action: () => start(id) })) },
      { label: 'Mark wrong numbers', checked: mistakes, action() { mistakes = !mistakes; paint(); remember(); } },
      { label: 'Pencil notes', checked: pencil, action() { pencil = !pencil; paint(); } },
    ],
  };
}

/* ================================================================== *
 *  Sliding puzzle: numbers, or your own picture cut into tiles.
 * ================================================================== */
function slider(host, saved, onChange) {
  let n = 4, order, moves = 0, pic = '', numbers = true;   // order[position] = tile id, 0 is the gap
  const root = el('div', 'sld');
  const head = el('div', 'game-head'), movesEl = el('span', 'game-stat dim');
  head.append(el('b', null, 'Puzzle'), movesEl);
  const fit = el('div', 'game-fit'), board = el('div', 'sld-board'), banner = el('div', 'game-banner');
  fit.append(board);
  root.append(head, fit);
  host.append(root);

  const solved = () => order.every((t, i) => t === (i + 1) % (n * n));
  const remember = () => { try { onChange({ n, order, moves, pic, numbers }); } catch { /* host gone */ } };
  function mix() {
    order = Array.from({ length: n * n }, (_, i) => (i + 1) % (n * n));
    let gap = n * n - 1, last = -1;
    for (let k = 0; k < n * n * 40; k++) {              // random legal moves, so it can always be solved
      const r = Math.floor(gap / n), c = gap % n;
      const opts = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < n && b >= 0 && b < n).map(([a, b]) => a * n + b).filter(p => p !== last);
      const p = opts[Math.floor(Math.random() * opts.length)];
      order[gap] = order[p]; order[p] = 0; last = gap; gap = p;
    }
    if (solved()) return mix();
    moves = 0;
  }
  function press(pos) {                                 // slide the tile at `pos` (and any between it and the gap)
    if (solved()) return;
    const gap = order.indexOf(0), r = Math.floor(pos / n), c = pos % n, gr = Math.floor(gap / n), gc = gap % n;
    if (pos === gap || (r !== gr && c !== gc)) return;
    const step = r === gr ? (c < gc ? -1 : 1) : (r < gr ? -n : n);
    for (let p = gap; p !== pos; p += step) { order[p] = order[p + step]; moves++; }
    order[pos] = 0;
    paint(); remember();
  }
  function build() {
    board.style.setProperty('--n', n);
    board.replaceChildren(...Array.from({ length: n * n - 1 }, (_, k) => {
      const id = k + 1, b = el('button', 'sld-tile');
      b.type = 'button'; b.dataset.id = id;
      b.append(el('span', null, id));
      b.addEventListener('click', () => press(order.indexOf(id)));
      return b;
    }), banner);
    paint();
  }
  function paint() {
    for (const b of board.querySelectorAll('.sld-tile')) {
      const id = +b.dataset.id, pos = order.indexOf(id), home = id - 1;
      b.style.setProperty('--r', Math.floor(pos / n)); b.style.setProperty('--c', pos % n);
      b.classList.toggle('pic', !!pic);
      b.classList.toggle('nonum', !!pic && !numbers);
      b.style.backgroundImage = pic ? `url("${pic}")` : '';
      b.style.backgroundSize = pic ? `${n * 100}% ${n * 100}%` : '';
      b.style.backgroundPosition = pic ? `${(home % n) / (n - 1) * 100}% ${Math.floor(home / n) / (n - 1) * 100}%` : '';
    }
    movesEl.textContent = `${moves} move${moves === 1 ? '' : 's'}`;
    const ok = solved();
    banner.textContent = ok ? `Solved in ${moves} moves` : '';
    banner.hidden = !ok;
    board.classList.toggle('done', ok);
    root.setAttribute('aria-label', `Sliding puzzle, ${n} by ${n}.${ok ? ' Solved.' : ''}`);
  }
  const restart = size => { n = size; mix(); build(); remember(); };

  const good = saved && [3, 4, 5].includes(saved.n) && Array.isArray(saved.order) && saved.order.length === saved.n ** 2
    && saved.order.slice().sort((a, b) => a - b).every((v, i) => v === i);
  if (saved) { pic = typeof saved.pic === 'string' && PICTURE.test(saved.pic) ? saved.pic : ''; numbers = saved.numbers !== false; }
  if (good) { n = saved.n; order = saved.order.slice(); moves = +saved.moves || 0; build(); } else { mix(); build(); remember(); }

  return {
    grab: e => !board.contains(e.target),
    menu: () => [
      { info: 'Click a tile next to the gap (or in line with it) to slide it.' },
      { label: 'Shuffle', icon: 'reload', action: () => restart(n) },
      { label: 'Size', icon: 'layers', items: [3, 4, 5].map(s => ({ label: `${s} × ${s}`, checked: n === s, action: () => restart(s) })) },
      { label: 'Use my own picture…', icon: 'media', action: () => pickPicture(600, url => { pic = url; paint(); remember(); }) },
      pic && { label: 'Back to plain numbers', icon: 'x', action() { pic = ''; paint(); remember(); } },
      pic && { label: 'Show the numbers on the picture', checked: numbers, action() { numbers = !numbers; paint(); remember(); } },
    ],
  };
}

/* ================================================================== *
 *  Sound visualiser: moves with what is playing.
 *  "What's playing in Edge" (the default) needs nothing from you: tap.js, which Homeboard runs in
 *  pages, listens to the video or audio playing in any tab (or in a website window on a board) and
 *  sends the levels here. No sharing dialog, no sharing bar. A microphone-type input also works.
 * ================================================================== */
const VIZ_STYLES = { bars: 'Bars', mirror: 'Mirrored bars', wave: 'Waves', line: 'Sound line (oscilloscope)', ring: 'Ring' };
const VIZ_BGS = { none: 'None (floats on the board)', card: 'Card', glass: 'Glass', dark: 'Dark stage', glow: 'Glow from below', cover: 'The cover of what plays' };
const VIZ_COLORS = { accent: 'Theme colour', cover: 'The colours of the cover', rainbow: 'Rainbow', fire: 'Fire', white: 'White' };
const VIZ_BANDS = 96;
function vizBands(analyser, sampleRate, freq) {        // loudness per band, 40 Hz .. 16 kHz, spaced the way we hear
  analyser.getByteFrequencyData(freq);
  const nyq = sampleRate / 2, out = new Array(VIZ_BANDS);
  for (let i = 0; i < VIZ_BANDS; i++) {
    const a = Math.floor(40 * 400 ** (i / VIZ_BANDS) / nyq * freq.length), b = Math.max(a + 1, Math.floor(40 * 400 ** ((i + 1) / VIZ_BANDS) / nyq * freq.length));
    let m = 0;
    for (let k = a; k < b && k < freq.length; k++) if (freq[k] > m) m = freq[k];
    out[i] = m;
  }
  return out;
}
function visualizer(host, saved, onChange) {
  const api = globalThis.browser ?? globalThis.chrome;
  const canTap = !!(api?.tabs?.query && api?.runtime?.onConnect);
  const st = { style: 'bars', color: 'accent', source: 'auto', device: '', off: false, bg: 'none' };
  if (saved && typeof saved === 'object') {
    if (VIZ_STYLES[saved.style]) st.style = saved.style;
    if (VIZ_COLORS[saved.color]) st.color = saved.color;
    if (VIZ_BGS[saved.bg]) st.bg = saved.bg;
    if (saved.source === 'mic') st.source = 'mic';                 // the old "share the computer's sound" became automatic
    if (typeof saved.device === 'string') st.device = saved.device;
    st.off = !!saved.off;
  }
  const root = el('div', 'viz'), canvas = el('canvas'), hint = el('div', 'viz-hint');
  root.append(canvas, hint);
  host.append(root);
  const g = canvas.getContext('2d');
  const keep = () => { try { onChange({ ...st }); } catch { /* host gone */ } };
  let placed = false, born = performance.now();       // the board adds the widget to the page just after making it
  const gone = () => { if (root.isConnected) { placed = true; return false; } return placed || performance.now() - born > 10000; };
  const say = (text, sticky) => { if (hint.textContent !== text) hint.textContent = text; hint.classList.toggle('show', !!sticky); };

  /* ---- where the sound comes from ---- */
  let mic = null;                                      // { ctx, analyser, stream, freq, wave }
  // what plays in the tabs comes from the shared receiver (window.HomeboardAudio), with the waveform asked for
  const A = () => window.HomeboardAudio;
  let inputs = [], listening = false, frame = 0;
  function current() { return listening ? A().now() : null; }
  function stopAll() {
    if (listening) { A().stop({ wave: true }); listening = false; }
    if (mic) { mic.stream.getTracks().forEach(t => t.stop()); mic.ctx.close().catch(() => {}); mic = null; }
  }
  async function start() {
    stopAll();
    root.setAttribute('aria-label', st.off ? 'Sound visualiser, not listening' : 'Sound visualiser, listening');
    if (st.off) { say('click to listen'); return; }
    if (st.source === 'mic') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: st.device ? { exact: st.device } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        inputs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.label);
        const ctx = new AudioContext(), analyser = ctx.createAnalyser();
        analyser.fftSize = 2048; analyser.smoothingTimeConstant = .75;
        ctx.createMediaStreamSource(stream).connect(analyser);
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        mic = { ctx, analyser, stream, freq: new Uint8Array(analyser.frequencyBinCount), wave: new Uint8Array(analyser.fftSize) };
        say('');
      } catch (e) { say(e && e.name === 'NotAllowedError' ? 'The microphone was not allowed.' : 'No microphone-type input could be opened.', true); }
      return;
    }
    if (!canTap) { say('Hearing what plays needs the installed extension', true); return; }
    if (A() && A().available) { A().start({ wave: true }); listening = true; }
  }
  function quit() { stopAll(); cancelAnimationFrame(frame); frame = 0; observer.disconnect(); }

  /* ---- drawing: as many bars as fit nicely, smoothed between updates ---- */
  const shown = new Float32Array(VIZ_BANDS), peaks = new Float32Array(VIZ_BANDS);
  let idleT = 0, wavePhase = 0;
  const tint = (i, n, v) => {
    if (st.color === 'rainbow') return `hsl(${Math.round(i / n * 300)} 90% 62%)`;
    if (st.color === 'fire') return `hsl(${Math.round(8 + v * 44)} 100% ${Math.round(48 + v * 16)}%)`;
    if (st.color === 'white') return '#f4f1e6';
    if (st.color === 'cover' && coverPal) return window.HomeboardHalo.mix(coverPal.vivid, coverPal.light, n > 1 ? Math.abs(i / (n - 1) * 2 - 1) : .5);
    return accent;
  };
  let accent = '#7aa2ff';
  function source() {                                   // { bands: 0..255 x VIZ_BANDS, wave: 0..255 } or null when quiet
    if (mic) return { bands: vizBands(mic.analyser, mic.ctx.sampleRate, mic.freq), wave: (mic.analyser.getByteTimeDomainData(mic.wave), mic.wave) };
    return current();
  }
  function draw() {
    const w = root.clientWidth, h = root.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const src = source();
    idleT += .02;
    let top = 0;
    for (let i = 0; i < VIZ_BANDS; i++) {
      const target = src ? (src.bands[i] / 255) ** 1.35 : .035 + .025 * Math.sin(i * .35 + idleT);   // quiet: a slow, low ripple
      shown[i] += (target - shown[i]) * (target > shown[i] ? .55 : .16);   // quick to rise, gentle to fall
      peaks[i] = Math.max(shown[i], peaks[i] - .008);
      if (shown[i] > top) top = shown[i];
    }
    root.dataset.level = String(Math.round(top * 255));
    g.shadowBlur = document.body.dataset.theme === 'neon' ? 12 : 0;
    const bar = (n, i) => {                             // the bands under bar i of n
      const a = Math.floor(i * VIZ_BANDS / n), b = Math.max(a + 1, Math.floor((i + 1) * VIZ_BANDS / n));
      let m = 0, p = 0;
      for (let k = a; k < b; k++) { if (shown[k] > m) m = shown[k]; if (peaks[k] > p) p = peaks[k]; }
      return [m, p];
    };
    if (st.style === 'wave') {                          // three smooth waves, each swelling with its part of the sound
      let loud = 0; for (let i = 0; i < 48; i++) loud += shown[i]; loud /= 48;
      wavePhase += .025 + loud * .09;
      const layers = [[0, 24, 1, 1.2], [12, 56, .72, 1.9], [36, 96, .48, 2.7]];
      layers.forEach(([a, b, k, f], li) => {
        const pts = 36, ys = [];
        for (let p = 0; p <= pts; p++) {
          const v = shown[a + Math.floor(p / pts * (b - a - 1))];
          const env = Math.sin(p / pts * Math.PI);                       // calm at the edges, full in the middle
          ys.push(h / 2 - Math.sin(p / pts * Math.PI * 2 * f + wavePhase * (1 + li * .35)) * (.12 + v) * env * h * .42 * k);
        }
        const col = tint(li, 3, .7);
        g.beginPath(); g.moveTo(0, ys[0]);
        for (let p = 1; p <= pts; p++) { const x0 = (p - 1) / pts * w, x1 = p / pts * w; g.quadraticCurveTo(x0, ys[p - 1], (x0 + x1) / 2, (ys[p - 1] + ys[p]) / 2); }
        g.lineTo(w, ys[pts]);
        g.save(); g.lineWidth = Math.max(1.5, Math.min(3.5, h / 60)) * (li ? .8 : 1.2); g.lineJoin = g.lineCap = 'round';
        g.strokeStyle = g.shadowColor = col; g.shadowBlur = 10; g.globalAlpha = 1 - li * .22; g.stroke();
        g.lineTo(w, h); g.lineTo(0, h); g.closePath();
        const gr = g.createLinearGradient(0, h * .2, 0, h); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.shadowBlur = 0; g.globalAlpha = .12 - li * .03; g.fill(); g.restore();
      });
    } else if (st.style === 'line') {
      g.lineWidth = Math.max(1.5, Math.min(4, h / 50)); g.lineJoin = 'round'; g.strokeStyle = g.shadowColor = tint(1, 2, .7);
      g.beginPath();
      const wv = src && src.wave, n = wv ? wv.length - 1 : 128;
      for (let i = 0; i <= n; i++) {
        const s = wv ? (wv[i] - 128) / 128 : Math.sin(i / n * 12 + idleT * 3) * .05;
        const x = i / n * w, y = h / 2 + s * h * .46;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    } else if (st.style === 'ring') {
      const R = Math.min(w, h) / 2, r = R * .42, max = R - r - 3;
      const n = Math.max(24, Math.min(96, Math.round(2 * Math.PI * r / 7)));
      g.lineCap = 'round'; g.lineWidth = Math.max(1.5, Math.min(6, 2 * Math.PI * r / n * .5));
      for (let i = 0; i < n; i++) {
        const [v] = bar(n, i), a = i / n * Math.PI * 2 - Math.PI / 2, len = 1.5 + v * max;
        g.strokeStyle = g.shadowColor = tint(i, n, v);
        g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); g.lineTo(w / 2 + Math.cos(a) * (r + len), h / 2 + Math.sin(a) * (r + len)); g.stroke();
      }
    } else {
      const mirror = st.style === 'mirror';
      const n = Math.max(12, Math.min(VIZ_BANDS, Math.round(w / 11)));   // bars about 8 px wide with 3 px between, whatever the size
      const gap = Math.max(1, Math.min(4, w / n * .28)), bw = (w - gap * (n - 1)) / n, rad = Math.min(bw / 2, 3);
      root.dataset.bars = String(n);
      for (let i = 0; i < n; i++) {
        const [v, p] = bar(n, i), x = i * (bw + gap);
        const bh = Math.max(2, v * (mirror ? h * .48 : h - 4));
        g.fillStyle = g.shadowColor = tint(i, n, v);
        g.beginPath();
        if (mirror) g.roundRect(x, h / 2 - bh, bw, bh * 2, Math.min(rad, bh));
        else { g.roundRect(x, h - bh, bw, bh, [Math.min(rad, bh / 2), Math.min(rad, bh / 2), 0, 0]); g.rect(x, h - 2 - p * (h - 4), bw, 1.5); }
        g.fill();
      }
    }
  }
  function loop() {
    if (gone()) { quit(); return; }
    accent = getComputedStyle(root).getPropertyValue('--accent').trim() || accent;
    draw();
    if (!st.off) {
      if (st.source === 'auto' && canTap) {
        const s = listening ? A().status() : { state: 'silent' };
        if (gone()) { quit(); return; }
        if (!current() && s.state === 'blocked') say(`Click once in the “${String(s.title || 'playing').slice(0, 40)}” tab so Homeboard may hear it`, true);
        else say(current() ? '' : 'nothing playing');
      }
    }
    frame = requestAnimationFrame(loop);
  }

  let unCover = null, coverPal = null, unPal = null;
  function coverColours() {                            // the cover's colours, for "The colours of the cover"
    const M = window.HomeboardMusic;
    if (st.color === 'cover' && !unPal && M) unPal = M.subscribe(sg => { if (gone()) { unPal && unPal(); unPal = null; return; } if (sg && sg.art) M.palette(sg.art).then(p => { coverPal = p; }); else coverPal = null; });
    if (st.color !== 'cover' && unPal) { unPal(); unPal = null; }
  }
  function background() {
    coverColours();
    root.dataset.bg = st.bg;
    if (st.bg === 'cover' && !unCover && window.HomeboardMusic) unCover = window.HomeboardMusic.subscribe(sg => {
      if (gone()) { unCover && unCover(); unCover = null; return; }
      root.style.setProperty('--viz-cover', sg && sg.art ? `url("${window.HomeboardMusic.big(sg.art, 600).replace(/"/g, '%22')}")` : 'none');
    });
    if (st.bg !== 'cover' && unCover) { unCover(); unCover = null; }
  }
  background();
  root.addEventListener('click', () => { st.off = !st.off; keep(); start(); });
  const observer = new ResizeObserver(() => { if (gone()) quit(); });
  observer.observe(root);
  start();
  draw();                                             // at once, even before the first frame
  loop();

  const choose = (key, value) => () => { st[key] = value; keep(); };
  return {
    menu: () => [
      { info: st.off ? 'Not listening. Click the widget to start.' : st.source === 'auto' ? 'Moves with whatever plays in Edge: a tab, or a website window on a board. Click it to pause.' : 'Listening to the microphone. Click it to pause.' },
      { label: 'Listen to', icon: 'volume', items: [
        { label: 'What’s playing in Edge (automatic)', checked: st.source === 'auto', action() { st.source = 'auto'; st.device = ''; st.off = false; keep(); start(); } },
        { label: 'Microphone (remembered)', checked: st.source === 'mic' && !st.device, action() { st.source = 'mic'; st.device = ''; st.off = false; keep(); start(); } },
        ...inputs.map(d => ({ label: d.label, checked: st.source === 'mic' && st.device === d.deviceId, action() { st.source = 'mic'; st.device = d.deviceId; st.off = false; keep(); start(); } })),
      ] },
      { label: 'Shape', icon: 'layers', items: Object.entries(VIZ_STYLES).map(([id, name]) => ({ label: name, checked: st.style === id, preview: () => window.HomeboardPreview && window.HomeboardPreview('viz', { ...st, style: id }), action: choose('style', id) })) },
      { label: 'Colour', icon: 'layers', items: Object.entries(VIZ_COLORS).map(([id, name]) => ({ label: name, checked: st.color === id, preview: () => window.HomeboardPreview && window.HomeboardPreview('viz', { ...st, color: id }), action() { st.color = id; keep(); coverColours(); } })) },
      { label: 'Background', icon: 'layers', items: Object.entries(VIZ_BGS).map(([id, name]) => ({ label: name, checked: st.bg === id, preview: () => window.HomeboardPreview && window.HomeboardPreview('viz', { ...st, bg: id }), action() { st.bg = id; keep(); background(); } })) },
    ],
  };
}

/* ---- the audio hub: loudness per band of whatever plays in Edge, for anything that wants it (the screen overlay).
   Asks audible tabs every 1.5 s (tap.js answers with a stream); runs only while someone listens. ---- */
window.HomeboardAudio = window.HomeboardAudio || (() => {
  /* One receiver for the sound levels of every tab, shared by the screen visuals, the live Wave bar, the beat glow
     and the Sound visualiser. Tabs are found through Edge's events (a tab starts or stops making sound), with a slow
     safety check; a tab already sending is never asked again. */
  const api = globalThis.browser ?? globalThis.chrome;
  const can = !!(api?.tabs?.query && api?.runtime?.onConnect);
  const streams = new Map();                            // port -> { bands, wave, at, seen, title, idle, blocked, tab }
  let users = 0, waveUsers = 0, poll = 0;
  const unpack = (str, into) => { const n = str.length; if (!into || into.length !== n) into = new Uint8Array(n); for (let i = 0; i < n; i++) into[i] = str.charCodeAt(i); return into; };
  const onPort = port => {
    if (port.name !== 'homeboard-tap' || !users) return;
    const st = { at: 0, seen: 0, idle: true, blocked: false, title: '', bands: null, wave: null, tab: port.sender?.tab?.id };
    streams.set(port, st);
    port.onMessage.addListener(m => {
      st.seen = performance.now();
      if (m.title != null) st.title = m.title;
      st.idle = !!m.idle; st.blocked = !!m.blocked;
      if (m.idle) return;
      if (typeof m.b === 'string') st.bands = unpack(m.b, st.bands);
      else if (m.bands) st.bands = m.bands;              // a tab still running the older tap.js
      if (typeof m.w === 'string') st.wave = unpack(m.w, st.wave);
      else if (m.wave) st.wave = m.wave;
      st.at = performance.now();
    });
    port.onDisconnect.addListener(() => streams.delete(port));
    if (waveUsers) { try { port.postMessage({ wave: true }); } catch { /* gone */ } }
  };
  const placed = new Set();                             // tabs that got tap.js from here (opened before Homeboard was loaded)
  let audible = [];                                      // [{ id, title }] of tabs making sound
  const sending = id => [...streams.values()].some(st => st.tab === id && performance.now() - st.seen < 3000);
  function poke(id) {                                    // ask one tab to send its levels (once it has a port, it keeps going)
    if (sending(id)) return;
    api.tabs.sendMessage(id, { homeboard: 'tap', on: true, renew: true }).catch(err => {   // renew: its stream may be going to other boards only
      if (!/Receiving end does not exist|Could not establish/i.test(String(err && err.message)) || placed.has(id) || !api.scripting) return;
      placed.add(id);                                    // no listener there yet: add it, then ask again
      api.scripting.executeScript({ target: { tabId: id, allFrames: true }, files: ['tap.js'] })
        .then(() => api.tabs.sendMessage(id, { homeboard: 'tap', on: true }).catch(() => {}), () => {});
    });
  }
  const ask = () => api.tabs.query({ audible: true }).then(tabs => {
    audible = tabs.map(t => ({ id: t.id, title: t.title || '' }));
    for (const t of tabs) poke(t.id);
  }, () => {});
  const onUpdated = (id, info, tab) => {
    if (!('audible' in info)) return;
    if (info.audible) { if (!audible.some(t => t.id === id)) audible.push({ id, title: tab?.title || '' }); poke(id); }
    else audible = audible.filter(t => t.id !== id);
  };
  const onRemoved = id => { audible = audible.filter(t => t.id !== id); placed.delete(id); };
  function start(opts) {
    if (!can) return;
    if (opts && opts.wave && waveUsers++ === 0) for (const p of streams.keys()) { try { p.postMessage({ wave: true }); } catch { /* gone */ } }
    if (users++ === 0) {
      api.runtime.onConnect.addListener(onPort);
      api.tabs.onUpdated?.addListener(onUpdated); api.tabs.onRemoved?.addListener(onRemoved);
      ask(); poll = setInterval(ask, 10000);             // only a safety net: the events above do the work
    }
  }
  function stop(opts) {
    if (!can || users === 0) return;
    if (opts && opts.wave && waveUsers > 0 && --waveUsers === 0) for (const p of streams.keys()) { try { p.postMessage({ wave: false }); } catch { /* gone */ } }
    if (--users === 0) {
      clearInterval(poll);
      api.runtime.onConnect.removeListener(onPort);
      api.tabs.onUpdated?.removeListener(onUpdated); api.tabs.onRemoved?.removeListener(onRemoved);
      for (const p of streams.keys()) { try { p.disconnect(); } catch { /* gone */ } }
      streams.clear();
    }
  }
  function now() {                                       // { bands: 96 x 0..255, wave?: 128 x 0..255, title } of the most recent player, or null
    let best = null;
    for (const st of streams.values()) if (!st.idle && st.bands && (!best || st.at > best.at)) best = st;
    return best && performance.now() - best.at < 600 ? best : null;
  }
  function status() {                                   // for the panels: what is heard, or what to do
    const on = now();
    if (on) return { state: 'hearing', title: on.title || '' };
    const blocked = [...streams.values()].find(st => st.blocked && performance.now() - st.seen < 3000);
    if (blocked) return { state: 'blocked', title: blocked.title || '' };
    if (audible.length) return { state: 'waiting', title: audible[0].title };
    return { state: 'silent', title: '' };
  }
  return { start, stop, now, status, available: can };
})();

REG.viz = { label: 'Sound visualiser', menu: 'Sound visualiser', w: 440, h: 170, bare: true, create: visualizer };
REG.clock = { label: 'Clock', menu: 'Clock', w: 210, h: 230, bare: true, create: clock };
REG.g2048 = { label: '2048', menu: '2048', w: 300, h: 340, bare: true, create: g2048 };
REG.mines = { label: 'Minesweeper', menu: 'Minesweeper', w: 320, h: 360, bare: true, create: mines };
REG.sudoku = { label: 'Sudoku', menu: 'Sudoku', w: 360, h: 450, bare: true, create: sudoku };
REG.slider = { label: 'Sliding puzzle', menu: 'Sliding puzzle', w: 300, h: 340, bare: true, create: slider };

})();
