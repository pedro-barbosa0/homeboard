/* Homeboard · Environment, saving (and pictures kept apart), small DOM helpers, themes, the state, addresses.
   Part 1 of 9 of the board page: classic scripts that share one scope, loaded in order by index.html
   (app/00-core.js … app/08-main.js). See docs/ARCHITECTURE.md. */
'use strict';

/* ------------------------------------------------------------------ *
 *  Environment: works as a plain file / web page (localStorage) and
 *  as a browser extension page (extension storage + embed unblocking).
 * ------------------------------------------------------------------ */
const api = globalThis.browser ?? globalThis.chrome;
const hasExtStorage = !!(api && api.storage && api.storage.local);
const KEY = 'homeboard:v1';
const WRITER = Math.random().toString(36).slice(2);   // identifies this tab's saves
const GRID = 24;
const MIN_W = 180, MIN_H = 110;

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Where each board was looked at (pan and zoom) is kept in its own small record: moving around writes only that,
   never the whole board set, and other tabs are not told (each tab keeps its own view). */
const VIEWS_KEY = 'homeboard:views';
/* Pictures (the background, frames, widget pictures, app icons) are kept once each in IndexedDB, outside the board
   record: what is saved, what other tabs receive and every undo step hold a short "hbpic:<hash>" instead of the
   picture. In memory nothing changes (cards and widgets still see the picture itself). */
const PIC_PREFIX = 'hbpic:';
const pics = {
  byRef: new Map(), byData: new Map(), stored: new Set(),
  big: v => typeof v === 'string' && v.length > 2048 && v.startsWith('data:image/'),
  ref(data) {                                         // a fast fingerprint of the picture (two FNV-1a hashes and the length)
    let r = this.byData.get(data);
    if (r) return r;
    let a = 0x811c9dc5, b = 0x9747b28c;
    for (let i = 0; i < data.length; i++) { const c = data.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
    r = PIC_PREFIX + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0') + data.length.toString(36);
    this.byData.set(data, r); this.byRef.set(r, data);
    return r;
  },
  id: r => 'pic-' + r.slice(PIC_PREFIX.length),
  replacer() { return (k, v) => (pics.big(v) ? pics.ref(v) : v); },
  reviver() { return (k, v) => (typeof v === 'string' && v.startsWith(PIC_PREFIX) && pics.byRef.has(v) ? pics.byRef.get(v) : v); },
  pack(obj) { return obj == null ? obj : JSON.parse(JSON.stringify(obj, this.replacer())); },
  async persist() {                                   // new pictures go to IndexedDB before the record that points at them
    for (const [r, data] of this.byRef) {
      if (this.stored.has(r)) continue;
      try {
        const id = this.id(r);
        if (!(await mediaStore.get(id).catch(() => null))) await mediaStore.put(id, await (await fetch(data)).blob(), 'picture');
        this.stored.add(r);
      } catch { /* kept in memory; tried again with the next save */ }
    }
  },
  async inflate(obj) {                                // a saved record back to pictures (reads the ones not yet in memory)
    if (obj == null) return obj;
    const text = JSON.stringify(obj);
    if (!text.includes(PIC_PREFIX)) return obj;
    for (const r of new Set(text.match(/hbpic:[0-9a-z]+/g) || [])) {
      if (this.byRef.has(r)) continue;
      const rec = await mediaStore.get(this.id(r)).catch(() => null);
      if (!rec || !rec.blob) continue;
      const data = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(rec.blob); });
      if (data) { this.byRef.set(r, data); this.byData.set(data, r); this.stored.add(r); }
    }
    return JSON.parse(text, (k, v) => (typeof v === 'string' && v.startsWith(PIC_PREFIX) ? (pics.byRef.get(v) ?? '') : v));
  },
  ids() { return [...this.byRef.keys()].map(r => this.id(r)); },
};
const store = {
  async load() {
    try {
      let raw, views;
      if (hasExtStorage) { const o = await api.storage.local.get([KEY, VIEWS_KEY]); raw = o[KEY] || null; views = o[VIEWS_KEY]; }
      else { raw = JSON.parse(localStorage.getItem(KEY)); views = JSON.parse(localStorage.getItem(VIEWS_KEY) || 'null'); }
      if (raw && views && Array.isArray(raw.boards)) for (const b of raw.boards) if (views[b.id]) b.view = views[b.id];
      return await pics.inflate(raw);
    } catch { return null; }
  },
  async saveViews(map) {
    if (hasExtStorage) await api.storage.local.set({ [VIEWS_KEY]: map });
    else localStorage.setItem(VIEWS_KEY, JSON.stringify(map));
  },
  async save(value) {
    const packed = pics.pack(value);
    await pics.persist();
    if (hasExtStorage) await api.storage.local.set({ [KEY]: packed });
    else localStorage.setItem(KEY, JSON.stringify(packed));
  },
  onExternal(cb) {
    if (hasExtStorage) {
      api.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[KEY]) pics.inflate(changes[KEY].newValue).then(cb, () => {});
      });
    } else {
      addEventListener('storage', e => {
        if (e.key !== KEY || !e.newValue) return;
        try { cb(JSON.parse(e.newValue)); } catch { /* ignore */ }
      });
    }
  },
};

/* ------------------------------------------------------------------ *
 *  Small DOM helpers
 * ------------------------------------------------------------------ */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const ICONS = {
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
  todo: '<path d="m4 7 2 2 3-4"/><path d="m4 16 2 2 3-4"/><path d="M13 7h7M13 16h7"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  links: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  grip: '<circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
  term: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m7 10 3 2-3 2M12 15h5"/>',
  home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  views: '<path d="M7 4h10v16l-5-4-5 4z"/>',
  popout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8.500h18M7 6.250h.01M10 6.250h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  files: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  expand: '<path d="M14 5h5v5M19 5l-6 6M10 19H5v-5M5 19l6-6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  reload: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  external: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.5"/>',
  media: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 5-5 4 4 2-2 4 4"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.500 8.500a5 5 0 0 1 0 7"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9.500 4 5M21 9.500l-4 5"/>',
  layers: '<path d="M12 4 3 9l9 5 9-5z"/><path d="m3 14 9 5 9-5"/>',
  apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.600"/><rect x="13.500" y="4" width="6.5" height="6.5" rx="1.600"/><rect x="4" y="13.500" width="6.5" height="6.5" rx="1.600"/><rect x="13.500" y="13.500" width="6.5" height="6.5" rx="1.600"/>',
  space: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 4v13M12 10.500h9M9 21h6"/>',
  cast: '<path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path d="M3 12a8 8 0 0 1 8 8M3 16a4 4 0 0 1 4 4"/><path d="M3 20h.01"/>',
  widget: '<rect x="4" y="4" width="16" height="16" rx="3.500"/><path d="M8.500 8.500h.01M15.500 15.500h.01M12 12h.01M15.500 8.500h.01M8.500 15.500h.01"/>',
};
const WIDGETS = globalThis.HomeboardWidgets || {};   // minigames and other self-contained cards, see widgets.js
const FILLED = new Set(['more', 'grip']);
function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="ico${FILLED.has(name) ? ' fill' : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return t.content.firstChild;
}

/* ------------------------------------------------------------------ *
 *  Themes & settings
 * ------------------------------------------------------------------ */
const CORK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .22  0 0 0 0 .13  0 0 0 0 .04  0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const THEMES = {
  graphite: {
    name: 'Graphite', scheme: 'dark', bg: '#0e1014', surface: '#181b22', raise: '#20242e',
    text: '#e7e9ee', muted: '#8b93a6', border: 'rgba(255,255,255,.09)', accent: '#7aa2ff',
    dot: 'rgba(255,255,255,.08)', tintMix: '18%', texture: 'none', string: '#e5534b',
    shadow: '0 12px 32px rgba(0,0,0,.4), 0 2px 6px rgba(0,0,0,.3)',
  },
  midnight: {
    name: 'Midnight', scheme: 'dark', bg: '#090b17', surface: '#12152a', raise: '#1a1e3a',
    text: '#e4e6f5', muted: '#8a8eb5', border: 'rgba(160,170,255,.13)', accent: '#a48bff',
    dot: 'rgba(160,170,255,.11)', tintMix: '20%', texture: 'none', string: '#ff7ab6',
    shadow: '0 12px 34px rgba(0,0,10,.5), 0 2px 6px rgba(0,0,10,.35)',
  },
  neon: {
    name: 'Neon', scheme: 'dark', bg: '#07060f', surface: '#0e0c1d', raise: '#15122b',
    text: '#ece9ff', muted: '#9289c9', border: 'color-mix(in srgb, var(--accent) 30%, transparent)', accent: '#00f0ff',
    dot: 'color-mix(in srgb, var(--accent) 16%, transparent)', tintMix: '13%', string: '#ff2bd6', pattern: 'grid',
    texture: 'radial-gradient(ellipse 90% 60% at 50% 115%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 70%), radial-gradient(ellipse 70% 50% at 8% -10%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)'   /* the neon glows in the accent (it can follow the cover) */,
    shadow: '0 0 0 1px rgba(0,240,255,.1), 0 0 22px rgba(0,240,255,.2), 0 12px 40px rgba(0,0,0,.6)',
  },
  /* In-page take on Windows acrylic: a blurred, tinted, lightly grained sheet over the backdrop.
     wallpaper.jpg (optional file next to index.html) stands in for the desktop behind the window. */
  acrylic: {
    name: 'Acrylic', scheme: 'dark', bg: '#16233a', surface: '#2b2b2b', raise: '#2b2b2b',
    text: '#ffffff', muted: 'rgba(255,255,255,.64)', border: 'rgba(255,255,255,.11)', accent: '#60cdff',
    dot: 'rgba(255,255,255,.08)', tintMix: '24%', texture: 'none', string: '#60cdff',
    pattern: 'none', cardAlpha: 56, chromeAlpha: 58, radius: 8, image: 'wallpaper.jpg',
    fallback: 'radial-gradient(60% 70% at 66% 58%, #2f7bf0, transparent 72%), radial-gradient(50% 60% at 26% 72%, #7a3fe0, transparent 72%), radial-gradient(60% 60% at 82% 18%, #10a5c7, transparent 72%)',
    shadow: '0 8px 32px rgba(0,0,0,.34), 0 0 0 .5px rgba(0,0,0,.45)',
  },
  cork: {
    name: 'Cork', scheme: 'light', bg: '#b88a5e', surface: '#fdf5d3', raise: '#fffaf0',
    text: '#3a2c1c', muted: '#8a7458', border: 'rgba(60,40,10,.16)', accent: '#c2452f',
    dot: 'rgba(60,35,10,.16)', tintMix: '55%', texture: CORK, string: '#c0392b',
    shadow: '0 8px 18px rgba(50,25,0,.35), 0 1px 3px rgba(50,25,0,.3)',
  },
  paper: {
    name: 'Paper', scheme: 'light', bg: '#eef0f4', surface: '#ffffff', raise: '#f6f7fa',
    text: '#1d2129', muted: '#6b7385', border: 'rgba(20,30,50,.13)', accent: '#3b6cf6',
    dot: 'rgba(20,30,50,.14)', tintMix: '24%', texture: 'none', string: '#d6453d',
    shadow: '0 10px 28px rgba(30,40,70,.14), 0 1px 4px rgba(30,40,70,.12)',
  },
};
const FONTS = {
  system: '"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif',
  serif: 'Georgia,Cambria,"Times New Roman",serif',
  mono: '"Cascadia Code","Cascadia Mono",Consolas,ui-monospace,monospace',
  hand: '"Segoe Print","Ink Free","Bradley Hand","Comic Sans MS",cursive',
};
const ENGINES = {
  bing: 'https://www.bing.com/search?q=',
  google: 'https://www.google.com/search?q=',
  ddg: 'https://duckduckgo.com/?q=',
};
const COLORS = {
  yellow: '#f5c84c', orange: '#f59e5b', red: '#f0717d', pink: '#ee7fc2',
  purple: '#a78bfa', blue: '#6aa8ff', teal: '#4fd1c5', green: '#6fd08c',
};
const COLOR_KEYS = ['accent', 'bg', 'surface', 'raise', 'text'];   // per-colour overrides of the theme
const DEFAULT_SETTINGS = {
  theme: 'graphite', accent: null, bg: null, surface: null, raise: null, text: null,
  pattern: 'dots', bgImage: '',
  cardAlpha: 100, chromeAlpha: 86, radius: 12, fontSize: 14, font: 'system', snap: false,
  engine: 'bing', clock: true, hour12: false, unblock: true, dockHide: true,
  material: 'solid', scene: 'none', musicAccent: false, glassTint: 'theme', glassColor: '#9fc3ff', refract: true,
  overlay: 'off', overlayLook: 'glass', overlayColor: 'cover', overlayHex: '#7ad7ff', overlayPower: 100, overlayAlpha: 85,
};

/* card types: build is looked up when a card is made (the builders live in later files of the app) */
const TYPES = {
  note:  { label: 'Note',    menu: 'New note',           w: 280, h: 240, make: () => ({ html: '', markdown: true, md: '' }), build: (...a) => buildNote(...a) },
  todo:  { label: 'To-do',   menu: 'New to-do list',     w: 280, h: 300, make: () => ({ items: [] }), build: (...a) => buildTodo(...a) },
  web:   { label: 'Website', menu: 'New website window', w: 560, h: 420, make: () => ({ url: '' }),   build: (...a) => buildWeb(...a) },
  links: { label: 'Links',   menu: 'New quick links',    w: 330, h: 230, make: () => ({ links: [] }), build: (...a) => buildLinks(...a) },
  media: { label: 'Media',   menu: null,                 w: 320, h: 240, make: () => ({ kind: 'image' }), build: (...a) => buildMedia(...a) },
  files: { label: 'Files',   menu: 'New file browser',   w: 640, h: 400, make: () => ({ path: '' }),      build: (...a) => buildFiles(...a) },
  term:  { label: 'Console', menu: 'New console',        w: 580, h: 340, make: () => ({ cwd: '' }),       build: (...a) => buildTerm(...a) },
  widget: { label: 'Widget', menu: null,                 w: 320, h: 320, make: () => ({ widget: '' }),    build: (...a) => buildWidget(...a) },
  apps:  { label: 'Apps',    menu: 'New app launcher',   w: 360, h: 220, make: () => ({ apps: [] }),  build: (c, body) => appsKit().apps(c, body) },
  space: { label: 'Workspace', menu: 'New workspace',    w: 440, h: 330, make: () => ({ items: [] }), build: (c, body) => appsKit().space(c, body) },
};
/* apps.js: the app launcher and workspaces (made on first use, when everything they need exists) */
let appsMade = null;
const appsKit = () => appsMade || (appsMade = window.HomeboardApps({ h, icon, helper, helperHint, toast, openMenu, save, uid, api, FILES_DND }));
const CLIP_TYPE = 'application/x-homeboard-card+json';
const minW = c => (c.type === 'media' ? 60 : c.type === 'widget' ? 110 : MIN_W);
const minH = c => (c.type === 'media' ? 45 : c.type === 'widget' ? 80 : MIN_H);
const isBare = c => c.type === 'widget' && !!WIDGETS[c.widget]?.bare;   // shown without any card frame

/* ------------------------------------------------------------------ *
 *  State
 * ------------------------------------------------------------------ */
let state;
let selected = null;
let maxZ = 0;
let dirty = false, saveTimer = 0, stale = false;
let embedUnblocked = false, tabId = null;
let fileAccess = location.protocol === 'file:';   // may this page show file:// folders and files?
let clip = null;                                  // last copied card (fallback when custom clipboard types are dropped)
let pointer = null;                               // last pointer position, for "paste where I'm pointing"

const canvas = $('#canvas'), world = $('#world'), tabsEl = $('#tabs');
const panel = $('#settings'), menu = $('#menu'), toastEl = $('#toast');
const searchInput = $('#search-input');
const pageEl = $('#page'), sideEl = $('#side'), sideText = $('#side-text');

const board = () => state.boards.find(b => b.id === state.active) || state.boards[0];
const snap = v => (state.settings.snap ? Math.round(v / GRID) * GRID : Math.round(v));
const cardEl = id => world.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
const toWorld = (cx, cy) => { const v = board().view; return { x: (cx - v.x) / v.z, y: (cy - v.y) / v.z }; };

/* One app / folder / website of an Apps or Workspace card, cleaned up. */
function appItem(it) {
  if (!it || typeof it !== 'object') return null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const kind = ['app', 'folder', 'site'].includes(it.kind) ? it.kind : 'app';
  const out = { id: String(it.id || uid()), kind, name: str(it.name, 80) || 'App' };
  if (kind === 'site') { try { const u = new URL(String(it.url)); if (!/^https?:$/.test(u.protocol)) return null; out.url = u.href; } catch { return null; } out.tabs = !!it.tabs; }
  else if (it.appId && typeof it.appId === 'string') out.appId = str(it.appId, 400);
  else if (/^([a-z]:[\\/]|\\\\)/i.test(str(it.path, 1000))) { out.path = str(it.path, 1000); out.args = str(it.args, 500); }
  else return null;
  if (typeof it.exe === 'string' && /\.exe$/i.test(it.exe)) out.exe = str(it.exe, 1000);
  if (typeof it.icon === 'string' && it.icon.startsWith('data:image/png;base64,') && it.icon.length < 60000) out.icon = it.icon;
  const z = it.zone || {}, f = v => Math.min(1, Math.max(0, +v || 0));
  out.screen = Math.max(0, Math.min(8, Math.round(+it.screen || 0)));
  out.zone = { x: f(z.x), y: f(z.y), w: f(z.w) || 1, h: f(z.h) || 1 };
  return out;
}

function defaultState() {
  const item = text => newTask(text);
  const link = (title, url) => ({ id: uid(), title, url });
  const b = {
    id: uid(), name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [],
    cards: [
      { id: uid(), type: 'note', x: 72, y: 96, w: 330, h: 270, z: 1, title: 'Welcome', color: 'yellow',
        markdown: true, html: '',
        md: 'This board is yours. Drag a card by its top edge, resize it from the bottom-right corner, drag the background to move around.\n\n'
          + '- Double-click empty space for a new note (notes are **Markdown**)\n- Ctrl + scroll to zoom · `/` to search · `>` for commands\n'
          + '- Drop pictures, videos, PDFs or `.md` files anywhere\n'
          + '- Right-click anything for its options\n'
          + '- **Customize** (top right): pick a style kit, then the **Intensity** dial, from Calm to Wild\n'
          + '- **Widgets → Custom component**: design your own card, or describe it to an AI' },
      { id: uid(), type: 'todo', x: 432, y: 96, w: 290, h: 270, z: 2, title: 'To-do', color: null,
        items: [item('Pick a style kit (Customize, top right)'), item('Open a website window'), item('Add a clock or a custom component (Widgets)')] },
      { id: uid(), type: 'links', x: 752, y: 96, w: 330, h: 240, z: 3, title: 'Quick links', color: null,
        links: [link('Wikipedia', 'https://www.wikipedia.org/'), link('YouTube', 'https://www.youtube.com/'),
                link('GitHub', 'https://github.com/'), link('Outlook', 'https://outlook.live.com/')] },
    ],
  };
  b.cards[0].h = 360;
  b.strings.push({ id: uid(), from: b.cards[0].id, to: b.cards[1].id, color: null });
  return normalize({ v: 1, settings: { ...DEFAULT_SETTINGS }, boards: [b], active: b.id });
}

/* Notes are stored as HTML; anything loaded or imported goes through this. */
function cleanHTML(html) {
  const doc = new DOMParser().parseFromString('<body>' + html, 'text/html');
  const KEEP = new Set(['B', 'I', 'U', 'S', 'STRONG', 'EM', 'STRIKE', 'BR', 'DIV', 'P', 'SPAN', 'UL', 'OL', 'LI',
                        'H1', 'H2', 'H3', 'A', 'CODE', 'PRE', 'BLOCKQUOTE']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'SVG', 'MATH', 'FORM',
                        'TEMPLATE', 'NOSCRIPT', 'TITLE', 'BASE']);
  for (const el of [...doc.body.querySelectorAll('*')]) {
    const tag = el.tagName.toUpperCase();
    if (DROP.has(tag)) { el.remove(); continue; }
    if (!KEEP.has(tag)) { el.replaceWith(...el.childNodes); continue; }
    const href = tag === 'A' ? el.getAttribute('href') : null;
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (href && /^(https?:|mailto:)/i.test(href)) {
      el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer');
    }
  }
  return doc.body.innerHTML;
}

function normalize(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.boards) || !s.boards.length) return null;
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings && typeof s.settings === 'object' ? s.settings : {}) };
  if (!THEMES[s.settings.theme]) s.settings.theme = 'graphite';
  if (typeof s.settings.bgImage !== 'string') s.settings.bgImage = '';
  for (const k of COLOR_KEYS) if (!/^#[0-9a-f]{6}$/i.test(s.settings[k] || '')) s.settings[k] = null;
  const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
  s.viewMap = list(s.viewMap).filter(t => t && typeof t.board === 'string' && typeof t.view === 'string').map(t => ({ board: t.board, view: t.view, x: Math.round(+t.x || 0), y: Math.round(+t.y || 0) })).slice(0, 120);
  s.tour = list(s.tour).filter(t => t && typeof t.board === 'string' && typeof t.view === 'string').map(t => ({ board: t.board, view: t.view })).slice(0, 60);
  s.looks = list(s.looks).map(l => ({ id: String(l.id || uid()), name: String(l.name || 'Look').slice(0, 30), s: cleanLook(l.s) }));
  s.boards = list(s.boards);
  if (!s.boards.length) return null;
  for (const b of s.boards) {
    b.id = String(b.id || uid());
    b.name = String(b.name || 'Board').slice(0, 40);
    const v = b.view || {};
    b.view = { x: +v.x || 0, y: +v.y || 0, z: clamp(+v.z || 1, .1, 3) };
    b.cards = list(b.cards).filter(c => TYPES[c.type]);
    b.parent = b.parent ? String(b.parent) : null;
    b.look = b.look && s.looks.some(l => l.id === b.look) ? b.look : null;
    b.icon = typeof b.icon === 'string' ? [...b.icon].slice(0, 4).join('') : '';
    b.color = COLORS[b.color] ? b.color : null;
    b.kind = b.kind === 'file' ? 'file' : 'board';
    b.views = list(b.views).slice(0, 30).map(p => ({ id: String(p.id || uid()), name: String(p.name || 'View').slice(0, 40), cx: +p.cx || 0, cy: +p.cy || 0, z: clamp(+p.z || 1, .1, 3) }));
    b.home = b.views.some(p => p.id === b.home) ? b.home : null;
    b.frozen = !!b.frozen;
    b.side = !!b.side; b.collapsed = !!b.collapsed;
    b.sideHtml = cleanHTML(String(b.sideHtml || ''));
    if (b.page && typeof b.page === 'object') b.page = { url: toAddress(String(b.page.url || '')) || '', title: b.name, named: true }; else delete b.page;
    for (const c of b.cards) {
      c.id = String(c.id || uid());
      if (typeof c.sync === 'string' && /^[\w-]{1,40}$/.test(c.sync) && (c.type === 'note' || c.type === 'todo')) { /* linked group */ } else delete c.sync;
      if (c.zoom != null) { if (+c.zoom > 0) c.zoom = clamp(+c.zoom, .3, 4); else delete c.zoom; }
      if (c.grow != null && !(+c.grow > 0)) delete c.grow;
      c.x = +c.x || 0; c.y = +c.y || 0; c.z = +c.z || 0;
      c.w = Math.max(minW(c), +c.w || TYPES[c.type].w);
      c.h = Math.max(minH(c), +c.h || TYPES[c.type].h);
      c.title = String(c.title || TYPES[c.type].label).slice(0, 80);
      if (!COLORS[c.color]) c.color = null;
      if (c.type === 'note') {
        c.html = cleanHTML(String(c.html || ''));
        c.markdown = !!c.markdown;
        c.md = c.markdown && typeof c.md === 'string' ? c.md.slice(0, 1000000) : '';
      }
      if (c.veil !== 'hover' && c.veil !== 'click') delete c.veil;
      const B64 = /^[A-Za-z0-9+/=]+$/, k = c.lock;
      if (c.type === 'note' && k && typeof k === 'object' && [k.salt, k.iv, k.data].every(v => typeof v === 'string' && B64.test(v))) {
        c.lock = { salt: k.salt, iv: k.iv, data: k.data }; c.html = ''; c.md = '';
      } else delete c.lock;
      if (c.type === 'todo') c.items = list(c.items).map(i => ({
        id: String(i.id || uid()), text: String(i.text || ''), done: !!i.done,
        steps: list(i.steps).map(t => ({ id: String(t.id || uid()), text: String(t.text || ''), done: !!t.done })),
        note: String(i.note || '').slice(0, 5000), link: toAddress(String(i.link || '')) || '',
        due: /^\d{4}-\d\d-\d\d$/.test(i.due) ? i.due : '', star: !!i.star,
      }));
      if (c.type === 'links') c.links = list(c.links).map(l => ({ id: String(l.id || uid()), title: String(l.title || ''), url: toAddress(String(l.url || '')), how: l.how === 'explorer' ? 'explorer' : 'tab' })).filter(l => l.url);
      if (c.type === 'files') { const p = toAddress(String(c.path || '')); c.path = p && isLocal(p) ? p.replace(/\/?$/, '/') : ''; }
      if (c.type === 'web') {
        const l = c.last;
        if (l && typeof l === 'object' && /^https?:/i.test(String(l.url || ''))) c.last = { url: String(l.url).slice(0, 2000), path: /^[\d.]{0,200}$/.test(l.path || '') ? l.path || '' : '', x: Math.max(0, +l.x || 0), y: Math.max(0, +l.y || 0) };
        else delete c.last;
        c.forget = !!c.forget;
      }
      if (c.type === 'web') { c.url = toAddress(String(c.url || '')) || ''; c.plain = !!c.plain; c.own = !!c.own; if (typeof c.noScroll !== 'boolean') delete c.noScroll; }
      if (c.type === 'apps') c.apps = list(c.apps).map(appItem).filter(Boolean);
      if (c.type === 'space') c.items = list(c.items).map(appItem).filter(Boolean).slice(0, 40);
      if (c.type === 'term') { c.cwd = typeof c.cwd === 'string' ? c.cwd.slice(0, 400) : ''; if (!['powershell', 'pwsh', 'cmd'].includes(c.shell)) delete c.shell; delete c.restartTerm; }
      if (c.type === 'media') {
        c.kind = ['image', 'video', 'pdf'].includes(c.kind) ? c.kind : 'image';
        c.src = (c.src && normalizeUrl(String(c.src))) || null;
        c.mediaId = c.mediaId ? String(c.mediaId) : null;
        c.ratio = +c.ratio > 0 ? +c.ratio : null;
        c.back = !!c.back; c.muted = c.muted !== false; c.paused = !!c.paused;
      }
      if (c.type === 'widget') {
        c.widget = String(c.widget || '');
        if (!c.data || typeof c.data !== 'object') delete c.data;   // each widget validates its own saved data
      }
    }
    const ids = new Set(b.cards.map(c => c.id));
    b.strings = list(b.strings)
      .filter(t => ids.has(t.from) && ids.has(t.to) && t.from !== t.to)
      .map(t => ({ id: String(t.id || uid()), from: t.from, to: t.to, color: COLORS[t.color] ? t.color : null }));
  }
  // the tree must be a tree: unknown parents and loops fall back to the top level
  for (const b of s.boards) {
    const seen = new Set([b.id]);
    for (let p = b.parent; p; p = (s.boards.find(o => o.id === p) || {}).parent) {
      if (seen.has(p) || !s.boards.some(o => o.id === p)) { b.parent = null; break; }
      seen.add(p);
    }
  }
  if (!s.boards.some(b => b.id === s.active)) s.active = s.boards[0].id;
  return s;
}

function saveQuiet() {                               // kept, but not an undo step (where you were on a site, …)
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
let viewTimer = 0;
function saveView() {                                // the view changed: keep it (in its own record), not an undo step
  clearTimeout(viewTimer);
  viewTimer = setTimeout(flushViews, 400);
}
function flushViews() {
  clearTimeout(viewTimer); viewTimer = 0;
  if (!state || !state.boards) return;
  store.saveViews(Object.fromEntries(state.boards.map(b => [b.id, b.view]))).catch(() => { /* storage full: the main save keeps views too */ });
}
function save() {
  finderCache = null;
  spreadShared();
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
  clearTimeout(undoTimer);
  undoTimer = setTimeout(remember, 500);             // a pause after a change makes it one undo step
}

/* Undo and redo keep whole-board snapshots. Moving around (the view) and switching boards are not steps,
   and a big background picture is left out so the history stays small. */
const undo = { past: [], future: [], now: null };
let undoTimer = 0, rememberWait = 0;
function snapshot() {
  const o = { ...state, settings: { ...state.settings, bgImage: '' }, boards: state.boards.map(b => ({ ...b, view: null })) };
  for (const k of ['rev', 'writer', 'seenVersion', 'lastBackup', 'active']) delete o[k];
  return JSON.stringify(o, pics.replacer());          // pictures as references: a step is a few KB, not megabytes
}
function remember() {
  clearTimeout(undoTimer);
  if (!state) return;
  // never in the middle of a drag: a step there would undo to a halfway place (found by boardstest on a busy machine)
  // (but a drag whose pointer-up was lost, say over a website window, must not stop the history for good: 8 s at most)
  if (document.body.classList.contains('dragging') && (rememberWait = (rememberWait || Date.now())) > Date.now() - 8000) { undoTimer = setTimeout(remember, 300); return; }
  rememberWait = 0;
  const now = snapshot();
  if (now === undo.now) return;
  if (undo.now != null) {
    undo.past.push(undo.now);
    let size = undo.past.reduce((n, x) => n + x.length, 0);
    while (undo.past.length > 60 || (size > 20e6 && undo.past.length > 1)) size -= undo.past.shift().length;
  }
  undo.now = now;
  undo.future = [];
}
function travel(from, to, label, back) {
  remember();
  if (!from.length) { toast(label === 'Undone' ? 'Nothing to undo.' : 'Nothing to redo.'); return; }
  const before = state, target = JSON.parse(from.pop(), pics.reviver());
  to.push(undo.now);
  for (const b of target.boards) b.view = (before.boards.find(o => o.id === b.id) || {}).view || { x: 0, y: 0, z: 1 };
  Object.assign(target, { seenVersion: before.seenVersion, lastBackup: before.lastBackup });
  target.settings.bgImage = before.settings.bgImage;
  // show the board that changed
  const changed = target.boards.find(b => JSON.stringify({ ...b, view: 0 }) !== JSON.stringify({ ...(before.boards.find(o => o.id === b.id) || {}), view: 0 }));
  target.active = (changed || target.boards.find(b => b.id === before.active) || target.boards[0]).id;
  state = normalize(target) || before;
  undo.now = snapshot();
  applySettings(); if (!panel.hidden) syncSettingsUI(); renderTabs(); renderBoard();
  dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250);
  toast(`${label}.`, back, () => (back === 'Redo' ? redoStep() : undoStep()));
}
const undoStep = () => travel(undo.past, undo.future, 'Undone', 'Redo');
const redoStep = () => travel(undo.future, undo.past, 'Redone', 'Undo');
async function flush() {
  if (!dirty) return;
  dirty = false;
  clearTimeout(saveTimer);
  state.writer = WRITER;
  state.rev = Date.now();
  try {
    await store.save(state);
  } catch (err) {
    if (state.settings.bgImage.startsWith('data:')) {
      state.settings.bgImage = '';
      applySettings();
      toast('That background image is too big to store here, so it was removed.');
      dirty = true;
      return flush();
    }
    console.error('Homeboard: save failed', err);
    toast('Changes could not be saved — browser storage is full or blocked.');
  }
}
/* Another tab saved: take its version (new tabs all share one board). */
function adopt(next) {
  if (dirty) return;
  const n = normalize(next);
  if (!n) return;
  const mine = new Map(state.boards.map(b => [b.id, b.view]));   // this tab keeps looking where it was looking
  for (const b of n.boards) if (mine.has(b.id) && mine.get(b.id)) b.view = mine.get(b.id);
  const prev = state;
  // cards that did not change keep their object (their window, console or widget holds on to it), only their place moves
  const GEO = ['x', 'y', 'w', 'h', 'z'];
  const body = c => JSON.stringify(c, (k, v) => (GEO.includes(k) ? undefined : v));
  const oldCards = new Map(prev.boards.flatMap(b => b.cards).map(c => [c.id, c]));
  const rebuilt = new Set();
  for (const b of n.boards) b.cards = b.cards.map(nc => {
    const oc = oldCards.get(nc.id);
    if (oc && oc.type === nc.type && body(oc) === body(nc)) { for (const k of GEO) oc[k] = nc[k]; return oc; }
    rebuilt.add(nc.id);
    return nc;
  });
  const shell = b => b && JSON.stringify(b, (k, v) => (k === 'cards' || k === 'view' ? undefined : v));
  const was = prev.boards.find(b => b.id === prev.active), now = n.boards.find(b => b.id === n.active);
  const sameBoard = was && now && was.id === now.id && shell(was) === shell(now) && now.kind !== 'file';
  const sameLook = JSON.stringify(prev.settings) === JSON.stringify(n.settings);
  state = n;
  finderCache = null;
  undo.past = []; undo.future = []; undo.now = snapshot();   // another tab changed things: start the history afresh
  if (!sameLook) { applySettings(); syncSettingsUI(); }
  renderTabs();
  if (!sameBoard) { renderBoard(); return; }
  patchBoard(now, rebuilt);
}
/* The open board brought up to date in place: moved cards are placed again, changed or new ones built, gone ones removed. */
function patchBoard(b, rebuilt) {
  const els = new Map([...world.querySelectorAll(':scope > .card:not(.away)')].map(el => [el.dataset.id, el]));
  for (const c of b.cards) {
    const el = els.get(c.id);
    els.delete(c.id);
    if (el && !rebuilt.has(c.id)) { place(el, c); continue; }
    if (expanded && expanded.c && expanded.c.id === c.id) collapseCard();
    const fresh = buildCard(c);
    if (el) el.replaceWith(fresh); else stringsEl.before(fresh);
  }
  for (const [id, el] of els) { if (expanded && expanded.c && expanded.c.id === id) collapseCard(); el.remove(); }
  maxZ = Math.max(0, ...b.cards.map(c => c.z || 0));
  onScreen.refresh();
  drawStrings();
}

/* ------------------------------------------------------------------ *
 *  URLs
 * ------------------------------------------------------------------ */
function normalizeUrl(v) {
  v = v.trim();
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    return /^https?:$/.test(u.protocol) && u.hostname ? u.href : null;
  } catch { return null; }
}
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/* Website windows also take Windows paths (C:\Users\me\Downloads\, \\server\share) and file:// addresses. */
function toAddress(v) {
  v = v.trim().replace(/^"(.*)"$/, '$1');
  const md = /^\[[^\]]*\]\((homeboard:[^)\s]+)\)$/.exec(v);
  if (md) v = md[1];
  if (BOARD_LINK.test(v)) return v;
  if (/^[a-z]:[\\/]/i.test(v) || v.startsWith('\\\\')) {
    const unc = v.startsWith('\\\\');
    const parts = v.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
    const path = parts.map((s, i) => (i === 0 ? s : encodeURIComponent(s))).join('/');
    return (unc ? 'file://' : 'file:///') + path;
  }
  if (/^file:\/\//i.test(v)) { try { return new URL(v).href; } catch { return null; } }
  return normalizeUrl(v);
}
const isLocal = url => /^file:/i.test(url || '');
/* What the address field shows: local addresses read as normal Windows paths. */
function addressLabel(url) {
  if (!isLocal(url)) return url || '';
  try {
    const u = new URL(url), p = decodeURIComponent(u.pathname).replace(/\//g, '\\');
    return u.host ? '\\\\' + u.host + p : p.replace(/^\\/, '');
  } catch { return url; }
}
function titleOf(url) {
  if (!isLocal(url)) return hostOf(url);
  const parts = addressLabel(url).split('\\').filter(Boolean);
  return parts[parts.length - 1] || 'Files';
}
function openExternal(url) {
  if (!url) return;
  if (isLocal(url) && api?.tabs?.create) api.tabs.create({ url });   // pages may not window.open() local files
  else window.open(url, '_blank', 'noopener');
}
/* Without the extension, YouTube only plays through its embed address. */
function embedUrl(url) {
  if (embedUnblocked) return url;
  try {
    const u = new URL(url);
    const id = /(^|\.)youtube\.com$/.test(u.hostname) && u.pathname === '/watch' ? u.searchParams.get('v')
             : u.hostname === 'youtu.be' ? u.pathname.slice(1) : null;
    if (id) return 'https://www.youtube.com/embed/' + encodeURIComponent(id);
  } catch { /* fall through */ }
  return url;
}

