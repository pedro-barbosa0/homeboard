(() => {
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

const store = {
  async load() {
    try {
      if (hasExtStorage) return (await api.storage.local.get(KEY))[KEY] || null;
      return JSON.parse(localStorage.getItem(KEY));
    } catch { return null; }
  },
  async save(value) {
    if (hasExtStorage) await api.storage.local.set({ [KEY]: value });
    else localStorage.setItem(KEY, JSON.stringify(value));
  },
  onExternal(cb) {
    if (hasExtStorage) {
      api.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[KEY]) cb(changes[KEY].newValue);
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
    text: '#ece9ff', muted: '#9289c9', border: 'rgba(0,240,255,.3)', accent: '#00f0ff',
    dot: 'rgba(255,43,214,.14)', tintMix: '13%', string: '#ff2bd6', pattern: 'grid',
    texture: 'radial-gradient(ellipse 90% 60% at 50% 115%, rgba(255,43,214,.26), transparent 70%), radial-gradient(ellipse 70% 50% at 8% -10%, rgba(0,240,255,.16), transparent 70%)',
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
};

const TYPES = {
  note:  { label: 'Note',    menu: 'New note',           w: 280, h: 240, make: () => ({ html: '', markdown: true, md: '' }), build: buildNote },
  todo:  { label: 'To-do',   menu: 'New to-do list',     w: 280, h: 300, make: () => ({ items: [] }), build: buildTodo },
  web:   { label: 'Website', menu: 'New website window', w: 560, h: 420, make: () => ({ url: '' }),   build: buildWeb },
  links: { label: 'Links',   menu: 'New quick links',    w: 330, h: 230, make: () => ({ links: [] }), build: buildLinks },
  media: { label: 'Media',   menu: null,                 w: 320, h: 240, make: () => ({ kind: 'image' }), build: buildMedia },
  files: { label: 'Files',   menu: 'New file browser',   w: 640, h: 400, make: () => ({ path: '' }),      build: buildFiles },
  term:  { label: 'Console', menu: 'New console',        w: 580, h: 340, make: () => ({ cwd: '' }),       build: buildTerm },
  widget: { label: 'Widget', menu: null,                 w: 320, h: 320, make: () => ({ widget: '' }),    build: buildWidget },
};
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

function defaultState() {
  const item = text => newTask(text);
  const link = (title, url) => ({ id: uid(), title, url });
  const b = {
    id: uid(), name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [],
    cards: [
      { id: uid(), type: 'note', x: 72, y: 96, w: 330, h: 270, z: 1, title: 'Welcome', color: 'yellow',
        markdown: true, html: '',
        md: 'This board is yours. Drag a card by its top edge, resize it from the bottom-right corner, and drag the background to move around.\n\n'
          + '- Double-click empty space for a new note (notes are **Markdown**)\n- Ctrl + scroll to zoom\n'
          + '- Drag the pin at the top of a card onto another card to tie a string\n'
          + '- Drop pictures, videos, PDFs or `.md` files anywhere on the board\n'
          + '- Right-click a card’s top edge for colours and more\n- The button in the top-right corner changes the look' },
      { id: uid(), type: 'todo', x: 432, y: 96, w: 290, h: 270, z: 2, title: 'To-do', color: null,
        items: [item('Make this my start page'), item('Open a website window'), item('Pick a theme')] },
      { id: uid(), type: 'links', x: 752, y: 96, w: 330, h: 240, z: 3, title: 'Quick links', color: null,
        links: [link('Wikipedia', 'https://www.wikipedia.org/'), link('YouTube', 'https://www.youtube.com/'),
                link('GitHub', 'https://github.com/'), link('Outlook', 'https://outlook.live.com/')] },
    ],
  };
  b.cards[0].h = 330;
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
  s.looks = list(s.looks).map(l => ({ id: String(l.id || uid()), name: String(l.name || 'Look').slice(0, 30), s: cleanLook(l.s) }));
  s.boards = list(s.boards);
  if (!s.boards.length) return null;
  for (const b of s.boards) {
    b.id = String(b.id || uid());
    b.name = String(b.name || 'Board').slice(0, 40);
    const v = b.view || {};
    b.view = { x: +v.x || 0, y: +v.y || 0, z: clamp(+v.z || 1, .25, 2) };
    b.cards = list(b.cards).filter(c => TYPES[c.type]);
    b.parent = b.parent ? String(b.parent) : null;
    b.look = b.look && s.looks.some(l => l.id === b.look) ? b.look : null;
    b.icon = typeof b.icon === 'string' ? [...b.icon].slice(0, 4).join('') : '';
    b.color = COLORS[b.color] ? b.color : null;
    b.kind = b.kind === 'file' ? 'file' : 'board';
    b.views = list(b.views).slice(0, 30).map(p => ({ id: String(p.id || uid()), name: String(p.name || 'View').slice(0, 40), cx: +p.cx || 0, cy: +p.cy || 0, z: clamp(+p.z || 1, .25, 2) }));
    b.home = b.views.some(p => p.id === b.home) ? b.home : null;
    b.frozen = !!b.frozen;
    b.side = !!b.side; b.collapsed = !!b.collapsed;
    b.sideHtml = cleanHTML(String(b.sideHtml || ''));
    if (b.page && typeof b.page === 'object') b.page = { url: toAddress(String(b.page.url || '')) || '', title: b.name, named: true }; else delete b.page;
    for (const c of b.cards) {
      c.id = String(c.id || uid());
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
      if (c.type === 'web') { c.url = toAddress(String(c.url || '')) || ''; c.plain = !!c.plain; }
      if (c.type === 'term') c.cwd = typeof c.cwd === 'string' ? c.cwd.slice(0, 400) : '';
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

function save() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
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
  state = n;
  applySettings(); syncSettingsUI(); renderTabs(); renderBoard();
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
function textToHtml(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.replace(/\r/g, '').split('\n').map(l => `<div>${esc(l) || '<br>'}</div>`).join('');
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
const LOOK_KEYS = ['theme', 'accent', 'bg', 'surface', 'raise', 'text', 'pattern', 'bgImage', 'cardAlpha', 'chromeAlpha', 'radius', 'fontSize', 'font'];
const pickLook = src => Object.fromEntries(LOOK_KEYS.map(k => [k, src[k]]));
function cleanLook(o) {
  const out = pickLook({ ...DEFAULT_SETTINGS, ...(o && typeof o === 'object' ? o : {}) });
  if (!THEMES[out.theme]) out.theme = 'graphite';
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
  if (own && own !== l) toast(`This board keeps its own look, “${own.name}”. Other boards now wear “${l.name}”.`);
}
function renderLooks() {
  const own = boardLook(), b = board();
  $('#look-note').textContent = own ? `This board wears “${own.name}”. The controls below change that look.`
    : 'The controls below change the general look. Save it to wear again later, or pin a saved look to one board.';
  $('#looks').replaceChildren(...state.looks.map(l => {
    const t = THEMES[l.s.theme] || THEMES.graphite, sw = h('i', { class: 'look-swatch' });
    sw.style.background = l.s.bg || t.bg;
    sw.style.setProperty('--s', l.s.surface || t.surface);
    sw.style.setProperty('--a', l.s.accent || t.accent);
    const name = h('button', { class: 'look-name', type: 'button', title: 'Wear this look everywhere', onclick() { if (!name.classList.contains('editing')) wearLook(l); } }, l.name);
    const pinned = b.look === l.id;
    return h('div', { class: 'look-row' + (pinned ? ' on' : ''), 'data-look': l.id }, sw, name,
      h('button', { class: 'icon-btn' + (pinned ? ' on' : ''), type: 'button', 'aria-pressed': String(pinned),
        title: pinned ? 'This board wears this look. Click to go back to the general look.' : 'Use this look on this board only',
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

function applySettings() {
  const s = shown(), t = THEMES[s.theme] || THEMES.graphite;
  const root = document.documentElement.style;
  const accent = s.accent || t.accent;
  const vars = {
    bg: s.bg || t.bg, surface: s.surface || t.surface, raise: s.raise || t.raise, text: s.text || t.text,
    muted: s.text ? `color-mix(in srgb, ${s.text} 60%, transparent)` : t.muted, border: t.border,
    'chrome-alpha': clamp(+s.chromeAlpha || 86, 40, 100) + '%',
    accent, 'accent-ink': inkFor(accent), dot: t.dot, 'tint-mix': t.tintMix, shadow: t.shadow, texture: t.texture,
    string: t.string,
    'bg-image': s.bgImage ? `url("${s.bgImage.replace(/["\\\n\r]/g, ch => encodeURIComponent(ch))}")`
              : t.image ? `url("${t.image}")` : 'none',
    'bg-fallback': t.fallback || 'none',
    radius: clamp(+s.radius || 0, 0, 24) + 'px',
    'card-alpha': clamp(+s.cardAlpha || 100, 40, 100) + '%',
    fs: clamp(+s.fontSize || 14, 12, 18) + 'px',
    font: FONTS[s.font] || FONTS.system,
  };
  for (const [k, v] of Object.entries(vars)) root.setProperty('--' + k, v);
  root.colorScheme = t.scheme;
  document.body.dataset.pattern = s.pattern;
  document.body.dataset.theme = THEMES[s.theme] ? s.theme : 'graphite';
  document.body.classList.toggle('glass', s.cardAlpha < 100);
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

/* ------------------------------------------------------------------ *
 *  Menu, toast, inline rename
 * ------------------------------------------------------------------ */
function closeMenu() { menu.hidden = true; }
function openMenu(x, y, items) {
  menu.replaceChildren();
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { menu.append(h('div', { class: 'menu-sep' })); continue; }
    if (it.info) { menu.append(h('div', { class: 'menu-info' }, it.info)); continue; }
    if (it.grid) {
      menu.append(h('div', { class: 'menu-grid' }, it.grid.map(v => h('button', {
        class: 'menu-cell' + (it.current === v ? ' on' : ''), type: 'button', onclick() { closeMenu(); it.pick(v); },
      }, v))));
      continue;
    }
    if (it.swatches) {
      const mk = (key, color) => h('button', {
        class: 'swatch' + (it.current === key ? ' on' : ''), type: 'button',
        title: key || 'Default', 'aria-label': key || 'Default colour',
        onclick() { closeMenu(); it.pick(key); },
      });
      const row = h('div', { class: 'swatches' }, mk(null));
      for (const [key, color] of Object.entries(it.swatches)) {
        const b = mk(key, color);
        b.style.setProperty('--c', color);
        row.append(b);
      }
      menu.append(row);
      continue;
    }
    // `checked` items show a tick (or an empty slot); `items` opens a second list in the same place
    menu.append(h('button', {
      class: 'menu-item' + (it.danger ? ' danger' : ''), type: 'button',
      role: it.checked == null ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': it.checked == null ? null : String(!!it.checked),
      onclick() { closeMenu(); if (it.items) openMenu(x, y, it.items); else it.action(); },
    }, icon(it.checked ? 'check' : it.checked === false ? '' : it.icon), h('span', null, it.label),
      it.items && h('span', { class: 'menu-more' }, '›')));
  }
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = clamp(x, 8, Math.max(8, innerWidth - r.width - 8)) + 'px';
  menu.style.top = clamp(y, 8, Math.max(8, innerHeight - r.height - 8)) + 'px';
}

let toastTimer = 0;
function toast(msg, label, fn) {
  toastEl.replaceChildren(h('span', null, msg));
  if (label) toastEl.append(h('button', { type: 'button', onclick() { toastEl.hidden = true; fn(); } }, label));
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, label ? 7000 : 4500);
}

function editInline(el, commit) {
  if (el.classList.contains('editing')) return;
  el.classList.add('editing');
  el.contentEditable = 'true';
  el.spellcheck = false;
  el.focus();
  getSelection().selectAllChildren(el);
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('blur', onBlur);
    el.contentEditable = 'false';
    el.classList.remove('editing');
    const v = el.textContent.replace(/\s+/g, ' ').trim();
    getSelection().removeAllRanges();
    commit(ok && v ? v : null);
  };
  const onKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  };
  const onBlur = () => finish(true);
  el.addEventListener('keydown', onKey);
  el.addEventListener('blur', onBlur);
}

function plainPaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
}

/* ------------------------------------------------------------------ *
 *  Canvas: pan, zoom, selection
 * ------------------------------------------------------------------ */
function applyView() {
  const { x, y, z } = board().view;
  world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  const step = GRID * z * (z < .5 ? 2 : 1);
  canvas.style.setProperty('--gx', x + 'px');
  canvas.style.setProperty('--gy', y + 'px');
  canvas.style.setProperty('--gs', step + 'px');
  $('#zoom-label').textContent = Math.round(z * 100) + '%';
}
/* Saved views remember the middle of the screen and the zoom, so they work in any window size. */
const viewHere = () => { const v = board().view; return { cx: (innerWidth / 2 - v.x) / v.z, cy: (innerHeight / 2 - v.y) / v.z, z: v.z }; };
const viewOf = p => ({ x: innerWidth / 2 - p.cx * p.z, y: innerHeight / 2 - p.cy * p.z, z: p.z });
let flying = 0;
function goTo(to) {
  const v = board().view, from = { ...v };
  cancelAnimationFrame(flying);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(v, to); applyView(); save(); return; }
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 340), e = 1 - (1 - k) ** 3;
    v.x = from.x + (to.x - from.x) * e; v.y = from.y + (to.y - from.y) * e; v.z = from.z + (to.z - from.z) * e;
    applyView();
    if (k < 1) flying = requestAnimationFrame(step); else save();
  };
  flying = requestAnimationFrame(step);
}
function goHome() {                                  // the start view, or everything on the board when there is none
  const b = board(), home = b.views.find(p => p.id === b.home);
  if (home) goTo(viewOf(home)); else fitView();
}
function renameView(p) {
  const name = prompt('Name for this view', p.name);
  if (name && name.trim()) { p.name = name.trim().slice(0, 40); save(); }
}
function viewsMenu(x, y) {
  const b = board();
  const one = p => [
    { label: 'Go there', icon: 'arrow', action: () => goTo(viewOf(p)) },
    { label: 'Make it the start view', checked: b.home === p.id, action() { b.home = b.home === p.id ? null : p.id; save(); } },
    { label: 'Replace with what is on screen now', icon: 'reload', action() { Object.assign(p, viewHere()); save(); toast(`“${p.name}” now shows this.`); } },
    { label: 'Rename…', icon: 'edit', action: () => renameView(p) },
    { label: 'Delete', icon: 'trash', danger: true, action() { b.views.splice(b.views.indexOf(p), 1); if (b.home === p.id) b.home = null; save(); } },
  ];
  openMenu(x, y, [
    { label: b.home ? 'Back to the start view' : 'Back to everything', icon: 'home', action: goHome },
    ...b.views.map((p, i) => ({ label: `${p.name}${b.home === p.id ? '  · start' : ''}`, icon: 'views', action: () => goTo(viewOf(p)), key: i })),
    { sep: true },
    {
      label: 'Save this view', icon: 'plus',
      action() {
        const p = { id: uid(), name: `View ${b.views.length + 1}`, ...viewHere() };
        b.views.push(p);
        if (!b.home) b.home = p.id;                 // the first one saved is where Home goes
        save();
        toast(`Saved as “${p.name}”${b.home === p.id ? ', the start view' : ''}.`, 'Rename', () => renameView(p));
      },
    },
    b.views.length > 0 && { label: 'Manage views', icon: 'edit', items: b.views.map(p => ({ label: p.name, icon: 'views', items: one(p) })) },
    { label: 'Lock the view (no moving or zooming)', checked: b.frozen, action() { b.frozen = !b.frozen; document.body.classList.toggle('view-locked', b.frozen); save(); } },
    { info: 'Home goes to the start view; keys 1–9 go to the saved views in order.' },
  ]);
}
function zoomAt(cx, cy, factor) {
  if (board().frozen) return;
  const v = board().view;
  const z = clamp(v.z * factor, .25, 2), k = z / v.z;
  v.x = cx - (cx - v.x) * k;
  v.y = cy - (cy - v.y) * k;
  v.z = z;
  applyView(); save();
}
function zoomStep(dir) {
  const v = board().view;
  const target = clamp(Math.round(v.z * (dir > 0 ? 1.2 : 1 / 1.2) * 20) / 20, .25, 2);
  zoomAt(innerWidth / 2, innerHeight / 2, target / v.z);
}
function fitView() {
  const b = board(), v = b.view;
  if (!b.cards.length) { goTo({ x: 0, y: 0, z: 1 }); return; }
  const x0 = Math.min(...b.cards.map(c => c.x)), y0 = Math.min(...b.cards.map(c => c.y));
  const x1 = Math.max(...b.cards.map(c => c.x + c.w)), y1 = Math.max(...b.cards.map(c => c.y + c.h));
  const top = 68, bottom = 76, pad = 28;
  const W = innerWidth - pad * 2, H = innerHeight - top - bottom;
  const z = clamp(Math.min(W / (x1 - x0), H / (y1 - y0)), .25, 1);
  goTo({ z, x: pad + (W - (x1 - x0) * z) / 2 - x0 * z, y: top + (H - (y1 - y0) * z) / 2 - y0 * z });
}

function select(id) {
  if (selected === id) return;
  world.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected'));
  selected = id;
  if (id) cardEl(id)?.classList.add('selected');
}

function track(onMove, onEnd, cls = '') {
  const classes = ['dragging', ...(cls ? [cls] : [])];
  document.body.classList.add(...classes);
  const end = () => {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', end);
    removeEventListener('pointercancel', end);
    document.body.classList.remove(...classes);
    onEnd();
  };
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}

canvas.addEventListener('pointerdown', e => {
  const onBg = e.target === canvas;
  if (!((onBg && e.button === 0) || e.button === 1)) return;
  if (onBg) { select(null); document.activeElement?.blur?.(); }
  if (board().frozen) return;
  const v = board().view, ox = e.clientX - v.x, oy = e.clientY - v.y;
  track(ev => { v.x = ev.clientX - ox; v.y = ev.clientY - oy; applyView(); }, save, 'panning');
});
canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
canvas.addEventListener('wheel', e => {
  const unit = e.deltaMode === 1 ? 16 : 1;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * unit * .0015));
    return;
  }
  if (e.target.closest('.card')) return;            // let card contents scroll
  e.preventDefault();
  if (board().frozen) return;
  const v = board().view;
  v.x -= (e.shiftKey ? e.deltaY : e.deltaX) * unit;
  v.y -= (e.shiftKey ? 0 : e.deltaY) * unit;
  applyView(); save();
}, { passive: false });
canvas.addEventListener('dblclick', e => {
  if (e.target !== canvas) return;
  const p = toWorld(e.clientX, e.clientY);
  addCard('note', { x: p.x - 20, y: p.y - 20 });
});
canvas.addEventListener('contextmenu', e => {
  if (e.target !== canvas) return;
  e.preventDefault();
  const p = toWorld(e.clientX, e.clientY);
  openMenu(e.clientX, e.clientY, [
    ...Object.entries(TYPES).filter(([, t]) => t.menu).map(([type, t]) => ({ label: t.menu, icon: type, action: () => addCard(type, p) })),
    { label: 'Image, video or PDF…', icon: 'media', action: () => pickMedia(p) },
    { sep: true },
    ...widgetMenu(p),
  ]);
});

/* ------------------------------------------------------------------ *
 *  Cards
 * ------------------------------------------------------------------ */
function place(el, c) {
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';
  el.style.width = c.w + 'px';
  el.style.height = c.h + 'px';
  el.style.zIndex = c.back ? c.z - 1000000 : c.z;   // "behind" cards keep their own order under everything else
  el.classList.toggle('tinted', !!c.color);
  if (c.color) el.style.setProperty('--tint', COLORS[c.color]); else el.style.removeProperty('--tint');
}

function buildCard(c) {
  const el = h('div', { class: `card card-${c.type}`, 'data-id': c.id });
  const title = h('div', { class: 'card-title', title: 'Double-click to rename' }, c.title);
  const more = h('button', {
    class: 'icon-btn', type: 'button', title: 'Colour and more', 'aria-label': 'Card menu',
    onclick() { const r = more.getBoundingClientRect(); cardMenu(c, r.left, r.bottom + 4); },
  }, icon('more'));
  const head = h('div', { class: 'card-head' }, h('span', { class: 'card-icon' }, icon(c.type)), title, more);
  const body = h('div', { class: 'card-body' });
  const grip = h('div', { class: 'card-resize', title: 'Resize' });
  const pin = h('button', {
    class: 'card-pin', type: 'button', title: 'Drag onto another card to tie a string', 'aria-label': 'Tie a string',
    onpointerdown: e => startString(e, c),
  });
  el.append(head, body, grip, pin);

  el.addEventListener('pointerdown', () => {
    if (c.z !== maxZ) { c.z = ++maxZ; place(el, c); save(); }
    select(c.id);
  }, true);
  head.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, input, a') || e.target.isContentEditable) return;
    dragCard(e, c, el, 'move');
  });
  head.addEventListener('contextmenu', e => {
    if (e.target.isContentEditable || e.target.closest('input')) return;
    e.preventDefault();
    cardMenu(c, e.clientX, e.clientY);
  });
  grip.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); dragCard(e, c, el, 'size'); } });
  title.addEventListener('dblclick', () => renameCard(c));

  TYPES[c.type].build(c, body, head, more);
  if (c.type === 'web' && c.plain && c.url) el.classList.add('web-plain');
  if (c.veil) el.classList.add('veil', 'veil-' + c.veil);
  place(el, c);
  if (selected === c.id) el.classList.add('selected');
  return el;
}

function dragCard(e, c, el, mode) {
  const z = board().view.z, sx = e.clientX, sy = e.clientY;
  const o = { x: c.x, y: c.y, w: c.w, h: c.h };
  let moved = false;
  track(ev => {
    const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    moved = true;
    if (mode === 'move') { c.x = snap(o.x + dx); c.y = snap(o.y + dy); }
    else {
      c.w = Math.max(minW(c), snap(o.w + dx));
      c.h = Math.max(minH(c), snap(o.h + dy));
      // pictures, videos and widgets keep their shape unless Shift is held
      const ratio = c.type === 'media' ? (c.kind !== 'pdf' && c.ratio) : c.type === 'widget' ? WIDGETS[c.widget]?.ratio : 0;
      if (ratio && !ev.shiftKey) c.h = Math.round(c.w / ratio);
    }
    place(el, c);
    drawStrings();
  }, () => {
    if (!moved) return;
    save();
    // a drag that started on something clickable must not also count as a click on it
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    el.addEventListener('click', swallow, true);
    setTimeout(() => el.removeEventListener('click', swallow, true), 60);
  });
}

/* ---- strings: wool tied from one card's pin to another's ---- */
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}
const stringsEl = svg('svg', { class: 'strings', 'aria-hidden': 'true' });
const pinOf = c => ({ x: c.x + c.w / 2, y: c.y });
function sagCurve(a, b) {
  const sag = Math.min(110, Math.hypot(b.x - a.x, b.y - a.y) * .1 + 6);   // loose wool hangs a little
  return `M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag} ${b.x} ${b.y}`;
}

function drawStrings() {
  const b = board(), byId = new Map(b.cards.map(c => [c.id, c])), pinned = new Set(), nodes = [];
  for (const s of b.strings) {
    const from = byId.get(s.from), to = byId.get(s.to);
    if (!from || !to) continue;
    pinned.add(from.id).add(to.id);
    const p = pinOf(from), q = pinOf(to), d = sagCurve(p, q);
    const g = svg('g', { class: 'string' });
    if (s.color) g.style.setProperty('--sc', COLORS[s.color]);
    g.append(svg('path', { class: 'string-hit', d }), svg('path', { class: 'string-wool', d }), svg('path', { class: 'string-twist', d }),
      svg('circle', { class: 'string-knot', cx: p.x, cy: p.y, r: 5 }), svg('circle', { class: 'string-knot', cx: q.x, cy: q.y, r: 5 }));
    const openMenuHere = e => { e.preventDefault(); e.stopPropagation(); stringMenu(s, e.clientX, e.clientY); };
    g.addEventListener('click', openMenuHere);
    g.addEventListener('contextmenu', openMenuHere);
    nodes.push(g);
  }
  stringsEl.replaceChildren(...nodes);
  world.querySelectorAll('.card').forEach(el => el.classList.toggle('pinned', pinned.has(el.dataset.id)));
}

function startString(e, c) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const from = pinOf(c);
  const temp = svg('path', { class: 'string-wool string-temp' });
  stringsEl.append(temp);
  let target = null, moved = false;
  const mark = el => {
    if (target === el) return;
    target?.classList.remove('string-target');
    target = el;
    target?.classList.add('string-target');
  };
  track(ev => {
    moved = true;
    temp.setAttribute('d', sagCurve(from, toWorld(ev.clientX, ev.clientY)));
    const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.card');
    mark(el && el.dataset.id !== c.id ? el : null);
  }, () => {
    temp.remove();
    const el = target;
    mark(null);
    if (el) addString(c.id, el.dataset.id);
    else if (!moved) toast('Drag this pin onto another card to tie a string between them.');
  }, 'connecting');
}

function addString(from, to) {
  const b = board();
  if (b.strings.some(s => (s.from === from && s.to === to) || (s.from === to && s.to === from))) {
    toast('Those two are already tied together.');
    return;
  }
  b.strings.push({ id: uid(), from, to, color: null });
  drawStrings(); save();
}

function stringMenu(s, x, y) {
  openMenu(x, y, [
    { swatches: COLORS, current: s.color, pick(key) { s.color = key; drawStrings(); save(); } },
    { sep: true },
    {
      label: 'Cut string', icon: 'x', danger: true,
      action() {
        const b = board(), i = b.strings.indexOf(s);
        if (i >= 0) b.strings.splice(i, 1);
        drawStrings(); save();
      },
    },
  ]);
}
/* Detach every string tied to a card; returns them so an undo can re-tie. */
function cutStringsOf(b, id) {
  const cut = b.strings.filter(s => s.from === id || s.to === id);
  if (cut.length) b.strings = b.strings.filter(s => !cut.includes(s));
  return cut;
}

function refreshCard(c) { cardEl(c.id)?.replaceWith(buildCard(c)); drawStrings(); }

function renameCard(c) {
  const title = cardEl(c.id)?.querySelector('.card-title');
  if (!title) return;
  editInline(title, v => {
    if (v) { c.title = v.slice(0, 80); c.named = true; save(); }
    title.textContent = c.title;
  });
}

function addCard(type, at, extra) {
  const t = TYPES[type], b = board(), v = b.view;
  const c = { id: uid(), type, x: 0, y: 0, w: t.w, h: t.h, z: ++maxZ, title: t.label, color: null, ...t.make(), ...extra };
  if (at) { c.x = at.x; c.y = at.y; }
  else {
    const n = b.cards.length % 6;
    c.x = (innerWidth / 2 - v.x) / v.z - c.w / 2 + n * 26;
    c.y = (innerHeight / 2 - v.y) / v.z - c.h / 2 + n * 26;
  }
  c.x = snap(c.x); c.y = snap(c.y);
  b.cards.push(c);
  const el = buildCard(c);
  stringsEl.before(el);
  select(c.id);
  save();
  if (!extra) el.querySelector('.note-text, .todo-add, .web-url, .files-path')?.focus();
  return c;
}

function duplicateCard(c) {
  const copy = { ...structuredClone(c), id: uid(), x: c.x + 26, y: c.y + 26, z: ++maxZ };
  board().cards.push(copy);
  stringsEl.before(buildCard(copy));
  select(copy.id);
  save();
}

function removeCard(c) {
  const b = board(), i = b.cards.indexOf(c);
  if (i < 0) return;
  b.cards.splice(i, 1);
  const cut = cutStringsOf(b, c.id);
  cardEl(c.id)?.remove();
  if (selected === c.id) selected = null;
  drawStrings(); save();
  toast(`“${c.title}” deleted`, 'Undo', () => {
    const home = state.boards.find(x => x.id === b.id) || board();
    home.cards.push(c);
    if (home.id === b.id) home.strings.push(...cut.filter(s => home.cards.some(k => k.id === (s.from === c.id ? s.to : s.from))));
    if (home.id === state.active) { stringsEl.before(buildCard(c)); drawStrings(); }
    save();
  });
}

function cardMenu(c, x, y) { openMenu(x, y, cardItems(c)); }
function cardItems(c) {
  const el = cardEl(c.id), bare = isBare(c);
  const others = state.boards.filter(b => b.id !== state.active);
  return [
    !bare && { swatches: COLORS, current: c.color, pick(key) { c.color = key; place(el, c); save(); } },
    !bare && { sep: true },
    c.type === 'todo' && c.items.some(i => i.done) && {
      label: 'Clear completed', icon: 'check',
      action() { c.items = c.items.filter(i => !i.done); refreshCard(c); save(); },
    },
    (c.type === 'media' || bare) && {
      label: c.back ? 'Bring in front of cards' : 'Keep behind other cards', icon: 'layers',
      action() { c.back = !c.back; place(el, c); save(); },
    },
    !bare && { label: 'Hide the contents', icon: 'eye', items: [
      { label: 'Always visible', checked: !c.veil, action() { delete c.veil; refreshCard(c); save(); } },
      { label: 'Until I point at it', checked: c.veil === 'hover', action() { c.veil = 'hover'; refreshCard(c); save(); } },
      { label: 'Until I click it', checked: c.veil === 'click', action() { c.veil = 'click'; refreshCard(c); save(); } },
    ] },
    c.type === 'note' && !c.lock && {
      label: 'Markdown', checked: !!c.markdown,
      action() {
        if (c.markdown) { c.html = cleanHTML(MD.render(c.md)); c.md = ''; c.markdown = false; }
        else { c.md = MD.fromHtml(c.html); c.html = ''; c.markdown = true; }
        refreshCard(c); save();
      },
    },
    (c.type === 'note' || c.type === 'todo') && { label: 'Export as Markdown (.md)', icon: 'file', action: () => exportCard(c) },
    c.type === 'note' && !c.lock && { label: 'Lock with a password…', icon: 'lock', action: () => startLock(c) },
    c.type === 'note' && c.lock && opened.has(c.id) && { label: 'Lock now', icon: 'lock', action() { opened.delete(c.id); refreshCard(c); } },
    c.type === 'note' && c.lock && opened.has(c.id) && { label: 'Remove the password', icon: 'x', action() {
      if (c.markdown) c.md = opened.get(c.id).text; else c.html = opened.get(c.id).text;
      delete c.lock; opened.delete(c.id); refreshCard(c); save();
    } },
    c.type === 'web' && { label: 'Show only the website (no frame)', checked: !!c.plain, action() { c.plain = !c.plain; refreshCard(c); save(); } },
    !bare && { label: 'Rename', icon: 'edit', action: () => renameCard(c) },
    { label: 'Duplicate', icon: 'copy', action: () => duplicateCard(c) },
    ...others.map(b => ({
      label: `Move to “${b.name}”`, icon: 'arrow',
      action() {
        const from = board();
        from.cards.splice(from.cards.indexOf(c), 1);
        cutStringsOf(from, c.id);
        c.z = Math.max(0, ...b.cards.map(k => k.z)) + 1;
        b.cards.push(c);
        el.remove();
        if (selected === c.id) selected = null;
        drawStrings(); save();
        toast(`Moved to “${b.name}”`);
      },
    })),
    { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, action: () => removeCard(c) },
  ];
}

/* ---- note ---- */
/* Locked notes: the text is kept encrypted (AES-GCM, key derived from the password with PBKDF2).
   The password itself is never stored, so a forgotten one cannot be recovered. */
const opened = new Map();                           // card id -> { key, html } for notes unlocked in this tab
function b64(buf) {
  const u = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < u.length; i += 0x8000) out += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(out);
}
const unb64 = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(c, key, text) {                  // (re)encrypt the note; nothing readable stays in the saved data
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  c.lock = { salt: c.lock.salt, iv: b64(iv), data: b64(data) };
  c.html = ''; c.md = '';
}
function startLock(c) {
  const body = cardEl(c.id)?.querySelector('.card-body');
  if (!body) return;
  if (!globalThis.crypto || !crypto.subtle) { toast('Locking notes needs the installed extension or the preview address; this page cannot encrypt.'); return; }
  const one = h('input', { class: 'field', type: 'password', placeholder: 'Password', 'aria-label': 'Password', autocomplete: 'new-password' });
  const two = h('input', { class: 'field', type: 'password', placeholder: 'Same password again', 'aria-label': 'Password again', autocomplete: 'new-password' });
  const msg = h('p', { class: 'hint' }, 'The note is saved encrypted. There is no way to open it without the password, so do not forget it.');
  body.replaceChildren(h('form', {
    class: 'lock-form',
    async onsubmit(e) {
      e.preventDefault();
      if (!one.value) { msg.textContent = 'Type a password first.'; return; }
      if (one.value !== two.value) { msg.textContent = 'The two passwords are not the same.'; return; }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await keyFrom(one.value, salt);
      const text = (c.markdown ? c.md : c.html) || '';
      c.lock = { salt: b64(salt) };
      await seal(c, key, text);
      opened.delete(c.id);
      refreshCard(c); save();
    },
    onkeydown(e) { if (e.key === 'Escape') { e.stopPropagation(); refreshCard(c); } },
  }, icon('lock'), msg, one, two, h('div', { class: 'btn-row' },
    h('button', { class: 'btn', type: 'button', onclick: () => refreshCard(c) }, 'Cancel'),
    h('button', { class: 'btn primary', type: 'submit' }, 'Lock'))));
  one.focus();
}
function buildNote(c, body) {
  const open = opened.get(c.id);
  if (c.lock && !open) {                              // locked: ask for the password
    const pass = h('input', { class: 'field', type: 'password', placeholder: 'Password', 'aria-label': 'Password', autocomplete: 'off' });
    const msg = h('p', { class: 'hint' }, 'This note is locked.');
    body.append(h('form', {
      class: 'lock-form',
      async onsubmit(e) {
        e.preventDefault();
        try {
          const key = await keyFrom(pass.value, unb64(c.lock.salt));
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(c.lock.iv) }, key, unb64(c.lock.data));
          const text = new TextDecoder().decode(plain);
          opened.set(c.id, { key, text: c.markdown ? text : cleanHTML(text) });
          refreshCard(c);
          cardEl(c.id)?.querySelector('.note-text')?.focus();
        } catch { msg.textContent = 'That password does not open this note.'; pass.value = ''; pass.focus(); }
      },
    }, icon('lock'), msg, pass, h('button', { class: 'btn primary', type: 'submit' }, 'Unlock')));
    return;
  }
  if (c.markdown) { buildMdNote(c, body, open); return; }
  const ed = h('div', { class: 'note-text', contenteditable: 'true', 'data-placeholder': 'Write something…' });
  ed.innerHTML = open ? open.text : (c.html || '');
  let timer = 0;
  const keep = now => {
    if (!c.lock) { c.html = ed.innerHTML; save(); return; }
    open.text = ed.innerHTML;                         // unlocked: only the encrypted copy is saved
    clearTimeout(timer);
    timer = setTimeout(() => seal(c, open.key, open.text).then(save), now ? 0 : 400);
  };
  ed.addEventListener('input', () => keep(false));
  ed.addEventListener('blur', () => {
    if (!ed.textContent.trim() && ed.innerHTML) { ed.innerHTML = ''; keep(true); }
    else if (c.lock) keep(true);
  });
  ed.addEventListener('paste', plainPaste);
  body.append(ed);
}

/* Markdown notes: shown formatted; a click opens the text for editing, leaving the field shows it formatted again.
   Ticking a "- [ ]" box in the formatted view ticks it in the text. */
const MD = globalThis.HomeboardMd;
function buildMdNote(c, body, open) {
  const text = () => (open ? open.text : c.md || '');
  let timer = 0;
  const sealSoon = now => { clearTimeout(timer); timer = setTimeout(() => seal(c, open.key, open.text).then(save), now ? 0 : 400); };
  const set = v => { if (open) { open.text = v; sealSoon(); } else { c.md = v; save(); } };
  const view = h('div', { class: 'note-text md-view', tabindex: '0', 'data-placeholder': 'Write something…', title: 'Click to edit' });
  const src = h('textarea', { class: 'note-text md-src', spellcheck: 'true', 'aria-label': 'Note text (Markdown)',
    placeholder: 'Write in Markdown:  # heading   **bold**   *italic*   - list   - [ ] task   [link](https://…)   `code`' });
  const show = () => { view.innerHTML = MD.render(text()); body.replaceChildren(view); };
  const edit = () => { src.value = text(); body.replaceChildren(src); src.focus(); src.setSelectionRange(src.value.length, src.value.length); };
  view.addEventListener('click', e => {
    const box = e.target.closest('input[type="checkbox"][data-line]');
    if (box) { set(MD.toggleTask(text(), +box.dataset.line)); show(); return; }
    if (e.target.closest('a') || String(getSelection())) return;      // following a link, or selecting text to copy
    edit();
  });
  view.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); edit(); } });
  src.addEventListener('input', () => set(src.value));
  src.addEventListener('blur', () => { if (open) sealSoon(true); show(); });
  src.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); src.blur(); return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {                   // indent / outdent the line
      e.preventDefault();
      const v = src.value, start = v.lastIndexOf('\n', src.selectionStart - 1) + 1;
      if (e.shiftKey) { if (v.startsWith('  ', start)) src.setRangeText('', start, start + 2, 'end'); }
      else src.setRangeText('  ', start, start, 'end');
      set(src.value);
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || src.selectionStart !== src.selectionEnd) return;
    const v = src.value, at = src.selectionStart, start = v.lastIndexOf('\n', at - 1) + 1, line = v.slice(start, at);
    const m = /^(\s*)([-*+]|(\d{1,9})([.)]))\s+(\[[ xX]\]\s+)?/.exec(line);
    if (!m) return;                                                      // lists carry on by themselves
    e.preventDefault();
    if (line.trim() === m[0].trim()) src.setRangeText('', start, at, 'end');          // an empty item ends the list
    else src.setRangeText(`\n${m[1]}${m[3] ? +m[3] + 1 + m[4] : m[2]} ${m[5] ? '[ ] ' : ''}`, at, at, 'end');
    set(src.value);
  });
  if (text().trim()) show(); else body.replaceChildren(src);
}

/* ---- Markdown export ---- */
const fileSafe = v => (String(v || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || 'Untitled').slice(0, 80);
function cardMarkdown(c) {
  if (c.type === 'note') {
    if (c.lock) { const o = opened.get(c.id); return o ? (c.markdown ? o.text : MD.fromHtml(o.text)) : null; }
    return c.markdown ? c.md || '' : MD.fromHtml(c.html);
  }
  if (c.type === 'todo') {
    const out = [];
    for (const i of c.items) {
      out.push(`- [${i.done ? 'x' : ' '}] ${i.text}${i.star ? ' ⭐' : ''}${i.due ? ` (due ${i.due})` : ''}`);
      for (const t of i.steps) out.push(`    - [${t.done ? 'x' : ' '}] ${t.text}`);
      if (i.link) out.push(`    - ${addressLabel(i.link)}`);
      if (i.note) out.push(...i.note.split('\n').map(l => '    > ' + l));
    }
    return out.join('\n');
  }
  return null;
}
function download(name, blob) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportCard(c) {
  const text = cardMarkdown(c);
  if (text == null) { toast('Unlock the note first to export it.'); return; }
  download(fileSafe(c.title) + '.md', new Blob([text], { type: 'text/markdown;charset=utf-8' }));
}
/* A board (with the boards inside it) or everything, as a .zip of .md files in board folders.
   Strings between cards become [[links]], as in Obsidian. Locked notes are never exported in bulk. */
function exportNotes(rootId) {
  const files = [], taken = new Set();
  let skipped = 0;
  const folder = b => { const parts = []; for (let p = b, n = 0; p && n < 50; p = boardById(p.parent), n++) parts.unshift(fileSafe(p.name)); return parts.join('/'); };
  for (const b of state.boards.filter(o => !rootId || isUnder(o, rootId))) {
    const dir = folder(b), names = new Map();
    const unique = base => { let n = base, k = 2; while (taken.has(`${dir}/${n}`.toLowerCase())) n = `${base} (${k++})`; taken.add(`${dir}/${n}`.toLowerCase()); return n; };
    for (const c of b.cards) {
      if (c.type !== 'note' && c.type !== 'todo') continue;
      if (c.lock) { skipped++; continue; }
      names.set(c.id, unique(fileSafe(c.title)));
    }
    for (const c of b.cards) {
      if (!names.has(c.id)) continue;
      let text = cardMarkdown(c);
      const ties = b.strings.filter(t => t.from === c.id || t.to === c.id).map(t => names.get(t.from === c.id ? t.to : t.from)).filter(Boolean);
      if (ties.length) text += `\n\n---\nLinked: ${ties.map(n => `[[${n}]]`).join(', ')}\n`;
      files.push({ name: `${dir}/${names.get(c.id)}.md`, text });
    }
    if (b.side && b.sideHtml && MD.fromHtml(b.sideHtml).trim()) files.push({ name: `${dir}/${unique('Board notes')}.md`, text: MD.fromHtml(b.sideHtml) });
  }
  if (!files.length) { toast(skipped ? 'Only locked notes here, and those are never exported together.' : 'There are no notes or to-do lists to export.'); return; }
  download(`${rootId ? fileSafe(boardById(rootId).name) : 'homeboard-notes'}-${dayStamp()}.zip`, MD.zip(files));
  toast(`${files.length} Markdown file${files.length > 1 ? 's' : ''} exported${skipped ? `; ${skipped} locked note${skipped > 1 ? 's' : ''} left out` : ''}.`);
}

/* ---- to-do ---- */
const dayStamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dueLabel(due) {
  const [y, m, d] = due.split('-').map(Number), when = new Date(y, m - 1, d);
  const days = Math.round((when - new Date(new Date().setHours(0, 0, 0, 0))) / 864e5);
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday'
       : when.toLocaleDateString([], { day: 'numeric', month: 'short', ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
const newTask = text => ({ id: uid(), text, done: false, steps: [], note: '', link: '', due: '', star: false });

function buildTodo(c, body, head, more) {
  const list = h('div', { class: 'todo-list' });
  const count = h('span', { class: 'card-meta' });
  more.before(count);
  const recount = () => {
    const done = c.items.filter(i => i.done).length;
    count.textContent = c.items.length ? `${done}/${c.items.length}` : '';
  };
  const drop = (it, wrap) => {
    c.items.splice(c.items.indexOf(it), 1);
    wrap.remove(); recount(); save();
  };
  const checkBox = (item, onChange, small) => {
    const b = h('button', {
      class: 'todo-check' + (small ? ' small' : ''), type: 'button', role: 'checkbox', 'aria-checked': String(item.done), 'aria-label': 'Done',
      onclick() { item.done = !item.done; b.setAttribute('aria-checked', String(item.done)); onChange(); save(); },
    }, icon('check'));
    return b;
  };

  const makeRow = it => {
    const text = h('div', { class: 'todo-text', contenteditable: 'true', spellcheck: 'false' }, it.text);
    const meta = h('div', { class: 'todo-meta' });
    const grip = h('span', { class: 'todo-grip', title: 'Drag to reorder' }, icon('grip'));
    const expand = h('button', { class: 'icon-btn todo-more', type: 'button', title: 'Steps, note, link, due date', 'aria-label': 'Details', 'aria-expanded': 'false', onclick: () => toggle() }, icon('chev'));
    const row = h('div', { class: 'todo-item' }, grip,
      checkBox(it, () => { wrap.classList.toggle('done', it.done); drawMeta(); recount(); }),
      h('div', { class: 'todo-main' }, text, meta), expand,
      h('button', { class: 'icon-btn todo-del', type: 'button', title: 'Remove', 'aria-label': 'Remove task', onclick: () => drop(it, wrap) }, icon('x')));
    const wrap = h('div', { class: 'todo-wrap' + (it.done ? ' done' : ''), 'data-item': it.id }, row);
    let detail = null;

    /* the quiet line under a task: what is attached to it */
    const drawMeta = () => {
      const bits = [];
      if (it.star) bits.push(h('span', { class: 'todo-chip star', title: 'Important' }, '★'));
      if (it.steps.length) bits.push(h('span', { class: 'todo-chip' }, `${it.steps.filter(s => s.done).length}/${it.steps.length} steps`));
      if (it.due) bits.push(h('span', { class: 'todo-chip' + (!it.done && it.due < dayStamp() ? ' late' : '') }, dueLabel(it.due)));
      if (it.note) bits.push(h('span', { class: 'todo-chip', title: it.note }, 'note'));
      if (it.link) bits.push(h('a', { class: 'todo-chip link', href: isLocal(it.link) ? '#' : it.link, title: addressLabel(it.link),
        onclick(e) { e.preventDefault(); openExternal(it.link); } }, titleOf(it.link)));
      meta.replaceChildren(...bits);
    };

    const buildDetail = () => {
      const steps = h('div', { class: 'todo-steps' });
      const stepRow = s => {
        const t = h('div', { class: 'todo-text', contenteditable: 'true', spellcheck: 'false' }, s.text);
        const r = h('div', { class: 'todo-step' + (s.done ? ' done' : '') },
          checkBox(s, () => { r.classList.toggle('done', s.done); drawMeta(); }, true), t,
          h('button', { class: 'icon-btn todo-del', type: 'button', title: 'Remove step', 'aria-label': 'Remove step',
            onclick() { it.steps.splice(it.steps.indexOf(s), 1); r.remove(); drawMeta(); save(); } }, icon('x')));
        t.addEventListener('input', () => { s.text = t.textContent; save(); });
        t.addEventListener('paste', plainPaste);
        t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addStep.focus(); } });
        return r;
      };
      const addStep = h('input', {
        class: 'field todo-field', type: 'text', placeholder: 'Add a step', 'aria-label': 'Add a step',
        onkeydown(e) {
          if (e.key !== 'Enter' || !addStep.value.trim()) return;
          const s = { id: uid(), text: addStep.value.trim(), done: false };
          it.steps.push(s); steps.append(stepRow(s));
          addStep.value = ''; drawMeta(); save();
        },
      });
      it.steps.forEach(s => steps.append(stepRow(s)));

      const note = h('textarea', { class: 'field todo-field todo-note', rows: '2', placeholder: 'Notes: what this needs, how to do it…', 'aria-label': 'Notes', value: it.note });
      note.addEventListener('input', () => { it.note = note.value; drawMeta(); save(); });

      const link = h('input', { class: 'field todo-field', type: 'text', placeholder: 'Link to open later (web address or folder)', 'aria-label': 'Link', value: addressLabel(it.link), spellcheck: 'false' });
      const setLink = () => {
        const v = link.value.trim(), u = v ? toAddress(v) : '';
        link.classList.toggle('bad', !!v && !u);
        if (v && !u) return;
        it.link = u || ''; drawMeta(); save();
      };
      link.addEventListener('change', setLink);
      link.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setLink(); link.blur(); } });

      const due = h('input', { class: 'field todo-field', type: 'date', title: 'Due date', 'aria-label': 'Due date', value: it.due });
      due.addEventListener('change', () => { it.due = /^\d{4}-\d\d-\d\d$/.test(due.value) ? due.value : ''; drawMeta(); save(); });
      const star = h('button', { class: 'btn todo-star' + (it.star ? ' on' : ''), type: 'button', title: 'Important', 'aria-pressed': String(it.star),
        onclick() { it.star = !it.star; star.classList.toggle('on', it.star); star.setAttribute('aria-pressed', String(it.star)); drawMeta(); save(); } }, '★');
      return h('div', { class: 'todo-detail' }, steps, addStep, note, link, h('div', { class: 'todo-row2' }, due, star));
    };
    const toggle = () => {
      if (detail) { detail.remove(); detail = null; } else { detail = buildDetail(); wrap.append(detail); }
      wrap.classList.toggle('open', !!detail);
      expand.setAttribute('aria-expanded', String(!!detail));
    };

    text.addEventListener('input', () => { it.text = text.textContent; save(); });
    text.addEventListener('paste', plainPaste);
    text.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); input.focus(); }
      else if (e.key === 'Backspace' && !text.textContent) { e.preventDefault(); drop(it, wrap); input.focus(); }
    });
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      wrap.classList.add('moving');
      track(ev => {
        const next = [...list.children].find(n => {
          if (n === wrap) return false;
          const r = n.getBoundingClientRect();
          return ev.clientY < r.top + r.height / 2;
        });
        if (next) { if (wrap.nextElementSibling !== next) list.insertBefore(wrap, next); }
        else if (list.lastElementChild !== wrap) list.append(wrap);
      }, () => {
        wrap.classList.remove('moving');
        const order = [...list.children].map(n => n.dataset.item);
        c.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        save();
      });
    });
    drawMeta();
    return wrap;
  };

  const input = h('input', {
    class: 'field todo-add', type: 'text', placeholder: 'Add a task…', 'aria-label': 'Add a task',
    onkeydown(e) {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const it = newTask(input.value.trim());
      c.items.push(it);
      list.append(makeRow(it));
      input.value = '';
      list.scrollTop = list.scrollHeight;
      recount(); save();
    },
  });
  c.items.forEach(it => list.append(makeRow(it)));
  recount();
  body.append(list, input);
}

/* ---- quick links: web addresses, and folders or files on this computer ---- */
const canReadSites = !!(api && api.runtime && api.runtime.id);   // only the extension may fetch other sites' files
const iconTried = new Set();
async function keepIcon(origin) {                    // remember a site's icon so its tile looks the same offline
  if (!canReadSites || !origin || iconTried.has(origin)) return;
  iconTried.add(origin);
  try {
    const r = await fetch(origin + '/favicon.ico', { referrerPolicy: 'no-referrer', credentials: 'omit' });
    const blob = await r.blob();
    if (r.ok && blob.size > 0 && blob.size < 300000) {
      await mediaStore.put('fav:' + origin, blob.type.startsWith('image/') ? blob : new Blob([blob], { type: 'image/x-icon' }), 'icon');
    }
  } catch { /* this page may not read other sites (only the extension can): the icon stays online-only */ }
}
let explorerHinted = false;
function openLink(l, how = l.how) {
  if (how === 'explorer') {
    // File Explorer can only be reached through a link type Windows knows; see tools/install-explorer-helper.ps1
    const f = h('iframe', { hidden: true, src: 'homeboard-open:' + encodeURIComponent(addressLabel(l.url)) });
    document.body.append(f);
    setTimeout(() => f.remove(), 3000);
    if (!explorerHinted) {
      explorerHinted = true;
      toast('Asked Windows to open File Explorer. If nothing happens, run tools\\install-explorer-helper.ps1 from the Homeboard folder once.');
    }
  } else if (fileAccess) openExternal(l.url);
  else toast(localHint());
}

function buildLinks(c, body) {
  const grid = h('div', { class: 'links-grid' });
  let form = null;

  const tile = l => {
    const local = isLocal(l.url), name = l.title || titleOf(l.url);
    const ico = h('span', { class: 'link-ico' });
    if (local) ico.append(icon(/[\\/]$/.test(addressLabel(l.url)) || !/\.[a-z0-9]{1,5}$/i.test(l.url) ? 'folder' : 'file'));
    else {
      let origin = '';
      try { origin = new URL(l.url).origin; } catch { /* letter fallback */ }
      const img = h('img', { alt: '', referrerpolicy: 'no-referrer', draggable: 'false' });
      const letter = () => { img.remove(); ico.textContent = (name[0] || '?').toUpperCase(); };
      img.addEventListener('error', letter);
      img.addEventListener('load', () => { if (img.naturalWidth < 8) letter(); else if (!img.src.startsWith('blob:')) keepIcon(origin); });
      ico.append(img);
      // the site's icon: the copy kept on this computer if there is one (works offline), else straight from the site
      const live = origin + '/favicon.ico';
      mediaStore.url('fav:' + origin).then(u => { img.src = u || live; }, () => { img.src = live; });
    }
    const a = h('a', { class: 'link-tile', href: local ? '#' : l.url, title: addressLabel(l.url), draggable: 'false', rel: 'noopener' },
      ico, h('span', { class: 'link-name' }, name));
    if (local) a.addEventListener('click', e => { e.preventDefault(); openLink(l); });
    a.addEventListener('contextmenu', e => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, [
        ...(local ? [{ label: 'Open in File Explorer', icon: 'folder', action: () => openLink(l, 'explorer') },
                     { label: 'Open in a browser tab', icon: 'external', action: () => openLink(l, 'tab') }]
                  : [{ label: 'Open in new tab', icon: 'external', action: () => window.open(l.url, '_blank', 'noopener') }]),
        { label: 'Edit', icon: 'edit', action: () => edit(l) },
        { label: 'Remove', icon: 'trash', danger: true, action() { c.links.splice(c.links.indexOf(l), 1); draw(); save(); } },
      ]);
    });
    return a;
  };

  const draw = () => grid.replaceChildren(...c.links.map(tile),
    h('button', { class: 'link-tile link-add', type: 'button', title: 'Add a link', onclick: () => edit(null) },
      h('span', { class: 'link-ico' }, icon('plus')), h('span', { class: 'link-name' }, 'Add')));

  const edit = l => {
    form?.remove();
    const url = h('input', { class: 'field', type: 'text', placeholder: 'example.com, or a folder like C:\\Users\\you\\Documents', value: l ? addressLabel(l.url) : '', spellcheck: 'false', 'aria-label': 'Address or folder' });
    const name = h('input', { class: 'field', type: 'text', placeholder: 'Name (optional)', value: l ? l.title : '', 'aria-label': 'Name' });
    const how = h('select', { class: 'field', 'aria-label': 'Open with' },
      h('option', { value: 'tab' }, 'Open in a browser tab'), h('option', { value: 'explorer' }, 'Open in File Explorer'));
    how.value = l && l.how === 'explorer' ? 'explorer' : 'tab';
    const syncHow = () => { how.hidden = !isLocal(toAddress(url.value) || ''); };   // only folders and files get the choice
    url.addEventListener('input', syncHow);
    syncHow();
    const close = () => { form.remove(); form = null; };
    form = h('form', {
      class: 'link-form',
      onsubmit(e) {
        e.preventDefault();
        const u = toAddress(url.value);
        if (!u) { url.classList.add('bad'); url.focus(); return; }
        const next = { url: u, title: name.value.trim(), how: isLocal(u) ? how.value : 'tab' };
        if (l) Object.assign(l, next); else c.links.push({ id: uid(), ...next });
        close(); draw(); save();
      },
      onkeydown(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } },
    }, url, name, how, h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'submit' }, l ? 'Save' : 'Add')));
    body.append(form);
    url.focus();
  };

  draw();
  body.append(grid);
}

/* ---- the helper: a small program on this computer that does what a page may not ----
   (move files, open them with their usual program, run a console, write backups). See helper/server.js. */
const helper = {
  base: 'http://127.0.0.1:8767', token: null, up: false, checked: 0,
  async key() {                                       // the key sits in Homeboard's own folder; only its pages can read it
    if (this.token || !api?.runtime?.getURL) return this.token;
    try { const r = await fetch(api.runtime.getURL('helper/token.txt'), { cache: 'no-store' }); if (r.ok) this.token = (await r.text()).trim(); } catch { /* helper never started */ }
    return this.token;
  },
  async call(what, body) {
    const key = await this.key();
    if (!key) throw new Error(HELPER_HINT);
    let r;
    try { r = await fetch(this.base + what, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
    catch { this.up = false; throw new Error(HELPER_HINT); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'The helper could not do that.');
    return j;
  },
  async ready(force) {
    if (!force && Date.now() - this.checked < 4000) return this.up;
    this.checked = Date.now();
    try { await this.call('/ping'); this.up = true; } catch { this.up = false; this.token = null; }
    return this.up;
  },
};
const HELPER_HINT = 'This needs the Homeboard helper. In the Homeboard folder, right-click tools\\start-helper.ps1 and choose “Run with PowerShell”.';
const FILES_DND = 'application/x-homeboard-files';
let fileClip = null;                                 // { paths, cut } from Copy / Cut in a file browser
async function backupText() {                        // the whole board as one file, pictures and PDFs included (not the very large ones)
  const out = { ...structuredClone(state), media: {} };
  for (const id of mediaIds()) {
    const rec = await mediaStore.get(id).catch(() => null);
    if (!rec || rec.blob.size > 30e6) continue;
    const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(rec.blob); });
    if (data) out.media[id] = { name: rec.name, data };
  }
  return JSON.stringify(out);
}
async function autoBackup() {                        // once a day, quietly, into the Homeboard folder
  const today = dayStamp();
  if (state.lastBackup === today || !(await helper.ready())) return;
  try { await helper.call('/backup', { data: await backupText() }); state.lastBackup = today; save(); } catch { /* try again next time */ }
}

/* ---- files: a small folder browser with previews ---- */
const TEXT_FILE = /\.(txt|md|markdown|json|js|mjs|cjs|ts|tsx|jsx|css|scss|html?|xml|csv|tsv|log|ini|cfg|conf|ya?ml|toml|ps1|bat|cmd|sh|py|rb|java|c|h|cpp|cs|go|rs|php|sql|reg|env|gitignore)$/i;
const fileKind = name => (/\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i.test(name) ? 'image' : /\.(mp4|webm|mkv|mov|m4v|ogv)$/i.test(name) ? 'video'
  : /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(name) ? 'audio' : /\.pdf$/i.test(name) ? 'pdf' : TEXT_FILE.test(name) ? 'text' : 'other');
/* What kind of file a row is, at a glance: a short coloured tag per type (drawn here, in the spirit of an editor's file icons). */
const FILE_MARKS = {
  js: ['JS', '#f1e05a'], mjs: 'js', cjs: 'js', jsx: ['JSX', '#61dafb'], ts: ['TS', '#3b8eea'], tsx: ['TSX', '#3b8eea'],
  json: ['{ }', '#f5c84c'], html: ['<>', '#f0764a'], htm: 'html', css: ['#', '#6aa8ff'], scss: ['#', '#ee7fc2'], svg: ['SVG', '#f5a04c'],
  md: ['M↓', '#6aa8ff'], markdown: 'md', txt: ['TXT', '#8b93a6'], log: ['LOG', '#8b93a6'], pdf: ['PDF', '#f0564a'],
  py: ['PY', '#4f9bd9'], java: ['JV', '#e6813a'], c: ['C', '#6aa8ff'], h: ['H', '#a78bfa'], cpp: ['C++', '#6aa8ff'], cs: ['C#', '#6fd08c'],
  go: ['GO', '#4fd1c5'], rs: ['RS', '#e6813a'], php: ['PHP', '#a78bfa'], rb: ['RB', '#f0564a'], sql: ['SQL', '#f5c84c'],
  ps1: ['PS', '#6aa8ff'], bat: ['BAT', '#6fd08c'], cmd: 'bat', sh: ['SH', '#6fd08c'], exe: ['EXE', '#8b93a6'], msi: 'exe', dll: ['DLL', '#8b93a6'],
  zip: ['ZIP', '#f5c84c'], rar: 'zip', '7z': 'zip', gz: 'zip', tar: 'zip', iso: ['ISO', '#8b93a6'],
  doc: ['W', '#3b8eea'], docx: 'doc', xls: ['X', '#3fae6a'], xlsx: 'xls', csv: ['CSV', '#3fae6a'], ppt: ['P', '#f0764a'], pptx: 'ppt',
  xml: ['</>', '#f59e5b'], yml: ['YML', '#f0564a'], yaml: 'yml', toml: ['TML', '#8b93a6'], ini: ['INI', '#8b93a6'], cfg: 'ini', env: ['ENV', '#f5c84c'],
  ttf: ['Aa', '#ee7fc2'], otf: 'ttf', woff: 'ttf', woff2: 'ttf', lnk: ['↗', '#8b93a6'], url: 'lnk',
};
const KIND_MARKS = { image: ['media', '#a78bfa'], video: ['play', '#f0717d'], audio: ['volume', '#4fd1c5'] };
function fileMark(name, dir) {
  if (dir) { const i = icon('folder'); i.classList.add('fmark-folder'); return i; }
  let mark = FILE_MARKS[((/\.([^.]+)$/.exec(name) || [])[1] || '').toLowerCase()];
  if (typeof mark === 'string') mark = FILE_MARKS[mark];
  if (mark) { const tag = h('span', { class: 'fmark', 'aria-hidden': 'true' }, mark[0]); tag.style.color = mark[1]; return tag; }
  const kind = KIND_MARKS[fileKind(name)], i = icon(kind ? kind[0] : 'file');
  if (kind) i.style.color = kind[1];
  return i;
}
const sizeText = n => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');

/* Read a folder straight from its file:// address (works in the extension, where the browser hands back its own listing). */
function readFolder(url) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.onload = () => {
      const html = x.responseText, rows = [];
      if (!/addRow\(|start\(/.test(html)) { rej(new Error('not a folder')); return; }
      for (const m of html.matchAll(/addRow\((.*)\);/g)) {
        try {
          const [name, enc, dir, size, , stamp] = JSON.parse('[' + m[1] + ']');
          if (name === '.' || name === '..') continue;
          rows.push({ name, dir: !!dir, size, when: stamp * 1000, url: url + enc + (dir ? '/' : '') });
        } catch { /* a row we cannot read */ }
      }
      res(rows);
    };
    x.onerror = () => rej(new Error('unreadable'));
    x.send();
  });
}
/* Remembered folder permissions for the picker route (pages that cannot read file:// themselves). */
const handleStore = {
  open() {
    return this._db ||= new Promise((res, rej) => {
      const r = indexedDB.open('homeboard-folders', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('h');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction('h', mode), q = fn(t.objectStore('h')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
  },
  get(id) { return this.run('readonly', s => s.get(id)).catch(() => null); },
  put(id, handle) { return this.run('readwrite', s => s.put(handle, id)).catch(() => {}); },
};

function showLightbox(title, node) {
  const close = () => { box.remove(); removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': title, onclick(e) { if (e.target === box) close(); } },
    h('div', { class: 'lightbox-panel pill' },
      h('div', { class: 'lightbox-head' }, h('b', null, title), h('button', { class: 'icon-btn', type: 'button', title: 'Close', 'aria-label': 'Close', onclick: close }, icon('x'))),
      h('div', { class: 'lightbox-body' }, node)));
  addEventListener('keydown', onKey, true);
  document.body.append(box);
}

function buildFiles(c, body) {
  const direct = fileAccess;                         // can type any path; otherwise the user picks a folder once
  const list = h('div', { class: 'files-list', role: 'listbox', 'aria-label': 'Files' });
  const pane = h('div', { class: 'files-preview', hidden: true });
  const where = h('input', { class: 'field files-path', type: 'text', spellcheck: 'false', 'aria-label': 'Folder',
    placeholder: direct ? 'Folder path, e.g. C:\\Users\\you\\Downloads, then Enter' : 'Choose a folder with the button on the right', readonly: !direct });
  let trail = [];                                    // picker route: the chain of folder handles from the chosen root
  let made = [];                                     // blob addresses to release
  const say = (text, btn) => list.replaceChildren(h('div', { class: 'web-empty' }, icon('folder'), h('p', null, text), btn));

  const urlOf = async row => { if (row.url) return row.url; const u = URL.createObjectURL(await row.handle.getFile()); made.push(u); return u; };
  const textOf = async row => {
    if (!row.url) return (await row.handle.getFile()).slice(0, 200000).text();
    return new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', row.url); x.onload = () => res(x.responseText.slice(0, 200000)); x.onerror = rej; x.send(); });
  };
  async function viewer(row, big) {
    const kind = fileKind(row.name);
    if (kind === 'text' && /\.(md|markdown)$/i.test(row.name)) {
      const md = h('div', { class: 'md-view files-md' });
      md.innerHTML = MD.render(await textOf(row).catch(() => 'This file could not be read.'));
      return md;
    }
    if (kind === 'text') return h('pre', { class: 'files-text' }, await textOf(row).catch(() => 'This file could not be read.'));
    const url = await urlOf(row);
    if (kind === 'image') return h('img', { src: url, alt: row.name, draggable: 'false' });
    if (kind === 'video') return h('video', { src: url, controls: true, autoplay: big || null });
    if (kind === 'audio') return h('audio', { src: url, controls: true });
    if (kind === 'pdf') return h('iframe', { src: url, title: row.name });
    return h('div', { class: 'web-empty' }, icon('file'), h('p', null, 'No preview for this kind of file.'));
  }
  const openOut = async row => { const u = await urlOf(row); if (row.url) openExternal(u); else window.open(u, '_blank', 'noopener'); };

  async function preview(row) {
    list.querySelectorAll('.on').forEach(n => n.classList.remove('on'));
    list.querySelector(`[data-name="${CSS.escape(row.name)}"]`)?.classList.add('on');
    pane.hidden = false;
    const stage = h('div', { class: 'files-stage' });
    pane.replaceChildren(
      h('div', { class: 'files-phead' },
        h('span', { class: 'files-pname', title: row.name }, row.name),
        h('span', { class: 'card-meta' }, [row.size != null && sizeText(row.size), row.when && new Date(row.when).toLocaleDateString()].filter(Boolean).join(' · ')),
        h('button', { class: 'icon-btn', type: 'button', title: 'Bigger', 'aria-label': 'Bigger preview', async onclick() { showLightbox(row.name, await viewer(row, true)); } }, icon('expand')),
        h('button', { class: 'icon-btn', type: 'button', title: 'Open in a new tab', 'aria-label': 'Open in a new tab', onclick: () => openOut(row) }, icon('external')),
        h('button', { class: 'icon-btn', type: 'button', title: 'Close preview', 'aria-label': 'Close preview', onclick() { pane.hidden = true; pane.replaceChildren(); } }, icon('x'))),
      stage);
    stage.append(await viewer(row, false));
  }

  function show(rows) {
    rows.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (!rows.length) { say('This folder is empty.'); return; }
    list.replaceChildren(...rows.map(row => {
      const name = h('span', { class: 'files-name' }, row.name);
      const busy = () => name.classList.contains('editing');
      const el = h('div', {
        class: 'files-row' + (row.dir ? ' dir' : ''), role: 'option', tabindex: '0', 'data-name': row.name, title: row.name,
        onclick() { if (busy()) return; if (row.dir) enter(row); else preview(row); },
        ondblclick() { if (!busy() && !row.dir) openOut(row); },
        onkeydown(e) { if (e.key === 'Enter' && !busy()) { e.preventDefault(); if (row.dir) enter(row); else preview(row); } },
      }, fileMark(row.name, row.dir), name,
        h('span', { class: 'card-meta' }, row.dir ? '' : row.size != null ? sizeText(row.size) : ''));
      if (direct) {
        el.draggable = true;                          // drag onto another file browser (or a folder) to move; hold Ctrl to copy
        el.addEventListener('dragstart', e => { e.dataTransfer.setData(FILES_DND, JSON.stringify([pathOf(row.url)])); e.dataTransfer.effectAllowed = 'copyMove'; });
        el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); openMenu(e.clientX, e.clientY, rowMenu(row, name)); });
        if (row.dir) dropInto(el, () => pathOf(row.url));
      }
      return el;
    }));
  }

  /* what the helper adds: real file operations */
  const pathOf = url => addressLabel(url).replace(/([^:])\\$/, '$1');     // "C:\\Users\\me\\" -> "C:\\Users\\me", but keep "C:\\"
  async function act(what, body, done) {
    try { await helper.call(what, body); if (what !== '/open') dispatchEvent(new Event('hb-files')); if (done) toast(done); return true; }
    catch (e) { toast(e.message); return false; }
  }
  function dropInto(el, dest) {
    el.addEventListener('dragover', e => {
      if (!e.dataTransfer.types.includes(FILES_DND)) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
      el.classList.add('drop');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', e => {
      if (!e.dataTransfer.types.includes(FILES_DND)) return;
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('drop');
      let from = [];
      try { from = JSON.parse(e.dataTransfer.getData(FILES_DND)); } catch { /* not ours */ }
      if (from.length && dest()) act(e.ctrlKey ? '/fs/copy' : '/fs/move', { from, to: dest() });
    });
  }
  const rowMenu = (row, name) => [
    { label: row.dir ? 'Open in File Explorer' : 'Open', icon: 'external', action: () => act('/open', { path: pathOf(row.url) }) },
    !row.dir && { label: 'Open in a browser tab', icon: 'web', action: () => openOut(row) },
    { sep: true },
    { label: 'Copy', icon: 'copy', action() { fileClip = { paths: [pathOf(row.url)], cut: false }; toast('Copied. Right-click inside a folder and choose Paste.'); } },
    { label: 'Cut', icon: 'arrow', action() { fileClip = { paths: [pathOf(row.url)], cut: true }; toast('Cut. Right-click inside a folder and choose Paste.'); } },
    { label: 'Rename', icon: 'edit', action: () => editInline(name, v => { if (v && v !== row.name) act('/fs/rename', { path: pathOf(row.url), name: v }).then(ok => { if (!ok) name.textContent = row.name; }); else name.textContent = row.name; }) },
    { sep: true },
    { label: 'Delete (to the Recycle Bin)', icon: 'trash', danger: true, action: () => act('/fs/trash', { paths: [pathOf(row.url)] }, `“${row.name}” is in the Recycle Bin.`) },
  ];
  if (direct) {
    dropInto(list, () => (c.path ? pathOf(c.path) : ''));
    list.addEventListener('contextmenu', e => {
      if (!c.path) return;
      e.preventDefault();
      const clipName = fileClip && fileClip.paths[0].split('\\').pop();
      openMenu(e.clientX, e.clientY, [
        fileClip && { label: `Paste “${clipName}”`, icon: 'check', action() {
          const cut = fileClip.cut;
          act(cut ? '/fs/move' : '/fs/copy', { from: fileClip.paths, to: pathOf(c.path) }).then(ok => { if (ok && cut) fileClip = null; });
        } },
        { label: 'New folder', icon: 'plus', action: () => act('/fs/mkdir', { dir: pathOf(c.path) }) },
        { label: 'Open this folder in File Explorer', icon: 'folder', action: () => act('/open', { path: pathOf(c.path) }) },
        { label: 'Refresh', icon: 'reload', action: () => load() },
      ]);
    });
    const again = () => { if (list.isConnected) load(); else removeEventListener('hb-files', again); };
    addEventListener('hb-files', again);            // any file browser changed something: all of them look again
  }

  async function load() {
    made.forEach(u => URL.revokeObjectURL(u)); made = [];
    pane.hidden = true; pane.replaceChildren();
    if (direct) {
      where.value = addressLabel(c.path);
      if (!c.path) { say('Type a folder path above and press Enter.'); return; }
      try { show(await readFolder(c.path)); } catch { say('That folder could not be opened. Check the path.'); }
      return;
    }
    if (!window.showDirectoryPicker) { say(localHint()); return; }
    if (!trail.length) {
      const root = await handleStore.get(c.id);
      if (!root) { say('Choose a folder to browse it here.', h('button', { class: 'btn primary', type: 'button', onclick: choose }, 'Choose folder…')); return; }
      if (await root.queryPermission({ mode: 'read' }) !== 'granted') {
        say(`Allow access to “${root.name}” again to keep browsing it.`, h('button', { class: 'btn primary', type: 'button',
          async onclick() { if (await root.requestPermission({ mode: 'read' }) === 'granted') { trail = [root]; load(); } } }, 'Allow'));
        return;
      }
      trail = [root];
    }
    where.value = trail.map(d => d.name).join('\\');
    try {
      const rows = [];
      for await (const [name, handle] of trail[trail.length - 1].entries()) {
        const row = { name, dir: handle.kind === 'directory', handle };
        if (!row.dir) { try { const f = await handle.getFile(); row.size = f.size; row.when = f.lastModified; } catch { /* unreadable */ } }
        rows.push(row);
      }
      show(rows);
    } catch { say('That folder could not be read.'); }
  }
  async function choose() {
    try {
      const root = await window.showDirectoryPicker({ mode: 'read' });
      await handleStore.put(c.id, root);
      trail = [root]; load();
    } catch { /* cancelled */ }
  }
  function enter(row) {
    if (direct) { c.path = row.url; save(); } else trail.push(row.handle);
    load();
  }
  function up() {
    if (direct) {
      const parent = c.path.replace(/[^/]+\/$/, '');
      if (!/^file:\/\/\/?[^/]*\/?$/.test(c.path) && parent !== c.path) { c.path = parent; save(); load(); }
    } else if (trail.length > 1) { trail.pop(); load(); }
  }
  where.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !direct) return;
    e.preventDefault();
    const u = toAddress(where.value);
    where.classList.toggle('bad', !u || !isLocal(u));
    if (!u || !isLocal(u)) return;
    c.path = u.replace(/\/?$/, '/');
    if (!c.named) { c.title = titleOf(c.path); const t = body.parentElement?.querySelector('.card-title'); if (t) t.textContent = c.title; }
    save(); load(); where.blur();
  });

  body.append(
    h('div', { class: 'web-bar' },
      h('button', { class: 'icon-btn', type: 'button', title: 'Up one folder', 'aria-label': 'Up one folder', onclick: up }, icon('up')),
      where,
      !direct && h('button', { class: 'icon-btn', type: 'button', title: 'Choose folder…', 'aria-label': 'Choose folder', onclick: choose }, icon('folder')),
      h('button', { class: 'icon-btn', type: 'button', title: 'Refresh', 'aria-label': 'Refresh', onclick: () => load() }, icon('reload'))),
    h('div', { class: 'files-main' }, list, pane));
  load();
}

/* ---- console: PowerShell in a card (through the helper) ---- */
function buildTerm(c, body, head, more) {
  const out = h('pre', { class: 'term-out', tabindex: '0', 'aria-label': 'Console output' });
  const prompt = h('span', { class: 'term-prompt' }, 'PS>');
  const input = h('input', { class: 'term-in', type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Command' });
  body.append(out, h('div', { class: 'term-line' }, prompt, input));
  let id = null, abort = null, past = [], at = 0;
  const print = (text, cls) => {
    out.append(h('span', { class: cls }, text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '')));
    while (out.childNodes.length > 3000) out.firstChild.remove();
    out.scrollTop = out.scrollHeight;
  };
  async function start() {
    out.replaceChildren();
    if (!(await helper.ready(true))) {
      print(HELPER_HINT + '\n', 'err');
      out.append(h('button', { class: 'btn', type: 'button', onclick: start }, 'Try again'));
      return;
    }
    try { id = (await helper.call('/term/start', { cwd: c.cwd })).id; } catch (e) { print(e.message + '\n', 'err'); return; }
    abort = new AbortController();
    try {
      const res = await fetch(`${helper.base}/term/stream?id=${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + helper.token }, signal: abort.signal });
      if (!res.ok) { print('The console could not be connected to the helper.\n', 'err'); id = null; return; }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !out.isConnected) break;          // the card is gone: stop listening (the helper then closes the console)
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buf.slice(0, i));
          buf = buf.slice(i + 1);
          if (msg.cwd != null) {
            if (c.cwd !== msg.cwd) { c.cwd = msg.cwd; save(); }
            prompt.textContent = `PS ${msg.cwd.length > 46 ? '…' + msg.cwd.slice(-44) : msg.cwd}>`;   // long folders show their end
            prompt.title = msg.cwd;
          }
          else if (msg.o) print(msg.o);
          else if (msg.e) print(msg.e, 'err');
          else if ('x' in msg) { print('[the console ended; press Enter to start a new one]\n', 'dim'); id = null; }
        }
      }
    } catch { /* stopped */ }
    abort.abort();
  }
  const restart = () => { if (id) helper.call('/term/stop', { id }).catch(() => {}); abort?.abort(); id = null; start(); };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = input.value;
      input.value = '';
      if (!id) { start(); return; }
      print(`${prompt.textContent} ${cmd}\n`, 'cmd');
      if (cmd.trim()) { past.push(cmd); at = past.length; }
      if (/^\s*(cls|clear)\s*$/i.test(cmd)) { out.replaceChildren(); return; }
      helper.call('/term/write', { id, text: cmd }).catch(err => print(err.message + '\n', 'err'));
    } else if (e.key === 'ArrowUp' && past.length) { e.preventDefault(); at = Math.max(0, at - 1); input.value = past[at]; }
    else if (e.key === 'ArrowDown' && past.length) { e.preventDefault(); at = Math.min(past.length, at + 1); input.value = past[at] || ''; }
    else if (e.key.toLowerCase() === 'c' && e.ctrlKey && input.selectionStart === input.selectionEnd) { e.preventDefault(); print('^C\n', 'dim'); restart(); }
  });
  out.addEventListener('click', () => { if (!String(getSelection())) input.focus(); });
  more.before(h('button', { class: 'icon-btn', type: 'button', title: 'Stop what is running and start a fresh console (Ctrl+C)', 'aria-label': 'Restart console', onclick: restart }, icon('reload')));
  start();
}

/* ---- website window ---- */
const whenOnline = new Set();                        // website windows waiting for the connection to return
const EMBED_HINT = 'If this window stays blank, the site refuses to be shown inside other pages. The window button opens it in its own window beside the board. (The installed Homeboard shows most of these sites right here.)';
/* A site that will not sit inside the board: give it a real browser window, placed where the card is. */
function openBeside(url, el) {
  if (!url) return;
  const r = el.getBoundingClientRect(), chromeTop = Math.max(0, outerHeight - innerHeight), side = Math.max(0, (outerWidth - innerWidth) / 2);
  const box = { left: Math.round(screenX + side + r.left), top: Math.round(screenY + chromeTop + r.top), width: Math.max(420, Math.round(r.width)), height: Math.max(320, Math.round(r.height)) };
  if (api?.windows?.create) api.windows.create({ url, type: 'popup', ...box }).catch(() => openExternal(url));
  else if (!window.open(url, 'hb-' + hostOf(url), `popup,left=${box.left},top=${box.top},width=${box.width},height=${box.height}`)) openExternal(url);
}
const localHint = () => (api?.extension?.isAllowedFileSchemeAccess
  ? 'To show folders and files from this computer, open the browser’s Extensions page, choose Details on Homeboard, switch on “Allow access to file URLs”, then reload this page.'
  : 'Folders and files from this computer can only be shown when Homeboard is installed as the browser extension, or opened directly as a file.');

/* Places a website window can start from; each also knows how to search. */
const WIKI = /^[a-z]{2,3}$/.test((navigator.language || '').slice(0, 2)) ? navigator.language.slice(0, 2).toLowerCase() : 'en';
const SITES = {
  google: { name: 'Google', home: 'https://www.google.com/', q: 'https://www.google.com/search?q=' },
  wikipedia: { name: 'Wikipedia', home: `https://${WIKI}.wikipedia.org/`, q: `https://${WIKI}.wikipedia.org/w/index.php?search=` },
  youtube: { name: 'YouTube', home: 'https://www.youtube.com/', q: 'https://www.youtube.com/results?search_query=' },
  ytmusic: { name: 'YouTube Music', home: 'https://music.youtube.com/', q: 'https://music.youtube.com/search?q=' },
  bing: { name: 'Bing', home: 'https://www.bing.com/', q: 'https://www.bing.com/search?q=' },
  ddg: { name: 'DuckDuckGo', home: 'https://duckduckgo.com/', q: 'https://duckduckgo.com/?q=' },
  maps: { name: 'Maps', home: 'https://www.google.com/maps', q: 'https://www.google.com/maps/search/' },
};
/* Words rather than an address: "cat pictures", "weather". */
const isSearchText = v => !!v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && !/^[a-z]:[\\/]/i.test(v) && !v.startsWith('\\\\')
  && (/\s/.test(v) || !/[.:]/.test(v)) && v.toLowerCase() !== 'localhost';

function buildWeb(c, body) {
  const frame = h('div', { class: 'web-frame' });
  const url = h('input', {
    class: 'field web-url', type: 'text', placeholder: 'Search, or type a web address, PDF link or folder path',
    value: addressLabel(c.url), spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Address or search',
  });
  const show = u => {
    c.url = u;
    url.value = addressLabel(u);
    url.classList.remove('bad');
    if (!c.named) {
      c.title = titleOf(u);
      const t = body.parentElement?.querySelector('.card-title');
      if (t) t.textContent = c.title;
    }
    save(); load();
  };

  const load = () => {
    const blocked = isLocal(c.url) && !fileAccess;
    frame.classList.toggle('empty', !c.url || blocked);
    if (!c.url || blocked) {
      frame.replaceChildren(h('div', { class: 'web-empty' }, icon(blocked ? 'info' : 'web'),
        h('p', null, blocked ? localHint() : 'Search or type an address above, or start from one of these.'),
        !blocked && h('div', { class: 'web-sites' }, Object.entries(SITES).map(([id, s]) => h('button', {
          class: 'web-site', type: 'button', title: `Open ${s.name}, or search it for what you typed above`,
          onclick() { const v = url.value.trim(); c.site = id; show(isSearchText(v) ? s.q + encodeURIComponent(v) : s.home); },
        }, s.name))),
        !blocked && !embedUnblocked && h('p', { class: 'hint' }, EMBED_HINT)));
      return;
    }
    if (!isLocal(c.url) && !navigator.onLine) {
      frame.classList.add('empty');
      frame.replaceChildren(h('div', { class: 'web-empty' }, icon('web'),
        h('p', null, 'You are offline. This window will load again when the connection is back.')));
      whenOnline.add(load);
      return;
    }
    if (isLocal(c.url) && TEXT_FILE.test(c.url) && !/\.html?$/i.test(c.url)) {
      frame.classList.add('empty');
      const pre = h('pre', { class: 'files-text' }, 'Loading…');
      frame.replaceChildren(pre);
      const x = new XMLHttpRequest();
      x.open('GET', c.url);
      x.onload = () => { pre.textContent = x.responseText.slice(0, 400000); };
      x.onerror = () => { pre.textContent = 'This file could not be read.'; };
      x.send();
      return;
    }
    // PDFs and local files need the browser's own viewer, which a sandboxed frame is not given.
    let pdf = false;
    try { pdf = /\.pdf$/i.test(new URL(c.url).pathname); } catch { /* not a URL */ }
    const trusted = isLocal(c.url) || pdf;
    frame.replaceChildren(
      h('iframe', {
        src: embedUrl(c.url), title: c.title, loading: 'lazy',
        // No top-navigation: an embedded site cannot replace this page.
        sandbox: !trusted && 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
        allow: 'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write',
        referrerpolicy: 'strict-origin-when-cross-origin',
      }),
      shield());
  };
  /* With "only the website", the page itself is the card: drag it to move it until you click into it,
     then a thin strip along its top edge moves it; right-click either for the card menu. */
  const card = () => body.parentElement;
  const menuHere = e => { if (!card()?.classList.contains('card')) return; e.preventDefault(); e.stopPropagation(); cardMenu(c, e.clientX, e.clientY); };
  const shield = () => {
    const el = h('div', { class: 'web-shield', title: c.plain ? 'Click to use this page · drag to move it' : 'Click to use this page' });
    el.addEventListener('pointerdown', e => { if (c.plain && e.button === 0 && card()?.classList.contains('card')) dragCard(e, c, card(), 'move'); });
    el.addEventListener('contextmenu', e => { if (c.plain) menuHere(e); });
    return el;
  };
  if (c.plain && c.url) {
    const grab = h('div', { class: 'web-grab', title: 'Drag to move · right-click for options' });
    grab.addEventListener('pointerdown', e => { if (e.button === 0 && card()?.classList.contains('card')) { e.preventDefault(); dragCard(e, c, card(), 'move'); } });
    grab.addEventListener('contextmenu', menuHere);
    body.append(grab);
  }
  const go = () => {
    const v = url.value.trim();
    // plain words are searched: with the site this window last used, else the engine chosen in Customize
    const engine = SITES[c.site] || SITES[state.settings.engine] || SITES.bing;
    const u = isSearchText(v) ? engine.q + encodeURIComponent(v) : toAddress(v);
    url.classList.toggle('bad', !u);
    if (u) show(u);
  };
  url.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); url.blur(); } });

  body.append(h('div', { class: 'web-bar' }, url,
    !embedUnblocked && h('button', { class: 'icon-btn', type: 'button', title: EMBED_HINT, 'aria-label': 'About blank windows', onclick: () => toast(EMBED_HINT) }, icon('info')),
    h('button', { class: 'icon-btn', type: 'button', title: 'Reload (back to this address)', 'aria-label': 'Reload', onclick: load }, icon('reload')),
    h('button', { class: 'icon-btn', type: 'button', title: 'Open in its own window, beside the board (for sites that refuse to show here)', 'aria-label': 'Open in its own window',
      onclick: () => openBeside(c.url, frame) }, icon('popout')),
    h('button', { class: 'icon-btn', type: 'button', title: 'Open in a new tab', 'aria-label': 'Open in a new tab',
      onclick: () => openExternal(c.url) }, icon('external'))),
    frame);
  load();
}

/* ------------------------------------------------------------------ *
 *  Media: dropped / pasted images, videos and PDFs.
 *  Files live in IndexedDB (too big for the settings store); cards keep the id.
 * ------------------------------------------------------------------ */
const mediaStore = {
  _db: null,
  _urls: new Map(),
  db() {
    return this._db ||= new Promise((res, rej) => {
      const r = indexedDB.open('homeboard-media', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.db();
    return new Promise((res, rej) => {
      const t = db.transaction('files', mode);
      const rq = fn(t.objectStore('files'));
      t.oncomplete = () => res(rq && rq.result);
      t.onerror = t.onabort = () => rej(t.error);
    });
  },
  put(id, blob, name) { return this.tx('readwrite', s => s.put({ blob, name: name || blob.name || '', type: blob.type, added: Date.now() }, id)); },
  get(id) { return this.tx('readonly', s => s.get(id)); },
  async url(id) {
    if (this._urls.has(id)) return this._urls.get(id);
    const rec = await this.get(id).catch(() => null);
    if (!rec) return null;
    const u = URL.createObjectURL(rec.blob);
    this._urls.set(id, u);
    return u;
  },
  /* Forget files no card points at any more (kept for an hour so Undo still works). */
  async sweep(keep) {
    try {
      for (const key of await this.tx('readonly', s => s.getAllKeys())) {
        if (keep.has(key) || String(key).startsWith('fav:')) continue;   // link icons are kept on purpose
        const rec = await this.get(key);
        if (rec && Date.now() - (rec.added || 0) > 3600e3) await this.tx('readwrite', s => s.delete(key));
      }
    } catch { /* storage unavailable */ }
  },
};
const mediaIds = () => new Set(state.boards.flatMap(b => b.cards).map(c => c.mediaId).filter(Boolean));
const kindOf = type => (type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : type === 'application/pdf' ? 'pdf' : null);

function measure(url, kind) {
  return new Promise(res => {
    const done = (w, h) => res(w > 0 && h > 0 ? { w, h } : { w: 4, h: 3 });
    if (kind === 'video') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done(16, 9);
      v.src = url;
    } else {
      const im = new Image();
      im.onload = () => done(im.naturalWidth, im.naturalHeight);
      im.onerror = () => done(0, 0);
      im.src = url;
    }
    setTimeout(() => done(0, 0), 5000);
  });
}
/* Largest side 420px on arrival; `at` is where the middle of the picture should land. */
function mediaBox(size, at, n = 0) {
  const k = Math.min(1, 420 / Math.max(size.w, size.h));
  const w = Math.max(60, Math.round(size.w * k)), h = Math.max(45, Math.round(size.h * k));
  return { w, h, ratio: size.w / size.h, pos: at && { x: at.x - w / 2 + n * 26, y: at.y - h / 2 + n * 26 } };
}

async function addMediaFiles(files, at) {
  let n = 0;
  for (const f of files) {
    if (/\.(md|markdown|txt)$/i.test(f.name || '') || /^text\/(markdown|plain)/.test(f.type || '')) {   // text files become notes
      if (f.size > 2e6) { toast(`“${f.name}” is too big to become a note.`); continue; }
      addCard('note', at && { x: at.x - 180 + n * 26, y: at.y - 40 + n * 26 },
        { markdown: true, md: await f.text(), title: (f.name || 'Note').replace(/\.[^.]+$/, '').slice(0, 80) || 'Note', named: true, w: 360, h: 320 });
      n++;
      continue;
    }
    const kind = kindOf(f.type || '');
    if (!kind) continue;
    const id = uid();
    try { await mediaStore.put(id, f); }
    catch { toast('That file could not be stored: the browser is out of space or blocks storage here.'); continue; }
    const title = (f.name || TYPES.media.label).replace(/\.[^.]+$/, '').slice(0, 80) || TYPES.media.label;
    if (kind === 'pdf') {
      addCard('media', at && { x: at.x - 260 + n * 26, y: at.y - 40 + n * 26 }, { kind, mediaId: id, title, w: 520, h: 680 });
    } else {
      const box = mediaBox(await measure(await mediaStore.url(id), kind), at, n);
      addCard('media', box.pos, { kind, mediaId: id, title, w: box.w, h: box.h, ratio: box.ratio });
    }
    n++;
  }
  if (!n && files.length) toast('Only pictures, videos, PDFs and text or Markdown files can be placed on the board.');
}
function addRemoteImage(src, at, link) {
  const im = new Image();
  im.referrerPolicy = 'no-referrer';
  im.onload = () => {
    const box = mediaBox({ w: im.naturalWidth || 4, h: im.naturalHeight || 3 }, at);
    addCard('media', box.pos, { kind: 'image', src, title: hostOf(src), w: box.w, h: box.h, ratio: box.ratio });
  };
  im.onerror = () => {
    if (link && link !== src) addCard('web', at, { url: link, title: titleOf(link) });
    else toast('That image could not be loaded.');
  };
  im.src = src;
}
const keeping = new Set();
async function keepPicture(c) {                      // a picture that lives on the web: store a copy here for offline use
  if (!canReadSites || !c.src || keeping.has(c.id)) return;
  keeping.add(c.id);
  try {
    const r = await fetch(c.src, { referrerPolicy: 'no-referrer', credentials: 'omit' });
    const blob = await r.blob();
    if (!r.ok || !blob.type.startsWith('image/') || blob.size > 30e6) return;
    const id = uid();
    await mediaStore.put(id, blob, c.title);
    c.mediaId = id; c.src = null;                     // from now on the card shows the local copy
    save();
  } catch { /* not readable from this page: the card keeps pointing at the web */ }
}
let pickAt = null;
function pickMedia(at) { pickAt = at || null; $('#media-file').click(); }

function buildMedia(c, body, head, more) {
  const el = body.parentElement;
  const framed = c.kind === 'pdf';
  el.classList.toggle('frameless', !framed);
  const stage = h('div', { class: 'media-stage' });
  body.append(stage);
  if (!framed) body.addEventListener('pointerdown', e => { if (e.button === 0) dragCard(e, c, el, 'move'); });

  const fail = () => stage.replaceChildren(h('div', { class: 'web-empty' }, icon('media'),
    h('p', null, c.src ? 'This picture could not be loaded.' : 'This file is no longer stored in this browser.')));
  const show = url => {
    if (!url) { fail(); return; }
    if (c.kind === 'pdf') {
      stage.replaceChildren(h('iframe', { src: url, title: c.title }), h('div', { class: 'web-shield', title: 'Click to use this document' }));
    } else if (c.kind === 'video') {
      const v = h('video', { src: url, loop: true, playsinline: true, preload: 'auto' });
      v.muted = c.muted;
      const play = h('button', { class: 'icon-btn', type: 'button', title: 'Play / pause', 'aria-label': 'Play or pause',
        onclick() { c.paused = !v.paused; if (v.paused) v.play().catch(() => {}); else v.pause(); save(); } });
      const mute = h('button', { class: 'icon-btn', type: 'button', title: 'Sound on / off', 'aria-label': 'Sound on or off',
        onclick() { v.muted = c.muted = !v.muted; save(); } });
      const sync = () => { play.replaceChildren(icon(v.paused ? 'play' : 'pause')); mute.replaceChildren(icon(v.muted ? 'mute' : 'volume')); };
      for (const ev of ['play', 'pause', 'volumechange']) v.addEventListener(ev, sync);
      v.addEventListener('error', fail);
      more.before(play, mute);
      stage.replaceChildren(v);
      sync();
      // browsers refuse to start a video with sound on their own: fall back to silent
      if (!c.paused) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    } else {
      const img = h('img', { src: url, alt: c.title, draggable: 'false', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', fail);
      if (c.src) img.addEventListener('load', () => keepPicture(c), { once: true });
      stage.replaceChildren(img);
    }
  };
  if (c.src) show(c.src);
  else if (c.mediaId) mediaStore.url(c.mediaId).then(show, fail);
  else fail();
}

/* ---- widgets (pool table, cigarette pack, …) ---- */
function buildWidget(c, body) {
  const w = WIDGETS[c.widget];
  body.classList.add('widget-body');
  if (!w) {
    body.append(h('div', { class: 'web-empty' }, icon('widget'), h('p', null, 'This widget is not available in this version of Homeboard.')));
    return;
  }
  const el = body.parentElement;
  let inst = {};
  try {
    inst = w.create(body, c.data, data => { c.data = data; save(); }) || {};
  } catch (err) {
    console.error('Homeboard: widget failed', c.widget, err);
    body.replaceChildren(h('div', { class: 'web-empty' }, icon('widget'), h('p', null, 'This widget could not start.')));
  }
  if (w.bare) {
    // no frame, no header: grab it anywhere the widget does not claim for itself, right-click for everything else
    el.classList.add('frameless', 'bare');
    body.addEventListener('pointerdown', e => { if (e.button === 0 && (!inst.grab || inst.grab(e))) dragCard(e, c, el, 'move'); });
  }
  body.addEventListener('contextmenu', e => {
    if (isEditable(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    openMenu(e.clientX, e.clientY, [...(inst.menu ? inst.menu() : []), { sep: true }, ...cardItems(c)]);
  });
}
function addWidget(id, at) {
  const w = WIDGETS[id];
  if (w) addCard('widget', at, { widget: id, title: w.label, w: w.w, h: w.h });
}
const widgetMenu = at => Object.entries(WIDGETS).map(([id, w]) => ({ label: w.menu || w.label, icon: 'widget', action: () => addWidget(id, at) }));

/* ------------------------------------------------------------------ *
 *  Clipboard and drag-and-drop
 * ------------------------------------------------------------------ */
const isEditable = t => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/* Where the mouse is, if it is over empty board; otherwise null (callers fall back to the middle). */
function pointerSpot() {
  if (!pointer || document.elementFromPoint(pointer.x, pointer.y) !== canvas) return null;
  return toWorld(pointer.x, pointer.y);
}
function cardText(c) {
  if (c.type === 'note' && c.lock) return 'Locked note';
  if (c.type === 'note' && c.markdown) return c.md || '';
  if (c.type === 'note') {
    const d = document.createElement('div');
    d.innerHTML = cleanHTML(c.html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h\d)>/gi, '\n');
    return d.textContent.trim();
  }
  if (c.type === 'todo') return [c.title, ...c.items.flatMap(i => [`[${i.done ? 'x' : ' '}] ${i.text}`, ...i.steps.map(t => `    [${t.done ? 'x' : ' '}] ${t.text}`)])].join('\n');
  if (c.type === 'files') return addressLabel(c.path) || c.title;
  if (c.type === 'term') return c.cwd || c.title;
  if (c.type === 'links') return c.links.map(l => `${l.title || hostOf(l.url)}  ${l.url}`).join('\n');
  if (c.type === 'web') return addressLabel(c.url) || c.title;
  return c.src || c.title;
}
function copySelected(e, cut) {
  if (isEditable(e.target) || !selected || String(getSelection()).trim()) return;   // real text selections copy as usual
  const c = board().cards.find(k => k.id === selected);
  if (!c) return;
  e.preventDefault();
  const text = cardText(c) || c.title, json = JSON.stringify(c);
  e.clipboardData.setData('text/plain', text);
  try { e.clipboardData.setData(CLIP_TYPE, json); } catch { /* custom types unsupported: `clip` covers it */ }
  clip = { text, card: JSON.parse(json) };
  if (cut) removeCard(c); else toast('Card copied. Ctrl+V pastes it.');
}
function pasteCard(raw) {
  const src = normalize({ boards: [{ cards: [structuredClone(raw)] }] })?.boards[0].cards[0];
  if (!src) return;
  const c = { ...src, id: uid(), z: ++maxZ };
  for (const it of [...(c.items || []), ...(c.links || [])]) it.id = uid();
  const at = pointerSpot();
  if (at) { c.x = snap(at.x - c.w / 2); c.y = snap(at.y - 16); }
  else {
    const v = board().view, n = board().cards.length % 6;
    c.x = snap((innerWidth / 2 - v.x) / v.z - c.w / 2 + n * 26);
    c.y = snap((innerHeight / 2 - v.y) / v.z - c.h / 2 + n * 26);
  }
  board().cards.push(c);
  stringsEl.before(buildCard(c));
  select(c.id);
  save();
}
function onPaste(e) {
  const cd = e.clipboardData;
  if (!cd) return;
  const editing = isEditable(e.target);
  const text = cd.getData('text/plain');
  const files = [...cd.files].filter(f => kindOf(f.type || ''));
  if (files.length && (!editing || !text)) { e.preventDefault(); addMediaFiles(files, pointerSpot()); return; }
  if (editing) return;                               // typing somewhere: normal paste
  e.preventDefault();
  let card = null;
  try { card = JSON.parse(cd.getData(CLIP_TYPE) || 'null'); } catch { /* not ours */ }
  if (!card && clip && text === clip.text) card = clip.card;
  if (card) { pasteCard(card); return; }
  const t = text.trim();
  if (!t) return;
  const address = !/\n/.test(t) && (/^https?:\/\/\S+$/i.test(t) || /^[a-z]:[\\/]/i.test(t) || t.startsWith('\\\\')) ? toAddress(t) : null;
  if (address) addCard('web', pointerSpot(), { url: address, title: titleOf(address) });
  else addCard('note', pointerSpot(), { markdown: true, md: text });
}
function onDrop(e) {
  if (e.dataTransfer.types.includes(FILES_DND)) return;                          // a file dragged between file browsers
  if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;   // dropping text into a field
  e.preventDefault();
  const dt = e.dataTransfer, at = toWorld(e.clientX, e.clientY);
  if (dt.files.length) { addMediaFiles([...dt.files], at); return; }
  const uri = (dt.getData('text/uri-list') || '').split(/\r?\n/).find(l => l && !l.startsWith('#')) || '';
  const text = dt.getData('text/plain').trim();
  const img = normalizeUrl(/<img[^>]+src=["']([^"']+)["']/i.exec(dt.getData('text/html'))?.[1] || '');
  const link = normalizeUrl(uri) || (/^https?:\/\/\S+$/i.test(text) ? normalizeUrl(text) : null);
  if (img) addRemoteImage(img, at, link);
  else if (link && /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(new URL(link).pathname)) addRemoteImage(link, at, link);
  else if (link) addCard('web', at, { url: link, title: titleOf(link) });
  else if (text) addCard('note', at, { markdown: true, md: text });
}

/* ------------------------------------------------------------------ *
 *  Boards: a tree in the left rail. A board is either a canvas of cards
 *  or a single page / PDF / folder, and may carry a notes panel on the side.
 * ------------------------------------------------------------------ */
const EMOJI = ['🏠', '💼', '📚', '📝', '📁', '⭐', '🎮', '🎵', '🎬', '💡', '🛒', '✈️', '💰', '🧪', '🛠️', '❤️', '📅', '📷', '🍀', '🔒', '🎯', '🧠', '☕', '🌙'];
const kidsOf = id => state.boards.filter(b => (b.parent || null) === (id || null));
const boardById = id => state.boards.find(b => b.id === id);
const isUnder = (b, id) => { for (let p = b, n = 0; p && n < 99; p = boardById(p.parent), n++) if (p.id === id) return true; return false; };
const initials = name => { const w = name.trim().split(/\s+/); return ((w.length > 1 ? w[0][0] + w[1][0] : name.trim().slice(0, 2)) || '?').toUpperCase(); };

function renderBoard() {
  const b = board();
  opened.clear();                                   // leaving a board locks its notes again
  document.body.classList.toggle('view-locked', !!b.frozen);
  whenOnline.clear();
  applySettings();
  if (!panel.hidden) syncSettingsUI();
  b.cards.sort((a, c) => a.z - c.z).forEach((c, i) => { c.z = i + 1; });
  maxZ = b.cards.length;
  selected = null;
  world.replaceChildren(...b.cards.map(buildCard), stringsEl);
  drawStrings();
  applyView();

  const file = b.kind === 'file';                   // a page instead of cards
  document.body.classList.toggle('file-board', file);
  document.body.classList.toggle('has-side', !!b.side);
  pageEl.hidden = !file;
  pageEl.replaceChildren();
  if (file) {
    b.page ||= { url: '', title: b.name, named: true };
    const inner = h('div', { class: 'card-body' });
    pageEl.append(inner);
    buildWeb(b.page, inner);
  }
  sideEl.hidden = !b.side;
  if (b.side && sideText.innerHTML !== (b.sideHtml || '')) sideText.innerHTML = b.sideHtml || '';
}

function openBoard(b) {
  if (b.id === state.active) return;
  state.active = b.id;
  renderTabs(); renderBoard(); save();
}

function renderTabs() {
  const rows = [];
  const walk = (parent, depth) => {
    for (const b of kidsOf(parent)) {
      const kids = kidsOf(b.id).length > 0, on = b.id === state.active;
      const chip = h('span', { class: 'tab-chip' }, b.icon || initials(b.name));
      if (b.color) chip.style.setProperty('--tint', COLORS[b.color]);
      const name = h('span', { class: 'tab-name' }, b.name);
      const editing = () => name.classList.contains('editing');
      const t = h('div', {
        class: 'tab' + (on ? ' active' : ''), role: 'treeitem', tabindex: '0', title: b.name, 'data-board': b.id,
        'aria-selected': String(on), 'aria-level': String(depth + 1), 'aria-expanded': kids ? String(!b.collapsed) : null,
      },
        h('span', { class: 'tab-fold' + (b.collapsed ? '' : ' open'), title: kids ? 'Show or hide the boards inside' : null,
          onclick(e) { if (!kids) return; e.stopPropagation(); b.collapsed = !b.collapsed; renderTabs(); save(); } }, kids && icon('chev')),
        chip, name,
        b.kind === 'file' && h('span', { class: 'tab-kind', title: 'Shows a page instead of cards' }, icon('file')),
        h('span', { class: 'tab-plus', title: 'New board inside', onclick(e) { e.stopPropagation(); addBoard(b.id); } }, icon('plus')));
      t.style.setProperty('--depth', depth);
      t.addEventListener('click', () => { if (!editing()) openBoard(b); });
      t.addEventListener('keydown', e => {
        if (editing()) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBoard(b); }
        else if (e.key === 'F2') renameBoard(b);
      });
      t.addEventListener('dblclick', () => renameBoard(b));
      t.addEventListener('contextmenu', e => { if (editing()) return; e.preventDefault(); boardMenu(b, e.clientX, e.clientY); });
      rows.push(t);
      if (kids && !b.collapsed) walk(b.id, depth + 1);
    }
  };
  walk(null, 0);
  tabsEl.replaceChildren(
    h('div', { class: 'tab-tree', role: 'tree' }, rows),
    h('div', { class: 'tab tab-add', role: 'button', tabindex: '0', title: 'New board', 'aria-label': 'New board', onclick: () => addBoard(),
      onkeydown(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addBoard(); } } },
      h('span', { class: 'tab-fold' }), h('span', { class: 'tab-chip plain' }, icon('plus')), h('span', { class: 'tab-name' }, 'New board')));
}

function boardMenu(b, x, y) {
  const again = () => { renderTabs(); renderBoard(); save(); };
  const sibs = kidsOf(b.parent), at = sibs.indexOf(b);
  const moveNextTo = (other, after) => {            // sibling order is the order in state.boards
    state.boards.splice(state.boards.indexOf(b), 1);
    state.boards.splice(state.boards.indexOf(other) + (after ? 1 : 0), 0, b);
    renderTabs(); save();
  };
  openMenu(x, y, [
    { label: 'Rename', icon: 'edit', action: () => renameBoard(b) },
    { label: 'New board inside', icon: 'plus', action: () => addBoard(b.id) },
    { label: 'Icon', icon: 'media', items: [
      { grid: EMOJI, current: b.icon, pick(v) { b.icon = v; renderTabs(); save(); } },
      { label: 'Use the initials instead', icon: 'x', action() { b.icon = ''; renderTabs(); save(); } },
    ] },
    { swatches: COLORS, current: b.color, pick(key) { b.color = key; renderTabs(); save(); } },
    { sep: true },
    at > 0 && { label: 'Move up', icon: 'up', action: () => moveNextTo(sibs[at - 1], false) },
    at < sibs.length - 1 && { label: 'Move down', icon: 'down', action: () => moveNextTo(sibs[at + 1], true) },
    state.boards.length > 1 && { label: 'Move inside', icon: 'arrow', items: [
      { label: 'Top level', checked: !b.parent, action() { b.parent = null; renderTabs(); save(); } },
      ...state.boards.filter(o => !isUnder(o, b.id)).map(o => ({
        label: o.name, checked: b.parent === o.id, action() { b.parent = o.id; o.collapsed = false; renderTabs(); save(); },
      })),
    ] },
    { sep: true },
    { label: 'Show a page, PDF or folder instead of cards', checked: b.kind === 'file', action() { b.kind = b.kind === 'file' ? 'board' : 'file'; state.active = b.id; again(); } },
    state.looks.length > 0 && { label: 'Look for this board', icon: 'layers', items: [
      { label: 'Same as everywhere', checked: !b.look, action() { b.look = null; applySettings(); syncSettingsUI(); save(); } },
      ...state.looks.map(l => ({ label: l.name, checked: b.look === l.id, action() { b.look = l.id; applySettings(); syncSettingsUI(); save(); } })),
    ] },
    { label: 'Export notes as Markdown (.zip)', icon: 'file', action: () => exportNotes(b.id) },
    { label: 'Notes panel on the side', checked: !!b.side, action() { b.side = !b.side; state.active = b.id; again(); if (b.side) sideText.focus(); } },
    { sep: true },
    state.boards.some(o => !isUnder(o, b.id)) && { label: kidsOf(b.id).length ? 'Delete board and those inside' : 'Delete board', icon: 'trash', danger: true, action: () => deleteBoard(b) },
  ]);
}

function renameBoard(b) {
  const name = tabsEl.querySelector(`[data-board="${CSS.escape(b.id)}"] .tab-name`);
  if (!name) return;
  tabsEl.classList.add('hold');                     // stay open while typing
  editInline(name, v => {
    tabsEl.classList.remove('hold');
    if (v) { b.name = v.slice(0, 40); if (b.page) b.page.title = b.name; save(); }
    renderTabs();
  });
}
function addBoard(parentId) {
  const parent = parentId && boardById(parentId);
  const b = { id: uid(), name: `Board ${state.boards.length + 1}`, view: { x: 0, y: 0, z: 1 }, cards: [], strings: [],
              parent: parent ? parent.id : null, icon: '', color: null, kind: 'board', side: false, sideHtml: '', collapsed: false };
  if (parent) parent.collapsed = false;
  state.boards.push(b);
  state.active = b.id;
  renderTabs(); renderBoard(); save();
  renameBoard(b);
}
function deleteBoard(b) {
  const gone = state.boards.map((o, i) => [i, o]).filter(([, o]) => isUnder(o, b.id));
  if (gone.length >= state.boards.length) return;   // always keep one board
  state.boards = state.boards.filter(o => !isUnder(o, b.id));
  if (!boardById(state.active)) state.active = (boardById(b.parent) || state.boards[0]).id;
  renderTabs(); renderBoard(); save();
  toast(`Board “${b.name}” deleted`, 'Undo', () => {
    for (const [i, o] of gone) state.boards.splice(Math.min(i, state.boards.length), 0, o);
    state.active = b.id;
    renderTabs(); renderBoard(); save();
  });
}

/* ------------------------------------------------------------------ *
 *  Website windows inside an extension: lift "refuse to embed" headers
 *  for frames in THIS tab only (session rule keyed to the tab id).
 * ------------------------------------------------------------------ */
async function setupUnblock() {
  embedUnblocked = false;
  const dnr = api && api.declarativeNetRequest;
  if (!dnr || !api.tabs || !api.tabs.getCurrent) return;
  try {
    const tab = await api.tabs.getCurrent();
    if (!tab || tab.id == null) return;
    tabId = tab.id;
    const change = { removeRuleIds: [tabId] };
    if (state.settings.unblock) {
      change.addRules = [{
        id: tabId, priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'x-frame-options', operation: 'remove' },
            { header: 'content-security-policy', operation: 'remove' },
          ],
        },
        condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
      }];
    }
    await dnr.updateSessionRules(change);
    embedUnblocked = !!state.settings.unblock;
  } catch (err) {
    console.warn('Homeboard: embed unblocking unavailable', err);
  }
}
function dropUnblock() {
  if (tabId == null || !api?.declarativeNetRequest) return;
  try { api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] })?.catch?.(() => {}); } catch { /* closing */ }
}

/* ------------------------------------------------------------------ *
 *  Wiring
 * ------------------------------------------------------------------ */
function wire() {
  $('#export-md').addEventListener('click', () => exportNotes(null));
  $('#undo-update').addEventListener('click', undoUpdate);
  document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.add === 'media') pickMedia();
    else if (b.dataset.add === 'widget') { const r = b.getBoundingClientRect(); openMenu(r.left, r.top - 8 - 40 * Object.keys(WIDGETS).length, widgetMenu()); }
    else addCard(b.dataset.add);
  }));
  const mediaFile = $('#media-file');
  mediaFile.addEventListener('change', () => {
    const files = [...mediaFile.files];
    mediaFile.value = '';
    if (files.length) addMediaFiles(files, pickAt);
  });

  // clipboard + drag and drop
  document.addEventListener('copy', e => copySelected(e, false));
  document.addEventListener('cut', e => copySelected(e, true));
  document.addEventListener('paste', onPaste);
  addEventListener('pointermove', e => {
    pointer = { x: e.clientX, y: e.clientY };
    document.body.classList.toggle('dock-near', innerHeight - e.clientY < 96);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => document.body.classList.remove('dock-near'));
  addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes(FILES_DND)) return;
    if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();                                 // otherwise the browser opens a dropped file instead
    e.dataTransfer.dropEffect = 'copy';
    document.body.classList.add('dropping');
  });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
  addEventListener('drop', e => { document.body.classList.remove('dropping'); onDrop(e); });
  $('#zoom-in').addEventListener('click', () => zoomStep(1));
  $('#zoom-out').addEventListener('click', () => zoomStep(-1));
  $('#zoom-fit').addEventListener('click', fitView);
  $('#zoom-views').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); viewsMenu(r.left, r.top - 300); });
  $('#zoom-views').addEventListener('contextmenu', e => { e.preventDefault(); goHome(); });
  $('#zoom-label').addEventListener('click', () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / board().view.z));

  $('#search').addEventListener('submit', e => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    const looksLikeAddress = /^https?:\/\//i.test(q) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(q);
    if (!navigator.onLine) { toast('You are offline, so a web search cannot open right now. Everything on the board still works.'); return; }
    location.href = (looksLikeAddress && normalizeUrl(q)) || (ENGINES[state.settings.engine] || ENGINES.bing) + encodeURIComponent(q);
  });

  // settings panel
  $('#settings-btn').addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) syncSettingsUI(); });
  $('#settings-close').addEventListener('click', () => { panel.hidden = true; });
  $('#look-save').addEventListener('click', () => {
    const l = { id: uid(), name: `Look ${state.looks.length + 1}`, s: structuredClone(pickLook(shown())) };
    state.looks.push(l);
    renderLooks(); save();
    const name = $(`#looks [data-look="${CSS.escape(l.id)}"] .look-name`);
    if (name) editInline(name, v => { if (v) { l.name = v.slice(0, 30); save(); } renderLooks(); });
  });
  // right-click the Customize button: change look without opening the panel
  $('#settings-btn').addEventListener('contextmenu', e => {
    e.preventDefault();
    openMenu(e.clientX - 180, e.clientY + 8, state.looks.length
      ? [{ info: 'Wear a saved look' }, ...state.looks.map(l => ({ label: l.name, icon: 'layers', action: () => wearLook(l) }))]
      : [{ info: 'No saved looks yet. Open Customize and choose “Save what you see as a new look”.' }]);
  });
  const themes = $('#themes');
  for (const [key, t] of Object.entries(THEMES)) {
    const sw = h('i');
    sw.style.background = t.bg;
    sw.style.setProperty('--s', t.surface);
    sw.style.setProperty('--a', t.accent);
    themes.append(h('button', {
      class: 'theme', type: 'button', 'data-theme': key,
      onclick() {
        const look = lookTarget();
        Object.assign(look, { theme: key, cardAlpha: t.cardAlpha ?? 100, chromeAlpha: t.chromeAlpha ?? 86 },
          t.pattern ? { pattern: t.pattern } : null, t.radius != null ? { radius: t.radius } : null);
        for (const k of COLOR_KEYS) look[k] = null;
        applySettings(); syncSettingsUI(); save();
      },
    }, sw, t.name));
  }
  panel.querySelectorAll('[data-set]').forEach(inp => {
    inp.addEventListener('input', () => {
      const k = inp.dataset.set;
      (LOOK_KEYS.includes(k) ? lookTarget() : state.settings)[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
      applySettings(); save();
      if (k === 'unblock') setupUnblock().then(() => { syncSettingsUI(); renderBoard(); });
    });
  });
  panel.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    lookTarget()[b.dataset.reset] = null;
    applySettings(); syncSettingsUI(); save();
  }));

  const bgFile = $('#bg-file');
  $('#bg-pick').addEventListener('click', () => bgFile.click());
  $('#bg-clear').addEventListener('click', () => { lookTarget().bgImage = ''; applySettings(); save(); });
  bgFile.addEventListener('change', async () => {
    const file = bgFile.files[0];
    bgFile.value = '';
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
      const cv = h('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      lookTarget().bgImage = cv.toDataURL('image/jpeg', .82);
      applySettings(); save();
    } catch { toast('That image could not be read.'); }
  });

  // backup
  $('#export').addEventListener('click', async () => {
    // pictures, videos and PDFs travel inside the backup (very large files are left out)
    const out = { ...structuredClone(state), media: {} };
    let skipped = 0;
    for (const id of mediaIds()) {
      const rec = await mediaStore.get(id).catch(() => null);
      if (!rec) continue;
      if (rec.blob.size > 30e6) { skipped++; continue; }
      const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(rec.blob); });
      if (data) out.media[id] = { name: rec.name, data };
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `homeboard-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (skipped) toast(`${skipped} file${skipped > 1 ? 's' : ''} over 30 MB left out of the backup.`);
  });
  const importFile = $('#import-file');
  $('#import').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    importFile.value = '';
    if (!file) return;
    let next = null, files = {};
    try {
      const raw = JSON.parse(await file.text());
      files = raw && typeof raw.media === 'object' && raw.media ? raw.media : {};
      if (raw) delete raw.media;
      next = normalize(raw);
    } catch { /* handled below */ }
    if (!next) { toast('That file is not a Homeboard backup.'); return; }
    if (!confirm('Replace everything on this page with the backup?')) return;
    for (const [id, f] of Object.entries(files)) {
      try {
        if (!/^data:(image|video)\/|^data:application\/pdf/.test(f.data)) continue;
        await mediaStore.put(id, await (await fetch(f.data)).blob(), String(f.name || ''));
        mediaStore._urls.delete(id);
      } catch { /* skip an unreadable file, keep the rest */ }
    }
    state = next;
    applySettings(); syncSettingsUI(); renderTabs(); renderBoard(); save();
    toast('Backup restored.');
  });
  $('#reset').addEventListener('click', () => {
    if (!confirm('Erase all boards, cards and settings? This cannot be undone.')) return;
    state = defaultState();
    applySettings(); syncSettingsUI(); renderTabs(); renderBoard(); save();
  });

  // connection: a quiet marker while offline; waiting website windows reload when it returns
  const net = () => { $('#offline').hidden = navigator.onLine; };
  addEventListener('offline', net);
  addEventListener('online', () => {
    net();
    const again = [...whenOnline];
    whenOnline.clear();
    again.forEach(load => { try { load(); } catch { /* that window is gone */ } });
  });
  net();

  // the notes panel belongs to whichever board is open
  sideText.addEventListener('input', () => { board().sideHtml = sideText.innerHTML; save(); });
  sideText.addEventListener('paste', plainPaste);

  // global
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);
  addEventListener('blur', closeMenu);
  addEventListener('resize', closeMenu);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!menu.hidden) closeMenu();
      else if (!panel.hidden) panel.hidden = true;
      else { document.activeElement?.blur?.(); select(null); }
      return;
    }
    const t = e.target;
    if (isEditable(t) || e.altKey) return;
    if (e.ctrlKey || e.metaKey) {
      const c = selected && board().cards.find(k => k.id === selected);
      if (c && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateCard(c); }
      return;
    }
    if (e.key === 'Delete' && selected) {
      const c = board().cards.find(k => k.id === selected);
      if (c) removeCard(c);
    } else if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); goHome(); }
    else if (/^Digit[1-9]$/.test(e.code) && !e.shiftKey) { const p = board().views[+e.code.slice(5) - 1]; if (p) { e.preventDefault(); goTo(viewOf(p)); } }
  });

  // persistence across tabs and page lifetime
  store.onExternal(next => {
    if (!next || next.writer === WRITER) return;
    if (document.hidden) stale = true; else adopt(next);
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { flush(); return; }
    if (stale) { stale = false; adopt(await store.load()); }
  });
  addEventListener('pagehide', () => { flush(); dropUnblock(); });
  addEventListener('pageshow', e => { if (e.persisted) setupUnblock(); });
  setInterval(tick, 1000);
}

/* Updates. The page files are read from the folder each time a tab opens, so a new version takes effect
   on the next new tab. Before new code touches the board for the first time, the board as it was is kept
   (in the browser, and as a file through the helper when it runs) so an update can always be undone. */
const SNAP_KEY = 'homeboard:before-update';
let version = 'dev', loadedVersion = 'dev';
async function readVersion() {
  loadedVersion = api?.runtime?.getManifest ? api.runtime.getManifest().version : 'dev';
  version = loadedVersion;
  try { const r = await fetch('manifest.json', { cache: 'no-store' }); if (r.ok) version = (await r.json()).version || version; } catch { /* keep the loaded one */ }
}
async function keepBeforeUpdate(raw) {
  if (!raw || !raw.seenVersion || raw.seenVersion === version || !hasExtStorage) return;
  try { await api.storage.local.set({ [SNAP_KEY]: { from: raw.seenVersion, to: version, at: Date.now(), data: raw } }); } catch { /* storage full: the file copy below still helps */ }
  try {
    if (await Promise.race([helper.ready(true), new Promise(r => setTimeout(() => r(false), 1500))])) {
      await helper.call('/backup', { data: JSON.stringify(raw), tag: 'before-' + version });
    }
  } catch { /* no helper: the browser copy is enough */ }
}
async function undoUpdate() {
  const snap = hasExtStorage && (await api.storage.local.get(SNAP_KEY))[SNAP_KEY];
  const back = snap && normalize(structuredClone(snap.data));
  if (!back) { toast('There is no earlier board to go back to.'); return; }
  if (!confirm(`Put the board back as it was before version ${snap.to} (saved ${new Date(snap.at).toLocaleString()})? Changes made since then are replaced.`)) return;
  state = back;
  state.seenVersion = version;
  applySettings(); syncSettingsUI(); renderTabs(); renderBoard(); save();
  toast('The board is back as it was before the update.');
}

async function init() {
  await readVersion();
  const raw = await store.load();
  await keepBeforeUpdate(raw);
  state = normalize(raw) || defaultState();
  if (state.seenVersion !== version) { state.seenVersion = version; save(); }
  applySettings();
  await Promise.race([setupUnblock(), new Promise(r => setTimeout(r, 1200))]);
  if (api?.extension?.isAllowedFileSchemeAccess) {
    try { fileAccess = !!(await api.extension.isAllowedFileSchemeAccess()); } catch { /* stays false */ }
  }
  setTimeout(autoBackup, 15000);
  setTimeout(() => mediaStore.sweep(new Set([...mediaIds(), clip?.card?.mediaId].filter(Boolean))), 10000);
  wire();
  syncSettingsUI();
  renderTabs();
  renderBoard();
}
init();

})();
