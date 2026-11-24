/* Homeboard · Look & feel: settings applied, the music overlay, ambient mode, liquid glass, commands, style kits.
   Part 2 of 9 of the board page: classic scripts that share one scope, loaded in order by index.html
   (app/00-core.js … app/08-main.js). See docs/ARCHITECTURE.md. */
'use strict';

/* ------------------------------------------------------------------ *
 *  Look & feel
 * ------------------------------------------------------------------ */
function inkFor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(c => {
    c /= 255;
    return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b > .36 ? '#0b0d12' : '#ffffff';
}

/* Looks: a saved appearance. The general one lives in state.settings; a board may wear a saved one instead. */
const LOOK_KEYS = ['theme', 'accent', 'bg', 'surface', 'raise', 'text', 'pattern', 'bgImage', 'cardAlpha', 'chromeAlpha', 'radius', 'fontSize', 'font', 'material', 'scene', 'musicAccent', 'glassTint', 'glassColor', 'refract'];
/* What cards, bars and menus are made of. */
const MATERIALS = { solid: 'Solid', frosted: 'Frosted glass', liquid: 'Liquid glass', paper: 'Paper', outline: 'Neon outline' };
/* Soft colour fields behind everything (glass needs something to show through). */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .16 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
const SCENES = {                                       // [name, background (null: made from what plays), a little picture for the chip]
  none: ['None', null, 'var(--bg)'],
  aurora: ['Soft colour', 'radial-gradient(55% 45% at 18% 22%, rgba(31,209,164,.45), transparent 70%), radial-gradient(50% 55% at 82% 28%, rgba(122,92,255,.5), transparent 70%), radial-gradient(65% 55% at 50% 108%, rgba(14,107,255,.4), transparent 70%)'],
  cover: ['From the cover', null, 'conic-gradient(from 40deg, #ff6b6b, #ffd93d, #4d96ff, #ff6b6b)'],
  coverart: ['Cover art', null, 'linear-gradient(135deg, #2b2b2b, #6a6a6a)'],
  spotlight: ['Spotlight', 'radial-gradient(34% 75% at 50% -14%, rgba(255,238,210,.62), rgba(255,238,210,.1) 55%, transparent 76%), radial-gradient(130% 80% at 50% 125%, rgba(0,0,0,.7), transparent 60%)'],
  split: ['Split colour', 'linear-gradient(118deg, color-mix(in srgb, var(--accent) 58%, transparent) 0 44%, transparent 44.15%), linear-gradient(118deg, transparent 0 44%, color-mix(in srgb, var(--accent) 22%, rgba(0,0,0,.55)) 44.15%)'],
  grain: ['Film grain', GRAIN + ', radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(0,0,0,.6))'],
};
const OLD_SCENES = { sunset: 'aurora', ocean: 'aurora', forest: 'aurora', rose: 'aurora', dawn: 'aurora', city: 'split', studio: 'spotlight' };
let coverArt = '';                                      // the cover of what plays (for the backdrops that use it)
function sceneCss(key) {
  if (key === 'cover') {                              // made of colour variables (set in applySettings), so a new song fades in
    return coverPalette ? 'radial-gradient(60% 55% at 14% 18%, color-mix(in srgb, var(--cover-a) 85%, transparent), transparent 70%), radial-gradient(60% 60% at 86% 82%, color-mix(in srgb, var(--cover-b) 80%, transparent), transparent 70%), radial-gradient(55% 50% at 80% 10%, color-mix(in srgb, var(--cover-c) 55%, transparent), transparent 70%)' : SCENES.aurora[1];
  }

  if (key === 'coverart') return coverArt ? null : SCENES.aurora[1];
  return SCENES[key]?.[1] || null;
}
/* Style kits: everything chosen to go together, widgets included. */
const KITS = [
  { id: 'liquid', name: 'Liquid glass', theme: 'midnight', material: 'liquid', scene: 'coverart', accent: '#8fd3ff', radius: 20, font: 'system', pattern: 'none', cardAlpha: 100, ytm: 'liquid', frame: 'white' },
  { id: 'gallery', name: 'Gallery', theme: 'paper', material: 'paper', scene: 'spotlight', accent: '#b8891f', radius: 4, font: 'serif', pattern: 'none', cardAlpha: 100, ytm: 'frame', frame: 'gilded' },
  { id: 'neon', name: 'Neon nights', theme: 'neon', material: 'outline', scene: 'split', accent: '#00f0ff', radius: 14, font: 'mono', pattern: 'grid', cardAlpha: 100, ytm: 'ambient', frame: 'gallery' },
  { id: 'sunset', name: 'Album colours', theme: 'graphite', material: 'frosted', scene: 'cover', accent: '#ffb36b', radius: 16, font: 'system', pattern: 'none', cardAlpha: 100, ytm: 'art', frame: 'wood' },
  { id: 'ocean', name: 'Deep ocean', theme: 'midnight', material: 'frosted', scene: 'aurora', accent: '#48cae4', radius: 18, font: 'system', pattern: 'dots', cardAlpha: 100, ytm: 'glass', frame: 'polaroid' },
  { id: 'lounge', name: 'Vinyl lounge', theme: 'graphite', material: 'paper', scene: 'grain', accent: '#e07a5f', radius: 12, font: 'serif', pattern: 'none', cardAlpha: 100, ytm: 'vinyl', frame: 'wood' },
  { id: 'calm', name: 'Calm dawn', theme: 'paper', material: 'liquid', scene: 'aurora', accent: '#6c63ff', radius: 22, font: 'system', pattern: 'none', cardAlpha: 100, ytm: 'pill', frame: 'none' },
  { id: 'mono', name: 'Mono minimal', theme: 'graphite', material: 'solid', scene: 'none', accent: '#e7e9ee', radius: 8, font: 'system', pattern: 'dots', cardAlpha: 100, ytm: 'minimal', frame: 'white' },
];
let musicTint = null, coverPalette = null;                                  // the vivid colour of the cover that plays (for "colours follow the music")
const pickLook = src => Object.fromEntries(LOOK_KEYS.map(k => [k, src[k]]));
function cleanLook(o) {
  const out = pickLook({ ...DEFAULT_SETTINGS, ...(o && typeof o === 'object' ? o : {}) });
  if (!THEMES[out.theme]) out.theme = 'graphite';
  if (!MATERIALS[out.material]) out.material = 'solid';
  if (OLD_SCENES[out.scene]) out.scene = OLD_SCENES[out.scene];
  if (!SCENES[out.scene]) out.scene = 'none';
  out.musicAccent = !!out.musicAccent;
  if (!['theme', 'clear', 'color', 'cover'].includes(out.glassTint)) out.glassTint = 'theme';
  if (!/^#[0-9a-f]{6}$/i.test(out.glassColor || '')) out.glassColor = '#9fc3ff';
  out.refract = out.refract !== false;
  if (typeof out.bgImage !== 'string') out.bgImage = '';
  for (const k of COLOR_KEYS) if (!/^#[0-9a-f]{6}$/i.test(out[k] || '')) out[k] = null;
  return out;
}
const boardLook = () => { const b = board(); return (b.look && state.looks.find(l => l.id === b.look)) || null; };
const lookTarget = () => { const l = boardLook(); return l ? l.s : state.settings; };   // what Customize edits right now
const shown = () => ({ ...state.settings, ...pickLook(lookTarget()) });                  // what is on screen right now
function wearLook(l) {                              // put a saved look on everywhere
  Object.assign(state.settings, structuredClone(l.s));
  applySettings(); syncSettingsUI(); save();
  const own = boardLook();
  if (own && own !== l) toast(`This board keeps its own style, “${own.name}”. The other boards now wear “${l.name}”.`);
}
function renderLooks() {
  const own = boardLook(), b = board();
  $('#look-note').textContent = own ? `This board wears your style “${own.name}”: what you change below changes that style.`
    : state.looks.length ? 'Click one to wear it on every board; the pin keeps it on this board only.' : 'None yet. Save what you see to wear it again later, or to give one board a style of its own.';
  $('#looks').replaceChildren(...state.looks.map(l => {
    const t = THEMES[l.s.theme] || THEMES.graphite, sw = h('i', { class: 'look-swatch' });
    sw.style.background = l.s.bg || t.bg;
    sw.style.setProperty('--s', l.s.surface || t.surface);
    sw.style.setProperty('--a', l.s.accent || t.accent);
    const name = h('button', { class: 'look-name', type: 'button', title: 'Wear this style on every board', onclick() { if (!name.classList.contains('editing')) wearLook(l); } }, l.name);
    const pinned = b.look === l.id;
    return h('div', { class: 'look-row' + (pinned ? ' on' : ''), 'data-look': l.id }, sw, name,
      h('button', { class: 'icon-btn' + (pinned ? ' on' : ''), type: 'button', 'aria-pressed': String(pinned),
        title: pinned ? 'This board wears this style. Click to go back to the style of the other boards.' : 'Wear this style on this board only',
        onclick() { b.look = pinned ? null : l.id; applySettings(); syncSettingsUI(); save(); } }, icon('pin')),
      h('button', { class: 'icon-btn', type: 'button', title: 'Rename, update, delete', 'aria-label': 'Look options',
        onclick(e) {
          const r = e.currentTarget.getBoundingClientRect();
          openMenu(r.left - 150, r.bottom + 4, [
            { label: 'Rename', icon: 'edit', action: () => editInline(name, v => { if (v) { l.name = v.slice(0, 30); save(); } renderLooks(); }) },
            { label: 'Replace with what is on screen', icon: 'reload', action() { l.s = structuredClone(pickLook(shown())); renderLooks(); save(); } },
            { label: 'Delete', icon: 'trash', danger: true, action() {
              state.looks.splice(state.looks.indexOf(l), 1);
              state.boards.forEach(o => { if (o.look === l.id) o.look = null; });
              applySettings(); syncSettingsUI(); save();
            } },
          ]);
        } }, icon('more')));
  }));
}

/* ---- the music overlay: a layer over the whole screen that moves with what plays (like shaders in a game).
   It never takes a click (pointer-events: none), so the boards stay usable through it. Drawn in one canvas. ---- */
const FX_STYLES = { off: 'Off', bottom: 'Bars along the bottom', both: 'Bars top and bottom', sides: 'Bars from the sides', glow: 'Edge glow', waves: 'Waves', bursts: 'Stars on the beat', frost: 'Frost', disco: 'Disco' };
const FX_LOOKS = { glass: 'Clear glass', tinted: 'Tinted glass', neon: 'Neon', solid: 'Solid' };
/* Intensity: how much the board moves, glows and shines, from Calm to Wild. Balanced is the board as designed (all 1).
   fx / fxA: screen visuals strength and opacity; wave: the live wave's swing; sat / light: the backdrop's colour;
   pulse: music cards glow on the beat. Read by widgets-music.js as window.HomeboardVibe. */
const VIBES = [
  { id: 'calm', name: 'Calm', about: 'Still and quiet: soft backdrop colours, gentle screen visuals, the bar decorations rest.', fx: .45, fxA: .55, wave: .3, sat: .55, light: .9, pulse: 0 },
  { id: 'soft', name: 'Soft', about: 'A little movement and muted colours.', fx: .7, fxA: .75, wave: .6, sat: .8, light: .95, pulse: 0 },
  { id: 'balanced', name: 'Balanced', about: 'The board as designed.', fx: 1, fxA: 1, wave: 1, sat: 1, light: 1, pulse: 0 },
  { id: 'lively', name: 'Lively', about: 'Brighter colours, stronger visuals, and the music cards glow on the beat.', fx: 1.25, fxA: 1, wave: 1.3, sat: 1.18, light: 1.03, pulse: .55 },
  { id: 'wild', name: 'Wild', about: 'Everything up: vivid colours, loud visuals, the music cards pulse with every beat.', fx: 1.6, fxA: 1, wave: 1.7, sat: 1.4, light: 1.06, pulse: 1 },
];
const vibe = () => VIBES.find(v => v.id === state.settings.vibe) || VIBES[2];
function applyVibe() {
  const v = vibe(), root = document.documentElement.style;
  document.body.dataset.vibe = v.id;
  root.setProperty('--vibe-sat', v.sat); root.setProperty('--vibe-light', v.light);
  window.HomeboardVibe = v;
  try { fx.refresh(); } catch { /* the overlay is not made yet (first paint) */ }
}
function setVibe(id) {
  state.settings.vibe = id; applyVibe(); save(); syncSettingsUI();
  hud('Intensity: ' + vibe().name);
}
/* the dial: five steps, each with a little level meter */
function vibePicker(after) {
  const cur = vibe();
  return h('div', { class: 'vibe-pick', role: 'radiogroup', 'aria-label': 'Intensity' },
    VIBES.map((v, i) => h('button', { class: 'vibe-opt' + (v === cur ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(v === cur), 'data-vibe': v.id, title: v.name + ': ' + v.about,
      onclick() { setVibe(v.id); if (after) after(); } },
      h('i', { class: 'vibe-glyph', 'aria-hidden': 'true' }, Array.from({ length: 5 }, (_, k) => h('b', { class: k <= i ? 'lit' : '' }))),
      h('span', null, v.name))));
}
const FX_COLORS = { cover: 'From the cover', accent: 'Accent colour', rainbow: 'Rainbow', color: 'Pick a colour' };
const fx = (() => {
  let cv = null, g = null, raf = 0, on = false, alpha = 0, beatAvg = 0, lastBeat = 0; let glowFlow = 0, glowLast = 0; const glowRipples = [];
  const N = 96, shown = new Float32Array(N), parts = [];
  let frostTex = null, frostKey = '', frostLevel = 0, discoT = 0;
  const flares = [], tiles = [];
  /* frost: ice ferns drawn once, white (the colour is laid over them each frame). Feathery: a stem with short side
     branches at 60 degrees, shorter towards the tip, the big ones branching again; thick in the corners, fewer along
     the edges, none in the middle. The music decides how far in they show. */
  function makeFrost(W, H) {
    const c = document.createElement('canvas'), k = Math.min(1, 1600 / Math.max(W, H)); c.width = Math.round(W * k); c.height = Math.round(H * k);
    const x = c.getContext('2d'), w = c.width, hh = c.height, R = Math.random, S = Math.min(w, hh);
    x.lineCap = 'round'; x.strokeStyle = '#fff'; x.fillStyle = '#fff';
    const fern = (px, py, ang, len, depth, width) => {
      if (len < 3) return;
      // the stem, slightly bent
      const bend = (R() - .5) * .5, nx = px + Math.cos(ang + bend * .5) * len, ny = py + Math.sin(ang + bend * .5) * len;
      x.globalAlpha = Math.min(.95, .35 + depth * .18); x.lineWidth = width;
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(ang) * len * .5, py + Math.sin(ang) * len * .5, nx, ny); x.stroke();
      if (depth <= 0) return;
      const gap = Math.max(2.2, len / (6 + depth * 4));
      for (let d = gap; d < len; d += gap * (.8 + R() * .5)) {
        const t = d / len, bx = px + (nx - px) * t, by = py + (ny - py) * t, l2 = len * (.42 - .34 * t) * (.7 + R() * .5);
        for (const side of [1, -1]) {
          const a2 = ang + side * (Math.PI / 3 + (R() - .5) * .25);
          if (depth > 1 && R() < .55) fern(bx, by, a2, l2, depth - 1, width * .6);
          else { x.globalAlpha = .3 + R() * .4; x.lineWidth = Math.max(.5, width * .45); x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(a2) * l2, by + Math.sin(a2) * l2); x.stroke(); }
        }
      }
    };
    const corners = [[0, 0], [w, 0], [0, hh], [w, hh]];
    for (const [cx, cy] of corners) {                     // the corners: many big ferns fanning in
      const toward = Math.atan2(hh / 2 - cy, w / 2 - cx);
      for (let i = 0; i < 12; i++) {
        const r0 = R() * S * .05, a0 = toward + (R() - .5) * 1.7;
        fern(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, a0 + (R() - .5) * .5, S * (.12 + R() * .2), 2 + (R() < .5 ? 1 : 0), 1.3 + R() * .6);
      }
    }
    const along = Math.round((w + hh) / 26);              // the edges: smaller ones
    for (let i = 0; i < along; i++) {
      const side = R() * 4 | 0, d = R() * S * .02;
      let px, py, ang;
      if (side === 0) { px = R() * w; py = d; ang = Math.PI / 2; }
      else if (side === 1) { px = R() * w; py = hh - d; ang = -Math.PI / 2; }
      else if (side === 2) { px = d; py = R() * hh; ang = 0; }
      else { px = w - d; py = R() * hh; ang = Math.PI; }
      fern(px, py, ang + (R() - .5) * 1.2, S * (.05 + R() * .11), 2, 1 + R() * .5);
    }
    for (let i = 0; i < (w + hh) * 3; i++) {               // fine rime: frozen dust, densest at the very edge
      const side = R() * 4 | 0, d = Math.pow(R(), 3) * S * .16;
      const px = side < 2 ? R() * w : side === 2 ? d : w - d, py = side >= 2 ? R() * hh : side === 0 ? d : hh - d;
      x.globalAlpha = .15 + R() * .35; x.fillRect(px, py, 1, 1);
    }
    const out = document.createElement('canvas'); out.width = w; out.height = hh;  // a faint glow under crisp lines
    const o = out.getContext('2d'); o.filter = 'blur(2px)'; o.globalAlpha = .45; o.drawImage(c, 0, 0); o.filter = 'none'; o.globalAlpha = 1; o.drawImage(c, 0, 0);
    return out;
  }
  /* the frosted glass itself: a real blur of what is behind, only near the edges (a mask that follows the music) */
  let haze = null, hazeOn = false, hazeReach = -1, hazeAlpha = -1;
  function frostHaze(show, reach, a) {
    if (!show) { if (hazeOn) { haze.hidden = true; hazeOn = false; } return; }
    if (!haze) { haze = h('div', { id: 'fx-frost', 'aria-hidden': 'true' }); document.body.append(haze); }
    if (!hazeOn) { haze.hidden = false; hazeOn = true; }
    if (Math.abs(reach - hazeReach) > .004) { hazeReach = reach; haze.style.setProperty('--reach', (reach * 100).toFixed(1) + '%'); }
    if (Math.abs(a - hazeAlpha) > .02) { hazeAlpha = a; haze.style.opacity = a.toFixed(2); }
  }
  /* Lively / Wild: the cards with music (YouTube Music, picture frames) glow on the beat. The value goes on those cards
     only (not the whole page), and only when it changes enough. */
  let glowEls = [], glowAt = 0, glowV = 0, glowShown = 0;
  function clearGlow() { for (const el of glowEls) { el.classList.remove('beat'); el.style.removeProperty('--beat'); } glowEls = []; glowV = glowShown = 0; glowAt = 0; }
  function beatGlow(v, now) {
    const P = vibe().pulse;
    if (!P) { if (glowEls.length) clearGlow(); return; }
    if (now - glowAt > 1000) {
      glowAt = now;
      for (const el of glowEls) if (!el.isConnected) el.classList.remove('beat');
      glowEls = [...document.querySelectorAll('#world > .card')].filter(c => c.querySelector('.ytm, .pf'));
      for (const el of glowEls) el.classList.toggle('beat', P > 0);
    }
    glowV = Math.max(v * P, glowV * .88);
    if (!P) glowV = 0;
    if (Math.abs(glowV - glowShown) < .03 && (glowV > 0 || glowShown === 0)) return;
    glowShown = glowV < .02 ? 0 : glowV;
    for (const el of glowEls) { el.style.setProperty('--beat', glowShown.toFixed(2)); if (!P) el.classList.remove('beat'); }
  }
  /* the colour laid over the ice: a gradient for rainbow and cover, one colour otherwise */
  function frostTint(W, H, now, x = g) {
    const o = state.settings;
    if (o.overlayColor === 'rainbow') {
      const t = now / 40, gr = x.createLinearGradient(0, 0, W, H);
      for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, 'hsl(' + ((t + i * 60) % 360) + ' 95% 66%)');
      return gr;
    }
    if (o.overlayColor === 'cover' && coverPalette) {
      const gr = x.createLinearGradient(0, 0, W, H), [a, b] = blendedCover(), rgb = c => `rgb(${c.map(Math.round).join(',')})`;
      gr.addColorStop(0, rgb(a)); gr.addColorStop(.5, rgb(b)); gr.addColorStop(1, rgb(a));
      return gr;
    }
    return colourAt(0, 1, 1);
  }
  const hexRgb = h6 => [1, 3, 5].map(i => parseInt(h6.slice(i, i + 2), 16));
  /* the cover's two colours as the visuals show them: they move toward a new song's over about a second and a half */
  let blendA = null, blendB = null, blendAt = 0;
  function blendedCover() {
    const ta = hexRgb(coverPalette.vivid), tb = hexRgb(coverPalette.light), now = performance.now();
    if (!blendA) { blendA = ta.slice(); blendB = tb.slice(); }
    const k = Math.min(1, (now - (blendAt || now)) / 1000 * 2.2); blendAt = now;
    for (let j = 0; j < 3; j++) { blendA[j] += (ta[j] - blendA[j]) * k; blendB[j] += (tb[j] - blendB[j]) * k; }
    return [blendA, blendB];
  }
  let accentNow = '', drawn = true, frostCache = null, frostCacheKey = '', idleWait = 0;
  function style() { return ambient.on && state.settings.overlay === 'off' ? 'glow' : state.settings.overlay; }
  function refresh() {
    const want = (style() !== 'off' || vibe().pulse > 0) && !!window.HomeboardAudio?.available;
    if (want === on) return;
    on = want;
    if (on) {
      if (!cv) { cv = h('canvas', { id: 'fx-layer', 'aria-hidden': 'true' }); document.body.append(cv); g = cv.getContext('2d'); }
      window.HomeboardAudio.start();
      raf = requestAnimationFrame(frame);
    } else {
      window.HomeboardAudio?.stop();
      cancelAnimationFrame(raf); raf = 0; clearTimeout(idleWait);
      frostHaze(false);
      clearGlow();
      if (g) g.clearRect(0, 0, cv.width, cv.height);
    }
  }
  function colourAt(i, n, t) {                         // the colour of bar i of n (t: 0..1 loudness)
    const o = state.settings;
    if (o.overlayColor === 'rainbow') return `hsl(${(i / n * 300 + performance.now() / 60) % 360} 90% 65%)`;
    if (o.overlayColor === 'color') return o.overlayHex;
    if (o.overlayColor === 'cover' && coverPalette) { const [a, b] = blendedCover(); const k = i / Math.max(1, n - 1); return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`; }
    return accentNow || (accentNow = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7aa2ff');   // read once per frame
  }
  /* one bar in the chosen look: clear glass (light edges, a highlight, a little glow), tinted glass, neon or solid */
  function bar(x, y, w, hh, col, edge) {
    if (w < 1 || hh < 1) return;
    const look = state.settings.overlayLook, r = Math.min(w, hh) * .35;
    g.save();
    g.beginPath(); g.roundRect(x, y, w, hh, r);
    if (look === 'neon') { g.shadowColor = col; g.shadowBlur = 16; g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.restore(); return; }
    if (look === 'solid') { g.shadowColor = col; g.shadowBlur = 10; g.fillStyle = col; g.globalAlpha *= .9; g.fill(); g.restore(); return; }
    const vertical = edge === 'bottom' || edge === 'top';
    const grad = vertical ? g.createLinearGradient(0, y, 0, y + hh) : g.createLinearGradient(x, 0, x + w, 0);
    const tint = look === 'tinted' ? col : 'rgba(255,255,255,1)';
    g.globalAlpha *= look === 'tinted' ? .55 : .9;
    grad.addColorStop(0, tint); grad.addColorStop(1, tint);
    g.fillStyle = grad;
    g.globalAlpha *= look === 'tinted' ? .6 : .1;
    g.shadowColor = col; g.shadowBlur = 18;
    g.fill();
    g.shadowBlur = 0;
    g.globalAlpha /= look === 'tinted' ? .6 : .1;
    g.strokeStyle = look === 'tinted' ? 'rgba(255,255,255,.55)' : col; g.lineWidth = 1.2; g.globalAlpha *= .9; g.stroke();
    g.beginPath();                                      // the highlight along the lit edge
    if (vertical) { const yy = edge === 'top' ? y + hh - 3 : y + 3; g.moveTo(x + r * .6, yy); g.lineTo(x + w - r * .6, yy); }
    else { const xx = edge === 'left' ? x + w - 3 : x + 3; g.moveTo(xx, y + r * .6); g.lineTo(xx, y + hh - r * .6); }
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5; g.stroke();
    g.restore();
  }
  function level(a, b) { let m = 0; for (let k = a; k < b; k++) if (shown[k] > m) m = shown[k]; return m; }
  function frame(now) {
    if (!on) return;
    raf = requestAnimationFrame(frame);
    accentNow = '';
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    const draws = style() !== 'off';                  // off: only the beat glow (Lively / Wild) runs, nothing is drawn
    if (!draws) {
      if (drawn) { g.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; drawn = false; }
    } else {
      if (!drawn) { cv.style.display = ''; drawn = true; }
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
    }
    const src = window.HomeboardAudio.now(), o = state.settings, V = vibe(), power = (o.overlayPower || 100) / 100 * V.fx;
    alpha += ((src ? 1 : 0) - alpha) * (src ? .08 : .03);          // fades in with sound, out with silence
    if (alpha < .01 || style() !== 'frost') frostHaze(false);
    if (alpha < .01) beatGlow(0, now);
    if (alpha < .01) {                                // nothing heard: look again 5 times a second, not every frame
      cancelAnimationFrame(raf); raf = 0;
      clearTimeout(idleWait); idleWait = setTimeout(() => { if (on && !raf) raf = requestAnimationFrame(frame); }, 200);
      return;
    }
    for (let i = 0; i < N; i++) {
      const target = src ? Math.min(1, (src.bands[i] / 255) ** 1.4 * power) : 0;
      shown[i] += (target - shown[i]) * (target > shown[i] ? .5 : .12);
    }
    g.globalAlpha = Math.min(1, alpha * (o.overlayAlpha || 85) / 100 * V.fxA);
    const st = style();
    const bass = level(0, 8);
    beatAvg = beatAvg * .96 + bass * .04;
    const beat = bass > .3 && bass > beatAvg * 1.35 && now - lastBeat > 220;
    if (beat) lastBeat = now;
    beatGlow(beat ? 1 : bass * .55, now);
    if (st === 'bottom' || st === 'both') {
      const n = Math.max(16, Math.floor(W / 30)), w = W / n;
      for (let i = 0; i < n; i++) {
        const v = level(Math.floor(i * N / n), Math.max(Math.floor(i * N / n) + 1, Math.floor((i + 1) * N / n)));
        const hh = v * H * .3;
        bar(i * w + w * .18, H - hh - 2, w * .64, hh, colourAt(i, n, v), 'bottom');
        if (st === 'both') { const j = n - 1 - i, v2 = level(Math.floor(j * N / n), Math.floor(j * N / n) + 1), h2 = v2 * H * .22; bar(i * w + w * .18, 2, w * .64, h2, colourAt(j, n, v2), 'top'); }
      }
    } else if (st === 'sides') {
      const n = Math.max(10, Math.floor(H / 28)), hh = H / n;
      for (let i = 0; i < n; i++) {
        const b = n - 1 - i, v = level(Math.floor(b * N / n), Math.max(Math.floor(b * N / n) + 1, Math.floor((b + 1) * N / n)));
        const len = v * W * .26;
        bar(2, i * hh + hh * .2, len, hh * .6, colourAt(b, n, v), 'left');
        bar(W - len - 2, i * hh + hh * .2, len, hh * .6, colourAt(b, n, v), 'right');
      }
    } else if (st === 'glow') {
      /* light all around the screen's edge, made of the music itself (like a voice assistant's glow): the bass along the
         bottom, the mids up the sides, the highs along the top; the colours flow around, faster when it is loud; every
         beat sends a ripple from the bottom up both sides. Nothing moves on its own: quiet music, a quiet edge. */
      const K = 96, per = 2 * (W + H), energy = level(0, 96);
      glowFlow = (glowFlow + (.015 + energy * .22) * (now - (glowLast || now)) / 1000) % 1; glowLast = now;
      if (beat) glowRipples.push(now);
      while (glowRipples.length && now - glowRipples[0] > 1100) glowRipples.shift();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha *= .5;
      for (let k = 0; k < K; k++) {
        const p = (k + .5) / K;                         // 0 = bottom centre, going right, up, across the top, down, back
        let d = p * per - W / 2, x, y;                   // walk the edge from the bottom centre
        if (d < 0) d += per;
        if (d < W / 2) { x = W / 2 + d; y = H; } else if ((d -= W / 2) < H) { x = W; y = H - d; } else if ((d -= H) < W) { x = W - d; y = 0; } else if ((d -= W) < H) { x = 0; y = d; } else { x = d - H; y = H; }
        const up = Math.min(p, 1 - p) * 2;             // 0 at the bottom centre, 1 at the top centre
        const band = Math.min(N - 2, Math.floor(up ** 1.3 * (N - 8)));
        let v = level(band, band + 6);
        for (const r0 of glowRipples) { const front = (now - r0) / 1100, gap = Math.abs(up - front); if (gap < .12) v += (1 - gap / .12) * .55 * (1 - front); }   // the beat travelling up
        const rr = per / K * .95 + Math.min(1.2, v) * 115 * Math.min(1.5, power);   // never narrower than the gap to the next one (no beads)
        const col = colourAt(Math.round(((p + glowFlow) % 1) * 64), 64, v);
        const gr = g.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = Math.min(1, alpha * (o.overlayAlpha || 85) / 100 * V.fxA) * (.09 + Math.min(1, v) * .42);
        g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      g.globalCompositeOperation = 'source-over';
    } else if (st === 'waves') {
      const layers = [[0, 40, .26], [16, 70, .18], [40, 96, .12]];
      layers.forEach(([a, b, hgt], li) => {
        const col = colourAt(li, 3, .7);
        g.beginPath(); g.moveTo(0, H);
        const pts = 48;
        for (let k = 0; k <= pts; k++) {
          const x = k / pts * W, band = a + Math.floor(k / pts * (b - a - 1)), y = H - 4 - shown[band] * H * hgt - Math.sin(k / 3 + now / 600 + li) * 6 * alpha;
          if (k === 0) g.lineTo(x, y); else { const px = (k - .5) / pts * W; g.quadraticCurveTo(px, y, x, y); }
        }
        g.lineTo(W, H); g.closePath();
        const gr = g.createLinearGradient(0, H - H * hgt, 0, H); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.save(); g.globalAlpha *= .35; g.fillStyle = gr; g.fill(); g.restore();
        g.save(); g.shadowColor = col; g.shadowBlur = 14; g.strokeStyle = col; g.lineWidth = 2; g.globalAlpha *= .9; g.stroke(); g.restore();
      });
    } else if (st === 'frost') {
      const key = W + 'x' + H;
      if (frostKey !== key) { frostTex = makeFrost(W, H); frostKey = key; }
      let sum = 0; for (let i = 0; i < 64; i++) sum += shown[i];
      const loud = Math.min(1, sum / 64 * 2.4);
      frostLevel += (loud - frostLevel) * (loud > frostLevel ? .08 : .015);   // grows quickly, melts slowly
      const reach = .14 + frostLevel * .5;              // how far in from the edges, as a share of the half-screen
      frostHaze(true, Math.min(reach, .3), Math.min(1, g.globalAlpha * 1.15));   // the frosted blur stays in the outer band, whatever the ice does
      const oc = state.settings.overlayColor;
      const tKey = oc === 'rainbow' ? 'r' + Math.floor(now / 120) : oc === 'cover' ? 'c' + (coverPalette ? blendedCover()[0].map(v => Math.round(v / 6)).join('.') : '') : oc === 'color' ? state.settings.overlayHex : 'a' + colourAt(0, 1, 1);
      const ck = Math.round(reach * 60) + '|' + tKey + '|' + frostKey;
      if (ck !== frostCacheKey) {                        // only when the reach or the colour moved on: not every frame
        frostCacheKey = ck;
        const fw = frostTex.width, fh = frostTex.height;
        if (!frostCache) frostCache = document.createElement('canvas');
        if (frostCache.width !== fw || frostCache.height !== fh) { frostCache.width = fw; frostCache.height = fh; }
        const x = frostCache.getContext('2d');
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, fw, fh);
        x.drawImage(frostTex, 0, 0);
        x.globalCompositeOperation = 'destination-in';   // keep the ice only near the edges, deeper when it is loud
        x.save(); x.translate(fw / 2, fh / 2); x.scale(fw / 2, fh / 2);
        const inner = Math.max(0, 1 - reach), m = x.createRadialGradient(0, 0, 0, 0, 0, 1.42);
        m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(Math.min(.98, inner), 'rgba(0,0,0,0)'); m.addColorStop(Math.min(1, inner + .2), 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,1)');
        x.fillStyle = m; x.fillRect(-1.5, -1.5, 3, 3); x.restore();
        x.globalCompositeOperation = 'source-atop'; x.globalAlpha = .62; x.fillStyle = frostTint(fw, fh, now, x); x.fillRect(0, 0, fw, fh);   // the colour, over the ice only
      }
      g.save();
      g.globalAlpha *= .7 + frostLevel * .3;
      g.drawImage(frostCache, 0, 0, W, H);
      g.restore();
      const spark = colourAt(Math.random() * 6 | 0, 6, 1);
      if (beat) for (let k = 0; k < 14; k++) { const e = Math.random() * 4 | 0, d = Math.random() * Math.min(W, H) * reach * .35; parts.push({ x: e === 2 ? d : e === 3 ? W - d : Math.random() * W, y: e === 0 ? d : e === 1 ? H - d : Math.random() * H, life: 1, sparkle: true, col: spark }); }
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k]; if (!p.sparkle) continue;
        p.life -= .035; if (p.life <= 0) { parts.splice(k, 1); continue; }
        g.save(); g.globalAlpha *= p.life; g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.shadowColor = p.col || '#bfe8ff'; g.shadowBlur = 10;
        const r = 4 + (1 - p.life) * 7; g.beginPath(); g.moveTo(p.x - r, p.y); g.lineTo(p.x + r, p.y); g.moveTo(p.x, p.y - r); g.lineTo(p.x, p.y + r);
        g.moveTo(p.x - r * .5, p.y - r * .5); g.lineTo(p.x + r * .5, p.y + r * .5); g.moveTo(p.x + r * .5, p.y - r * .5); g.lineTo(p.x - r * .5, p.y + r * .5); g.stroke(); g.restore();
      }
    } else if (st === 'disco') {                       // a mirror ball, its reflections sweeping the room, coloured spots, a floor
      discoT += .016 * (1 + bass * 2);
      const mid = level(8, 40), high = level(40, 96), bx = W / 2, by = 62, br = 40;
      const hue = i => (state.settings.overlayColor === 'color' ? state.settings.overlayHex : 'hsl(' + ((i * 61 + discoT * 50) % 360) + ' 95% 62%)');   // a disco is colourful unless one colour is picked
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {                      // spotlights that sweep
        const sx = W * (.5 + .42 * Math.sin(discoT * (.7 + i * .23) + i * 2)), sy = H * (.55 + .3 * Math.cos(discoT * (.5 + i * .17) + i));
        const rr = 120 + bass * 220, gr = g.createRadialGradient(sx, sy, 0, sx, sy, rr);
        gr.addColorStop(0, hue(i * 2)); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = (.18 + bass * .35) * alpha; g.fillStyle = gr; g.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
      }
      const dots = 140;                                  // reflections of the ball turning around the room
      for (let i = 0; i < dots; i++) {
        const a = (i * 2.399 + discoT * .6) % (Math.PI * 2), ring = (i * .618) % 1;
        const x = bx + Math.cos(a) * W * (.15 + ring * .75), y = by + 40 + Math.abs(Math.sin(a * 1.3 + i)) * H * (.25 + ring * .7);
        const r = 1.4 + ring * 2.4 + high * 2;
        g.globalAlpha = (.35 + mid * .65) * alpha; g.fillStyle = i % 3 === 0 ? '#fff' : hue(i);
        g.shadowColor = g.fillStyle; g.shadowBlur = 8;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.shadowBlur = 0;
      for (let i = 0; i < 6; i++) {                      // beams from the ball
        const a = discoT * .8 + i * Math.PI / 3, len = Math.max(W, H);
        const gr = g.createLinearGradient(bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len);
        gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = (.08 + bass * .25) * alpha; g.strokeStyle = gr; g.lineWidth = 2 + bass * 6;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len); g.stroke();
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = alpha;
      g.strokeStyle = 'rgba(200,200,200,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx, 0); g.lineTo(bx, by - br); g.stroke();   // the ball, faceted, turning
      g.save(); g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#555'; g.fillRect(bx - br, by - br, br * 2, br * 2);
      const step = 7, off = (discoT * 14) % step;
      for (let yy = -br; yy < br; yy += step) for (let xx = -br - step; xx < br + step; xx += step) {
        const lit = Math.sin((xx + off) * .37 + yy * .51 + discoT * 3) * .5 + .5;
        g.fillStyle = 'rgba(' + (150 + lit * 105 | 0) + ',' + (150 + lit * 105 | 0) + ',' + (165 + lit * 90 | 0) + ',1)';
        g.fillRect(bx + xx + off, by + yy, step - 1, step - 1);
      }
      const sh = g.createRadialGradient(bx - br * .35, by - br * .35, 2, bx, by, br); sh.addColorStop(0, 'rgba(255,255,255,.5)'); sh.addColorStop(1, 'rgba(0,0,0,.45)');
      g.fillStyle = sh; g.fillRect(bx - br, by - br, br * 2, br * 2); g.restore();
      if (beat) for (let k = 0; k < 3; k++) flares.push({ x: Math.random() * W, y: Math.random() * H * .6, life: 1, size: 20 + Math.random() * 40 });
      g.globalCompositeOperation = 'lighter';
      for (let k = flares.length - 1; k >= 0; k--) {     // star flares on the beat
        const f = flares[k]; f.life -= .035; if (f.life <= 0) { flares.splice(k, 1); continue; }
        g.globalAlpha = f.life * alpha; g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.shadowColor = '#fff'; g.shadowBlur = 12;
        const r = f.size * (1.2 - f.life * .2); g.beginPath();
        g.moveTo(f.x - r, f.y - r); g.lineTo(f.x + r, f.y + r); g.moveTo(f.x + r, f.y - r); g.lineTo(f.x - r, f.y + r);
        g.moveTo(f.x - r * 1.4, f.y); g.lineTo(f.x + r * 1.4, f.y); g.moveTo(f.x, f.y - r * 1.4); g.lineTo(f.x, f.y + r * 1.4); g.stroke();
      }
      g.shadowBlur = 0;
      const rows = 5, cols = 12, top = H * .8;            // the floor: tiles that light on the beat
      if (beat || !tiles.length) { tiles.length = 0; for (let k = 0; k < rows * cols; k++) tiles.push(Math.random() < .35 ? 1 + (Math.random() * 6 | 0) : 0); }
      for (let r = 0; r < rows; r++) {
        const y0 = top + (H - top) * (r / rows), y1 = top + (H - top) * ((r + 1) / rows), s0 = .55 + .45 * r / rows, s1 = .55 + .45 * (r + 1) / rows;
        for (let c2 = 0; c2 < cols; c2++) {
          const t = tiles[r * cols + c2]; if (!t) continue;
          const xa = W / 2 + (c2 / cols - .5) * W * s0, xb = W / 2 + ((c2 + 1) / cols - .5) * W * s0, xc = W / 2 + ((c2 + 1) / cols - .5) * W * s1, xd = W / 2 + (c2 / cols - .5) * W * s1;
          g.globalAlpha = (.12 + bass * .3) * alpha; g.fillStyle = hue(t);
          g.beginPath(); g.moveTo(xa + 2, y0 + 1); g.lineTo(xb - 2, y0 + 1); g.lineTo(xc - 2, y1 - 1); g.lineTo(xd + 2, y1 - 1); g.closePath(); g.fill();
        }
      }
      g.restore();
    } else if (st === 'bursts') {                      // stars that open on the beat in the corners, and a ribbon that follows the music
      if (beat) for (const [cx, cy] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]]) parts.push({ x: cx, y: cy, r: 10, life: 1, rot: Math.random() * 6, col: colourAt(Math.floor(Math.random() * 8), 8, 1) });
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k];
        p.r += 3 + bass * 6; p.life -= .022; p.rot += .02;
        if (p.life <= 0) { parts.splice(k, 1); continue; }
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha *= p.life * .8;
        g.beginPath();
        for (let j = 0; j < 16; j++) { const rr = j % 2 ? p.r * .45 : p.r, an = j / 16 * Math.PI * 2; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        g.closePath(); g.shadowColor = p.col; g.shadowBlur = 18; g.strokeStyle = p.col; g.lineWidth = 2.5; g.stroke();
        g.fillStyle = p.col; g.globalAlpha *= .12; g.fill(); g.restore();
      }
      if (parts.length > 60) parts.splice(0, parts.length - 60);
      g.beginPath();
      for (let k = 0; k <= 64; k++) { const x = k / 64 * W, y = H * .82 - (shown[Math.floor(k / 64 * 60)] - .2) * H * .25 * Math.sin(k / 64 * Math.PI); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      const col = colourAt(2, 4, .8);
      g.save(); g.shadowColor = col; g.shadowBlur = 16; g.strokeStyle = col; g.lineWidth = 3; g.lineCap = 'round'; g.stroke(); g.restore();
    }
    g.globalAlpha = 1;
  }
  return { refresh };
})();

/* ---- ambient mode: the bars and buttons fade away, the overlay runs, the boards stay usable; Esc comes back ---- */
const ambient = (() => {
  let hideCursor = 0;
  const api2 = {
    on: false,
    toggle(want = !api2.on) {
      api2.on = want;
      document.body.classList.toggle('ambient', want);
      fx.refresh();
      clearTimeout(hideCursor);
      if (want) hud(state.settings.overlay === 'off' ? 'Ambient · Esc to come back (choose an overlay in Customize)' : 'Ambient · Esc to come back');
    },
  };
  addEventListener('pointermove', () => {               // in ambient, the pointer hides after a few still seconds
    if (!api2.on) return;
    document.body.classList.remove('ambient-still');
    clearTimeout(hideCursor);
    hideCursor = setTimeout(() => api2.on && document.body.classList.add('ambient-still'), 3000);
  }, { passive: true });
  return api2;
})();

/* ---- liquid glass that bends the light: an SVG displacement map per size (Chromium can use an SVG filter as a
   backdrop-filter, as in kube.io's write-up); the edges push what is behind inward, like a thick lens. ---- */
const lens = (() => {
  let defs = null, enabled = false;
  const made = new Map(), watched = new WeakMap();
  const ro = new ResizeObserver(entries => { for (const e of entries) dress(e.target); });
  function mapFor(w, hh, r) {                          // R/G hold the push in x/y, 128 = none
    const k = 2, W = Math.max(8, Math.round(w / k)), H = Math.max(8, Math.round(hh / k)), rr = r / k, bevel = Math.min(16, Math.min(W, H) / 4);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + .5 - W / 2, py = y + .5 - H / 2, qx = Math.abs(px) - (W / 2 - rr), qy = Math.abs(py) - (H / 2 - rr);
      const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;   // distance to the rounded edge (negative inside)
      const dist = -out;
      let dx = 0, dy = 0;
      if (dist < bevel && dist >= 0) {
        let nx, ny;
        if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; nx = qx / l * Math.sign(px); ny = qy / l * Math.sign(py); }
        else if (qx > qy) { nx = Math.sign(px); ny = 0; } else { nx = 0; ny = Math.sign(py); }
        const t = 1 - dist / bevel, amt = t * t * (3 - 2 * t);
        dx = -nx * amt; dy = -ny * amt;
      }
      const i = (y * W + x) * 4;
      d[i] = 128 + dx * 127; d[i + 1] = 128 + dy * 127; d[i + 2] = 128; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }
  function filterFor(w, hh, r) {
    const key = `${w}x${hh}x${r}`;
    if (made.has(key)) return made.get(key);
    if (!defs) { const host = svg('svg', { width: 0, height: 0, style: 'position:absolute;width:0;height:0', 'aria-hidden': 'true' }); defs = svg('defs'); host.append(defs); document.body.append(host); }
    const id = 'hb-lens-' + made.size;
    const f = svg('filter', { id, x: 0, y: 0, width: w, height: hh, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
    f.append(svg('feImage', { href: mapFor(w, hh, r), x: 0, y: 0, width: w, height: hh, preserveAspectRatio: 'none', result: 'map' }),
      svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: Math.min(48, Math.max(18, Math.min(w, hh) / 6)), xChannelSelector: 'R', yChannelSelector: 'G' }));
    defs.append(f);
    made.set(key, id);
    if (made.size > 80) { defs.firstChild?.remove(); made.delete(made.keys().next().value); }
    return id;
  }
  /* The bending is the most work the GPU does for Homeboard: only cards on screen get it, and with many cards in view
     they keep the plain glass (the bars and menus always bend). Nothing is redone for a card whose size did not change. */
  const dressed = new WeakMap();
  let crowd = false;
  function dress(el, force) {
    const card = el.classList.contains('card');
    // a card that holds a page (a website, a component, a PDF) never gets the bending: Edge would draw the page itself
    // through the filter, blurred and smeared (found in 2.0: website cards unreadable on liquid glass)
    if (!enabled || !el.isConnected || (card && (crowd || el.classList.contains('offscreen') || el.querySelector('iframe, embed, object')))) {
      if (dressed.has(el)) { el.style.removeProperty('backdrop-filter'); dressed.delete(el); }
      return;
    }
    const w = Math.round(el.offsetWidth / 8) * 8, hh = Math.round(el.offsetHeight / 8) * 8;
    if (w < 24 || hh < 24) return;
    if (!force && dressed.get(el) === w + 'x' + hh) return;
    const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, hh / 2);
    el.style.setProperty('backdrop-filter', `url(#${filterFor(w, hh, Math.round(r))}) blur(2px) saturate(1.8) brightness(1.05)`);
    dressed.set(el, w + 'x' + hh);
  }
  const targets = () => [...document.querySelectorAll('.pill, #menu, #np-panel, #finder, #world > .card:not(.bare)')];
  function sweep(force) {
    crowd = document.querySelectorAll('#world > .card:not(.bare):not(.offscreen):not(.away)').length > 14;
    for (const el of targets()) { if (!watched.has(el)) { watched.set(el, 1); ro.observe(el); } dress(el, force === true); }
  }
  new MutationObserver(() => { if (enabled) requestAnimationFrame(sweep); }).observe(document.body, { childList: true, subtree: false });
  return {
    update(want) {
      if (!CSS.supports('backdrop-filter', 'url(#x)')) want = false;
      if (want === enabled) { if (want) sweep(true); return; }   // the look may have changed (roundness): redo
      enabled = want;
      document.body.classList.toggle('lens', want);
      if (want) sweep(); else for (const el of document.querySelectorAll('[style*="backdrop-filter"]')) el.style.removeProperty('backdrop-filter');
    },
    sweep,
    seen(el) { if (enabled) { const was = crowd; crowd = document.querySelectorAll('#world > .card:not(.bare):not(.offscreen):not(.away)').length > 14; if (was !== crowd) sweep(); else dress(el); } },
  };
})();

/* ---- commands: typed in the search box (start with > to see them all) ---- */
function commandOrder(cq) {                           // the commands that fit, those whose name has every word first
  const words = cq.split(/\s+/).filter(Boolean), list = commandList();
  if (!words.length) return list;
  return list.map(c => { const name = fold(c.label), all = fold(c.label + ' ' + c.words); return { c, ok: words.every(w => all.includes(w)), named: words.every(w => name.includes(w)) }; })
    .filter(x => x.ok).sort((a, b) => b.named - a.named).map(x => x.c);
}
function commandList() {
  const set = (k, v) => () => { state.settings[k] = v; fx.refresh(); save(); syncSettingsUI(); hud(`${{ overlay: 'Overlay', overlayLook: 'Overlay look', overlayColor: 'Overlay colour' }[k]}: ${(k === 'overlay' ? FX_STYLES : k === 'overlayLook' ? FX_LOOKS : FX_COLORS)[v]}`); };
  const look = (k, v, label) => () => { lookTarget()[k] = v; applySettings(); syncSettingsUI(); save(); hud(label); };
  return [
    { label: ambient.on ? 'Leave ambient mode' : 'Ambient mode (hide the bars, music visuals on)', words: 'ambient idle screensaver relax watch', run: () => ambient.toggle() },
    ...Object.entries(FX_STYLES).map(([k, n]) => ({ label: k === 'off' ? 'Music overlay off' : `Music overlay: ${n}`, words: 'overlay visualizer visualiser music shader layer', run: set('overlay', k) })),
    ...Object.entries(FX_LOOKS).map(([k, n]) => ({ label: `Overlay look: ${n}`, words: 'overlay look', run: set('overlayLook', k) })),
    ...Object.entries(FX_COLORS).filter(([k]) => k !== 'color').map(([k, n]) => ({ label: `Overlay colour: ${n}`, words: 'overlay colour color', run: set('overlayColor', k) })),
    ...KITS.map(k => ({ label: `Style kit: ${k.name}`, words: 'style kit theme look ' + k.name, run: () => applyKit(k) })),
    { label: 'Shuffle the style', words: 'shuffle random style fresh new look', run: shuffleStyle },
    { label: 'Your own CSS for the board', words: 'css style custom code own look design', run: styleBoard },
    ...VIBES.map(v => ({ label: `Intensity: ${v.name}`, words: 'intensity vibe energy stimulation calm quiet wild loud ' + v.id, run: () => setVibe(v.id) })),
    ...Object.entries(MATERIALS).map(([k, n]) => ({ label: `Material: ${n}`, words: 'material', run: look('material', k, 'Material: ' + n) })),
    ...[['theme', 'Theme'], ['clear', 'Clear'], ['cover', 'From the cover']].map(([k, n]) => ({ label: `Glass colour: ${n}`, words: 'glass colour color tint', run: look('glassTint', k, 'Glass colour: ' + n) })),
    ...Object.entries(SCENES).map(([k, [n]]) => ({ label: `Backdrop: ${n}`, words: 'backdrop background scene', run: look('scene', k, 'Backdrop: ' + n) })),
    { label: 'Colours follow the music: ' + (shown().musicAccent ? 'off' : 'on'), words: 'colours colors music cover accent', run: () => { lookTarget().musicAccent = !shown().musicAccent; applySettings(); save(); } },
    { label: 'View map', words: 'views map arrange', run: viewMapOpen },
    { label: 'Now playing', words: 'music playing media pause', run: () => nowPlaying.open() },
    { label: 'Customize', words: 'settings customize theme', run: () => { panel.hidden = false; syncSettingsUI(); } },
    { label: board().frozen ? 'Unlock the view' : 'Lock the view', words: 'lock freeze view', run: () => { const b = board(); b.frozen = !b.frozen; document.body.classList.toggle('view-locked', b.frozen); save(); } },
    { label: 'Fit everything on screen', words: 'fit zoom all', run: fitView },
    ...Object.entries(TYPES).filter(([, t]) => t.menu).map(([type, t]) => ({ label: t.menu, words: 'new add create ' + t.label, run: () => addCard(type) })),
    { label: 'New board', words: 'new board add', run: () => addBoard() },
  ];
}

/* ---- Style: kits, Shuffle, material, backdrop, colours from the music ---- */
function restyleWidgets(kit) {                          // the widgets on every board follow the kit
  const before = new Map();
  for (const b of state.boards) for (const c of b.cards) {
    if (c.type !== 'widget' || !(c.widget === 'ytm' || c.widget === 'frame')) continue;
    before.set(c, structuredClone(c.data || {}));
    c.data = { ...(c.data || {}), ...(c.widget === 'ytm' ? { look: kit.ytm } : { style: kit.frame }) };
  }
  return before;
}
function applyKit(kit, label) {
  const target = lookTarget(), was = structuredClone(target);
  const fields = { theme: kit.theme, material: kit.material, scene: kit.scene, radius: kit.radius, font: kit.font, pattern: kit.pattern, cardAlpha: kit.cardAlpha, chromeAlpha: 86, bgImage: '' };
  Object.assign(target, fields);
  for (const k of COLOR_KEYS) target[k] = null;
  target.accent = kit.accent;
  const widgets = restyleWidgets(kit);
  applySettings(); syncSettingsUI(); renderBoard(); save();
  toast(`${label || `“${kit.name}”`} — everything matches now.`, 'Undo', () => {
    Object.keys(target).forEach(k => delete target[k]); Object.assign(target, was);
    for (const [c, d] of widgets) c.data = d;
    applySettings(); syncSettingsUI(); renderBoard(); save();
  });
}
function shuffleStyle() {                              // something fresh that still goes together
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const light = Math.random() < .25;
  const hue = Math.floor(Math.random() * 360);
  const hsl = (hh, ss, ll) => { ss /= 100; ll /= 100; const f = n => { const k = (n + hh / 30) % 12, a = ss * Math.min(ll, 1 - ll); return Math.round(255 * (ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }; return '#' + f(0) + f(8) + f(4); };
  applyKit({
    name: 'Shuffled', theme: light ? pick(['paper', 'cork']) : pick(['graphite', 'midnight', 'neon']), material: pick(Object.keys(MATERIALS)),
    scene: pick(light ? ['aurora', 'spotlight', 'grain', 'none'] : ['aurora', 'cover', 'coverart', 'spotlight', 'split', 'grain']),
    accent: hsl(hue, 85, light ? 52 : 66), radius: pick([6, 10, 14, 18, 22]), font: pick(['system', 'system', 'serif', 'mono']),
    pattern: pick(['none', 'none', 'dots', 'grid']), cardAlpha: 100,
    ytm: pick(['glass', 'liquid', 'art', 'ambient', 'vinyl', 'frame', 'pill']), frame: pick(['gilded', 'gallery', 'wood', 'polaroid', 'white', 'none']),
  }, 'Shuffled');
}
/* Customize: every setting has one home. The style kits and your saved styles at the top (they set everything),
   then Intensity, colours, what cards are made of, the background, text, your own CSS. Screen visuals live in
   Now playing only (next to what plays); this panel points there. The static parts are in index.html. */
function renderStyle() {
  const sh = shown(), set = (k, v) => { lookTarget()[k] = v; applySettings(); syncSettingsUI(); save(); };
  const chip = (on, label, title, fn, swatch) => h('button', { class: 'style-chip' + (on ? ' on' : ''), type: 'button', title, onclick: fn }, swatch, label);
  const kitSwatch = k => { const t = THEMES[k.theme], sw = h('i', { class: 'kit-swatch' }); sw.style.background = SCENES[k.scene]?.[2] || ((SCENES[k.scene]?.[1] ? SCENES[k.scene][1] + ', ' : '') + t.bg); sw.style.setProperty('--a', k.accent); sw.style.setProperty('--s', t.surface); sw.dataset.material = k.material; return sw; };
  $('#kits').replaceChildren(h('div', { class: 'kit-grid' }, KITS.map(k => h('button', { class: 'kit', type: 'button', title: `${k.name}: ${MATERIALS[k.material]}, ${SCENES[k.scene][0]}`, onclick: () => applyKit(k) }, kitSwatch(k), h('span', null, k.name))),
    h('button', { class: 'kit kit-shuffle', type: 'button', title: 'A fresh combination that goes together', onclick: shuffleStyle }, h('i', { class: 'kit-swatch shuffle' }, '⤮'), h('span', null, 'Shuffle'))));
  $('#vibe').replaceChildren(vibePicker());
  $('#vibe-sec .vibe-about').textContent = vibe().about;
  $('#materials').replaceChildren(h('div', { class: 'style-row' }, Object.entries(MATERIALS).map(([k, name]) => chip(sh.material === k, name, 'Cards, bars and menus made of ' + name.toLowerCase(), () => set('material', k)))));
  // the glass's own colour, only when the cards are glass
  const glassy = sh.material === 'frosted' || sh.material === 'liquid';
  $('#glass-opts').replaceChildren(...(!glassy ? [] : [
    h('div', { class: 'style-label' }, 'Colour of the glass'),
    h('div', { class: 'style-row' },
      chip(sh.glassTint === 'theme', 'Theme', 'The colour of the cards', () => set('glassTint', 'theme')),
      chip(sh.glassTint === 'clear', 'Clear', 'No colour at all: only light and blur', () => set('glassTint', 'clear')),
      chip(sh.glassTint === 'cover', 'From the cover', 'Takes the colour of the cover of what plays', () => set('glassTint', 'cover')),
      chip(sh.glassTint === 'color', 'This colour', 'A colour of your own', () => set('glassTint', 'color')),
      h('input', { type: 'color', value: sh.glassColor || '#9fc3ff', title: 'Glass colour', 'aria-label': 'Glass colour', oninput(e) { const t = lookTarget(); t.glassColor = e.target.value; t.glassTint = 'color'; applySettings(); save(); }, onchange: () => syncSettingsUI() })),
    sh.material !== 'liquid' ? '' : h('label', { class: 'row' }, 'Bend what is behind it at the edges', h('input', { type: 'checkbox', checked: sh.refract !== false, onchange(e) { lookTarget().refract = e.target.checked; applySettings(); save(); } })),
  ]));
  $('#backdrops').replaceChildren(h('div', { class: 'style-row' }, Object.entries(SCENES).map(([k, [name, css, pic]]) => { const sw = h('i', { class: 'scene-dot' }); sw.style.background = pic || ((css ? css + ', ' : '') + 'var(--bg)'); return chip(sh.scene === k && !sh.bgImage, name, name + (sh.bgImage ? ' (your own picture covers it: Remove it to see this)' : ''), () => set('scene', k), sw); })));
  $('#css-edit').textContent = state.settings.userCss ? 'Edit your CSS…' : 'Add your own CSS…';
  $('#music-note').textContent = `Bars, waves, Frost and Disco over the whole screen, and ambient mode, are chosen in Now playing (the music button at the top), next to what plays. Now: ${state.settings.overlay === 'off' ? 'off' : FX_STYLES[state.settings.overlay] || 'off'}.`;
}

function applySettings() {
  const s = shown(), t = THEMES[s.theme] || THEMES.graphite;
  const root = document.documentElement.style;
  const accent = (s.musicAccent && musicTint) || s.accent || t.accent;
  const vars = {
    bg: s.bg || t.bg, surface: s.surface || t.surface, raise: s.raise || t.raise, text: s.text || t.text,
    muted: s.text ? `color-mix(in srgb, ${s.text} 60%, transparent)` : t.muted, border: t.border,
    'chrome-alpha': clamp(+s.chromeAlpha || 86, 40, 100) + '%',
    accent, 'accent-ink': inkFor(accent), dot: t.dot, 'tint-mix': t.tintMix, shadow: t.shadow, texture: t.texture,
    string: t.string,
    'bg-image': s.bgImage ? `url("${s.bgImage.replace(/["\\\n\r]/g, ch => encodeURIComponent(ch))}")`
              : sceneCss(s.scene) || (t.image ? `url("${t.image}")` : 'none'),
    'bg-fallback': t.fallback || 'none',
    radius: clamp(+s.radius || 0, 0, 24) + 'px',
    'card-alpha': clamp(+s.cardAlpha || 100, 40, 100) + '%',
    fs: clamp(+s.fontSize || 14, 12, 18) + 'px',
    font: FONTS[s.font] || FONTS.system,
  };
  for (const [k, v] of Object.entries(vars)) root.setProperty('--' + k, v);
  if (coverPalette) { root.setProperty('--cover-a', coverPalette.vivid); root.setProperty('--cover-b', coverPalette.average || coverPalette.dark); root.setProperty('--cover-c', coverPalette.light); }
  root.colorScheme = t.scheme;
  document.body.dataset.pattern = s.pattern;
  document.body.dataset.theme = THEMES[s.theme] ? s.theme : 'graphite';
  document.body.classList.toggle('glass', s.cardAlpha < 100);
  document.body.dataset.material = MATERIALS[s.material] ? s.material : 'solid';
  const glass = s.glassTint === 'clear' ? 'transparent' : s.glassTint === 'color' ? s.glassColor : s.glassTint === 'cover' ? (musicTint || s.glassColor) : null;
  if (glass) root.setProperty('--glass', glass); else root.removeProperty('--glass');
  document.body.dataset.glass = s.glassTint || 'theme';
  let art = $('#scene-art');
  if (s.scene === 'coverart' && coverArt && !s.bgImage) {
    if (!art) { art = h('i', { id: 'scene-art', 'aria-hidden': 'true' }); $('#backdrop').append(art); }
    const url = `url("${coverArt.replace(/"/g, '%22')}")`;
    if (art.style.backgroundImage !== url) art.style.backgroundImage = url;
    art.hidden = false;
  } else if (art) art.hidden = true;
  lens.update(s.material === 'liquid' && s.refract !== false);
  applyVibe();
  boardStyle();
  document.body.classList.toggle('dock-hide', !!s.dockHide);     // the add bar stays out of sight until the mouse nears the bottom edge
  tick();
}

function syncSettingsUI() {
  const s = shown(), t = THEMES[s.theme] || THEMES.graphite;
  renderLooks();
  panel.querySelectorAll('[data-set]').forEach(inp => {
    const k = inp.dataset.set;
    if (inp.type === 'checkbox') inp.checked = !!s[k];
    else if (inp.type === 'color') inp.value = s[k] || t[k];
    else inp.value = s[k];
  });
  panel.querySelectorAll('.theme').forEach(b => b.classList.toggle('active', b.dataset.theme === s.theme));
  renderStyle();
  const canUnblock = !!(api && api.declarativeNetRequest);
  $('#unblock').disabled = !canUnblock;
  if (!canUnblock) $('#unblock').checked = false;
  $('#unblock-note').textContent = !canUnblock
    ? `This copy is open as a normal web page (${location.protocol === 'file:' ? 'a file' : location.host}), and browsers never let a web page show sites that refuse to be embedded (Google, GitHub, banks…). The installed Homeboard on your new tab does it by itself. Here, use the window button on a website window to open the site in its own window beside the board.`
    : embedUnblocked
      ? 'On for this tab: sites that normally refuse to be embedded will load in website windows. Their “don’t embed me” protection is removed only for frames inside this page.'
      : s.unblock ? 'Could not be switched on in this browser, so some sites may stay blank.'
                  : 'Off: sites that refuse embedding will stay blank.';
  helper.ready().then(up => {
    $('#helper-note').textContent = up
      ? `The helper is running: files can be moved, the console works, and a backup is written once a day${state.lastBackup ? ` (last: ${state.lastBackup})` : ''} to the “backups” folder inside the Homeboard folder.`
      : 'The helper is not running, so moving files, the console and automatic daily backups are off. ' + (api?.runtime?.id ? 'Start it with tools\\start-helper.ps1 in the Homeboard folder.' : 'It only works with the installed extension.');
  });
  $('#version-note').textContent = `Homeboard ${version}` + (version !== loadedVersion && loadedVersion !== 'dev'
    ? ` — the board already runs it; the rest of the update (background parts) finishes when Edge restarts.` : '.');
  if (hasExtStorage) api.storage.local.get(SNAP_KEY).then(r => {
    const snap = r[SNAP_KEY];
    $('#undo-update').hidden = !snap;
    if (snap) $('#undo-update').textContent = `Undo the last update: board as it was before ${snap.to}`;
  }, () => {});
  $('#storage-note').textContent = hasExtStorage
    ? 'Everything is saved automatically in this browser’s extension storage, on this computer only.'
    : 'Everything is saved automatically in this browser, on this computer only. Clearing browsing data erases it — export a backup now and then.';
}

const clockTime = $('#clock-time'), clockDate = $('#clock-date');
function tick() {
  if (!state) return;
  const s = state.settings;
  $('#clock').hidden = !s.clock;
  if (!s.clock) return;
  const d = new Date();
  const time = d.toLocaleTimeString([], { hour: s.hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12: !!s.hour12 });
  const date = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  if (clockTime.textContent !== time) clockTime.textContent = time;
  if (clockDate.textContent !== date) clockDate.textContent = date;
}

