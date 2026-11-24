/* Homeboard · Menus, messages, renaming, moving around the board, views and the view map.
   Part 3 of 9 of the board page: classic scripts that share one scope, loaded in order by index.html
   (app/00-core.js … app/08-main.js). See docs/ARCHITECTURE.md. */
'use strict';

/* ------------------------------------------------------------------ *
 *  Menu, toast, inline rename
 * ------------------------------------------------------------------ */
function closeMenu() { menu.hidden = true; if (menu.classList.contains('gallery')) { menu.replaceChildren(); menu.classList.remove('gallery'); } }   // live previews stop with the gallery
function openMenu(x, y, items) {
  menu.replaceChildren();
  menu.classList.remove('gallery');
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
      onclick() { closeMenu(); if (it.items && it.items.some(s => s && s.preview)) openGallery(x, y, it.label, it.items); else if (it.items) openMenu(x, y, it.items); else it.action(); },
    }, icon(it.checked ? 'check' : it.checked === false ? '' : it.icon), h('span', null, it.label),
      it.items && h('span', { class: 'menu-more' }, '›')));
  }
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = clamp(x, 8, Math.max(8, innerWidth - r.width - 8)) + 'px';
  menu.style.top = clamp(y, 8, Math.max(8, innerHeight - r.height - 8)) + 'px';
}

/* A gallery: a submenu whose options can be seen. Each option's `preview` is a CSS background (a colour, a gradient),
   or a function that returns an element, often the widget itself drawn small with that option (widgetPreview). */
const GALLERY_W = 150, GALLERY_H = 100;
function openGallery(x, y, title, items) {
  menu.replaceChildren();
  menu.classList.add('gallery');
  const grid = h('div', { class: 'gallery-grid' });
  for (const it of items) {
    if (!it || it.sep) continue;
    if (it.info) { grid.append(h('div', { class: 'gallery-info' }, it.info)); continue; }
    const pic = h('div', { class: 'gallery-pic' });
    try {
      if (typeof it.preview === 'string') pic.style.background = it.preview;
      else if (typeof it.preview === 'function') { const n = it.preview(GALLERY_W, GALLERY_H); if (n) pic.append(n); }
    } catch (err) { console.warn('Homeboard: a preview failed', err); }
    grid.append(h('button', { class: 'gallery-tile' + (it.checked ? ' on' : ''), type: 'button', title: it.label, 'data-label': it.label, 'aria-pressed': String(!!it.checked),
      onclick() { closeMenu(); it.action(); } }, pic, h('span', null, it.label)));
  }
  menu.append(h('div', { class: 'gallery-head' }, h('b', null, title || 'Choose'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeMenu }, '×')), grid);
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = clamp(x, 8, Math.max(8, innerWidth - r.width - 8)) + 'px';
  menu.style.top = clamp(y, 8, Math.max(8, innerHeight - r.height - 8)) + 'px';
}
/* A widget drawn small, live, with the given settings: for gallery tiles. It is a real copy of the widget (no card around
   it); it stops by itself when the gallery closes (widgets let go when they leave the page). */
function widgetPreview(id, data, boxW = GALLERY_W, boxH = GALLERY_H) {
  const w = WIDGETS[id];
  if (!w) return null;
  const W = w.w || 300, H = w.h || 200, k = Math.min(boxW / W, boxH / H) * .92;
  const card = h('div', { class: `card card-widget gallery-card${w.bare ? ' bare frameless' : ''}` }), body = h('div', { class: 'card-body widget-body' });
  card.style.cssText = `width:${W}px;height:${H}px;margin-left:${-W / 2}px;margin-top:${-H / 2}px;transform:scale(${k})`;
  card.append(body);
  try { w.create(body, JSON.parse(JSON.stringify(data || {})), () => {}); } catch (err) { console.warn('Homeboard: preview of', id, err); }
  // widgets stop once they have been on the page and left it: mark this one as shown, so closing the gallery quickly
  // still lets it go
  setTimeout(() => { const root = body.firstElementChild; if (root && root.isConnected) root.dataset.was = '1'; }, 0);
  return card;
}
window.HomeboardPreview = widgetPreview;

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
/* things that must know the board's zoom as it changes (the console draws at the screen's own size) */
const zoomWatch = new Set();
let watchedZoom = 0;
function applyView() {
  const { x, y, z } = board().view;
  world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  if (z !== watchedZoom) { watchedZoom = z; for (const f of zoomWatch) f(z); }
  const step = GRID * z * (z < .2 ? 4 : z < .5 ? 2 : 1);
  const tx = ((x % step) + step) % step, ty = ((y % step) + step) % step;
  canvas.style.setProperty('--tx', tx.toFixed(2) + 'px');
  canvas.style.setProperty('--ty', ty.toFixed(2) + 'px');
  if (canvas.style.getPropertyValue('--gs') !== step + 'px') canvas.style.setProperty('--gs', step + 'px');
  const zl = Math.round(z * 100) + '%', zEl = $('#zoom-label'); if (zEl.textContent !== zl) zEl.textContent = zl;
}
/* Saved views remember the middle of the screen and the zoom, so they work in any window size. */
const viewHere = () => { const v = board().view; return { cx: (innerWidth / 2 - v.x) / v.z, cy: (innerHeight / 2 - v.y) / v.z, z: v.z }; };
const viewOf = p => ({ x: innerWidth / 2 - p.cx * p.z, y: innerHeight / 2 - p.cy * p.z, z: p.z });
let flying = 0;
function goTo(to) {
  const v = board().view, from = { ...v };
  cancelAnimationFrame(flying);
  stopGlide();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(v, to); applyView(); saveView(); return; }
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 340), e = 1 - (1 - k) ** 3;
    v.x = from.x + (to.x - from.x) * e; v.y = from.y + (to.y - from.y) * e; v.z = from.z + (to.z - from.z) * e;
    applyView();
    if (k < 1) flying = requestAnimationFrame(step); else saveView();
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
    { label: 'In the Ctrl+↑ / ↓ list', checked: inTour(b, p) >= 0, action: () => toggleTour(b, p) },
    { label: 'Copy link to this view', icon: 'links', action: () => copyBoardLink(`homeboard:board/${b.id}/view/${p.id}`) },
    { label: 'Rename…', icon: 'edit', action: () => renameView(p) },
    { label: 'Delete', icon: 'trash', danger: true, action() { b.views.splice(b.views.indexOf(p), 1); if (b.home === p.id) b.home = null; state.viewMap = state.viewMap.filter(t => !(t.board === b.id && t.view === p.id)); save(); } },
  ];
  openMenu(x, y, [
    { label: b.home ? 'Back to the start view' : 'Back to everything', icon: 'home', action: goHome },
    ...b.views.map((p, i) => ({ label: `${p.name}${b.home === p.id ? '  · start' : ''}`, icon: 'views', action: () => goToStop({ b, p }), key: i })),
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
    { label: 'View map… (Ctrl+M)', icon: 'layers', action: () => viewMapOpen() },
    !state.viewMap.length && { label: `Ctrl+↑ / ↓ list · ${state.tour.length ? state.tour.length + ' views' : 'every view'}`, icon: 'views', items: tourItems() },
    { label: 'Lock the view (no moving or zooming)', checked: b.frozen, action() { b.frozen = !b.frozen; document.body.classList.toggle('view-locked', b.frozen); save(); } },
    { info: 'Home: the start view · 1–9: saved views · Ctrl+← / →: this board’s views · Ctrl+↑ / ↓: your list, across boards.' },
  ]);
}

/* ---- moving between views with the keyboard ----
   Ctrl+← / → step through this board's saved views. Ctrl+↑ / ↓ step through "the list": views from any boards,
   in the order you set (until you set one, every board's views in the order of the boards). */
const inTour = (b, p) => state.tour.findIndex(t => t.board === b.id && t.view === p.id);
function tourStops() {
  const real = state.tour.map(t => { const b = boardById(t.board), p = b && (b.views || []).find(v => v.id === t.view); return b && p ? { b, p } : null; }).filter(Boolean);
  if (real.length) return real;
  const out = [];
  const walk = parent => { for (const b of kidsOf(parent)) { for (const p of b.views || []) out.push({ b, p }); walk(b.id); } };
  walk(null);
  return out;
}
function toggleTour(b, p) {
  const i = inTour(b, p);
  if (i >= 0) state.tour.splice(i, 1);
  else state.tour.push({ board: b.id, view: p.id });
  save();
  hud(i >= 0 ? `“${p.name}” left the Ctrl+↑ / ↓ list` : `“${p.name}” is stop ${state.tour.length} of the Ctrl+↑ / ↓ list`);
}
function tourItems() {
  const stops = state.tour.map((t, i) => ({ t, i, b: boardById(t.board) })).filter(x => x.b && (x.b.views || []).some(v => v.id === x.t.view));
  return [
    { info: state.tour.length ? 'Ctrl+↑ / ↓ go through these, in this order:' : 'Now: every view of every board, in order. Tick “In the Ctrl+↑ / ↓ list” on a view (Manage views) to make your own list.' },
    ...stops.map(({ t, i, b }) => {
      const p = b.views.find(v => v.id === t.view);
      return { label: `${i + 1}. ${b.name} › ${p.name}`, icon: 'views', items: [
        { label: 'Go there', icon: 'arrow', action: () => goToStop({ b, p }) },
        i > 0 && { label: 'Earlier', icon: 'up', action() { state.tour.splice(i - 1, 0, ...state.tour.splice(i, 1)); save(); } },
        i < state.tour.length - 1 && { label: 'Later', icon: 'down', action() { state.tour.splice(i + 1, 0, ...state.tour.splice(i, 1)); save(); } },
        { label: 'Take out of the list', icon: 'x', action() { state.tour.splice(i, 1); save(); } },
      ] };
    }),
    board().views.length > 0 && { sep: true },
    ...board().views.filter(p => inTour(board(), p) < 0).map(p => ({ label: `Add “${p.name}”`, icon: 'plus', action: () => toggleTour(board(), p) })),
    state.tour.length > 0 && { label: 'Clear the list (back to every view)', icon: 'trash', danger: true, action() { state.tour = []; save(); } },
  ];
}
let lastStop = null;                                   // { board, view } last reached with the keys
function goToStop({ b, p }) {
  collapseCard?.();
  if (b.id !== state.active) openBoard(b);
  goTo(viewOf(p));
  lastStop = { board: b.id, view: p.id };
  return true;
}
/* ---- the view map ---- */
const mapTiles = () => state.viewMap.map(t => { const b = boardById(t.board), p = b && (b.views || []).find(v => v.id === t.view); return b && p ? { ...t, b, p } : null; }).filter(Boolean);
function stepMap(dx, dy) {                            // the nearest tile in that direction, like moving between tiles with a TV remote
  const tiles = mapTiles();
  if (!tiles.length) return false;
  let cur = lastStop && tiles.find(t => t.board === lastStop.board && t.view === lastStop.view);
  if (!cur) cur = tiles.find(t => t.board === state.active) || null;
  let next = null;
  if (!cur) next = tiles.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
  else {
    let best = Infinity;
    for (const t of tiles) {
      const ax = t.x - cur.x, ay = t.y - cur.y, along = dx ? ax * dx : ay * dy, across = dx ? Math.abs(ay) : Math.abs(ax);
      if (along <= 0) continue;
      const score = along + across * 2.5;
      if (score < best) { best = score; next = t; }
    }
  }
  if (!next) { hud('Nothing further that way on the view map'); return true; }
  goToStop(next);
  hud(`${next.b.name} › ${next.p.name}`);
  if (mapEl && !mapEl.hidden) drawMap();
  return true;
}
let mapEl = null, drawMap = () => {};
function viewMapOpen() {
  closeMenu?.();
  if (!mapEl) {
    mapEl = h('div', { id: 'viewmap', role: 'dialog', 'aria-label': 'View map', hidden: true });
    mapEl.addEventListener('pointerdown', e => { if (e.target === mapEl) mapEl.hidden = true; });
    mapEl.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); mapEl.hidden = true; } });
    document.body.append(mapEl);
  }
  mapEl.hidden = false;
  drawMap();
  mapEl.querySelector('.vm-panel')?.focus();
}
/* a small sketch of what a view shows: the cards inside it */
function viewSketch(b, p, w, hh) {
  const vw = innerWidth / p.z, vh = innerHeight / p.z, x0 = p.cx - vw / 2, y0 = p.cy - vh / 2;
  const sv = svg('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, class: 'vm-sketch' });
  for (const c of b.cards) {
    const x = (c.x - x0) / vw * w, y = (c.y - y0) / vh * hh, cw = c.w / vw * w, ch = c.h / vh * hh;
    if (x > w || y > hh || x + cw < 0 || y + ch < 0) continue;
    sv.append(svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: Math.max(2, cw).toFixed(1), height: Math.max(2, ch).toFixed(1), rx: 2,
      fill: c.color ? COLORS[c.color] : c.type === 'web' ? 'var(--accent)' : 'currentColor', 'fill-opacity': c.type === 'web' ? .55 : .3 }));
  }
  return sv;
}
drawMap = function () {
  if (!mapEl || mapEl.hidden) return;
  const CW = 168, CH = 112, GAP = 10;
  const tiles = mapTiles();
  const placed = new Set(tiles.map(t => t.board + '/' + t.view));
  const minX = Math.min(0, ...tiles.map(t => t.x)) - 1, minY = Math.min(0, ...tiles.map(t => t.y)) - 1;
  const maxX = Math.max(2, ...tiles.map(t => t.x)) + 1, maxY = Math.max(1, ...tiles.map(t => t.y)) + 1;
  const cols = maxX - minX + 1, rows = maxY - minY + 1;
  const area = h('div', { class: 'vm-area' });
  area.style.width = cols * (CW + GAP) + 'px'; area.style.height = rows * (CH + GAP) + 'px';
  const cellAt = (px, py) => { const r = area.getBoundingClientRect(); return { x: Math.floor((px - r.left) / (CW + GAP)) + minX, y: Math.floor((py - r.top) / (CH + GAP)) + minY }; };
  const put = (board, view, cell) => {                // place (or move) a view at a cell; whatever was there takes its old place
    const map = state.viewMap, me = map.find(t => t.board === board && t.view === view), other = map.find(t => t.x === cell.x && t.y === cell.y && t !== me);
    if (other) { if (me) { other.x = me.x; other.y = me.y; } else map.splice(map.indexOf(other), 1); }
    if (me) { me.x = cell.x; me.y = cell.y; } else map.push({ board, view, x: cell.x, y: cell.y });
    save(); drawMap();
  };
  for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) {
    const slot = h('div', { class: 'vm-slot' });
    Object.assign(slot.style, { left: (gx - minX) * (CW + GAP) + 'px', top: (gy - minY) * (CH + GAP) + 'px', width: CW + 'px', height: CH + 'px' });
    area.append(slot);
  }
  const here = lastStop && tiles.find(t => t.board === lastStop.board && t.view === lastStop.view);
  for (const t of tiles) {
    const tile = h('div', { class: 'vm-tile' + (t === here ? ' here' : ''), tabindex: '0', title: `${t.b.name} › ${t.p.name}\nClick to go there · drag to move · right-click to take it off` },
      viewSketch(t.b, t.p, CW - 12, CH - 40), h('div', { class: 'vm-name' }, h('b', null, t.p.name), h('span', null, t.b.name)));
    if (t.b.color) tile.style.setProperty('--tint', COLORS[t.b.color]);
    Object.assign(tile.style, { left: (t.x - minX) * (CW + GAP) + 'px', top: (t.y - minY) * (CH + GAP) + 'px', width: CW + 'px', height: CH + 'px' });
    tile.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = parseFloat(tile.style.left), oy = parseFloat(tile.style.top);
      let moved = false;
      const mv = ev => { if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return; moved = true; tile.classList.add('drag'); tile.style.left = ox + ev.clientX - sx + 'px'; tile.style.top = oy + ev.clientY - sy + 'px'; };
      const up = ev => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        if (!moved) { mapEl.hidden = true; goToStop(t); hud(`${t.b.name} › ${t.p.name}`); return; }
        const r = tile.getBoundingClientRect();
        put(t.board, t.view, cellAt(r.left + r.width / 2, r.top + r.height / 2));
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    tile.addEventListener('contextmenu', e => { e.preventDefault(); state.viewMap.splice(state.viewMap.findIndex(x => x.board === t.board && x.view === t.view), 1); save(); drawMap(); });
    tile.addEventListener('keydown', e => { if (e.key === 'Enter') { mapEl.hidden = true; goToStop(t); } });
    area.append(tile);
  }
  // the views not on the map yet, to drag onto it (or click to add at the end)
  const spare = state.boards.flatMap(b => (b.views || []).filter(p => !placed.has(b.id + '/' + p.id)).map(p => ({ b, p })));
  const side = h('div', { class: 'vm-side' }, h('div', { class: 'vm-head' }, 'Views not on the map'),
    ...spare.map(({ b, p }) => {
      const it = h('div', { class: 'vm-spare', title: 'Drag onto the map, or click to add it at the end' }, h('b', null, p.name), h('span', null, b.name));
      it.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        const ghost = it.cloneNode(true); ghost.classList.add('vm-ghost'); document.body.append(ghost);
        const sx = e.clientX, sy = e.clientY;
        let moved = false;
        const mv = ev => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) moved = true; ghost.style.transform = `translate(${ev.clientX + 8}px, ${ev.clientY + 8}px)`; };
        const up = ev => {
          removeEventListener('pointermove', mv); removeEventListener('pointerup', up); ghost.remove();
          const r = area.getBoundingClientRect();
          if (moved && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) put(b.id, p.id, cellAt(ev.clientX, ev.clientY));
          else if (!moved) { const t2 = mapTiles(); put(b.id, p.id, { x: t2.length ? Math.max(...t2.map(t => t.x)) + 1 : 0, y: t2.length ? t2[t2.length - 1].y : 0 }); }
        };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      return it;
    }),
    !spare.length && h('div', { class: 'vm-none' }, state.boards.some(b => (b.views || []).length) ? 'Every saved view is on the map.' : 'No saved views yet: the bookmark button at the bottom saves the view you are looking at.'));
  const rowsPerBoard = () => {
    state.viewMap = [];
    let y = 0;
    const walk = parent => { for (const b of kidsOf(parent)) { if ((b.views || []).length) { b.views.forEach((p, x) => state.viewMap.push({ board: b.id, view: p.id, x, y })); y++; } walk(b.id); } };
    walk(null);
    save(); drawMap();
  };
  mapEl.replaceChildren(h('div', { class: 'vm-panel', tabindex: '-1' },
    h('div', { class: 'vm-top' }, h('b', null, 'View map'),
      h('span', { class: 'vm-help' }, 'Ctrl + ← → ↑ ↓ go to the view in that direction. Drag views to arrange them.'),
      h('button', { class: 'btn', type: 'button', onclick: rowsPerBoard, title: 'Each board a row, its views from left to right' }, 'One row per board'),
      state.viewMap.length > 0 && h('button', { class: 'btn', type: 'button', onclick() { const old = state.viewMap; state.viewMap = []; save(); drawMap(); toast('The view map is empty: Ctrl+arrows step through views as before.', 'Undo', () => { state.viewMap = old; save(); drawMap(); }); } }, 'Clear'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick() { mapEl.hidden = true; } }, icon('x'))),
    h('div', { class: 'vm-body' }, h('div', { class: 'vm-scroll' }, area), side)));
};

function stepView(dir, across) {
  const stops = across ? tourStops() : (board().views || []).map(p => ({ b: board(), p }));
  if (!stops.length) { hud(across ? 'No saved views yet: the bookmark button at the bottom saves one' : 'This board has no saved views yet'); return; }
  let i = lastStop ? stops.findIndex(x => x.b.id === lastStop.board && x.p.id === lastStop.view) : -1;
  if (i < 0 && !across) i = -1;
  const next = stops[((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir + stops.length) % stops.length];
  goToStop(next);
  hud(across ? `${next.b.name} › ${next.p.name}  ·  ${stops.indexOf(next) + 1}/${stops.length}` : `${next.p.name}  ·  ${stops.indexOf(next) + 1}/${stops.length}`);
}
/* a small label in the middle, for a moment: where the keys took you */
let hudEl = null, hudTimer = 0;
function hud(text) {
  if (!hudEl) { hudEl = h('div', { id: 'hud', role: 'status' }); document.body.append(hudEl); }
  hudEl.textContent = text;
  hudEl.classList.add('show');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => hudEl.classList.remove('show'), 1300);
}
function zoomAt(cx, cy, factor) {
  if (board().frozen) return;
  const v = board().view;
  const z = clamp(v.z * factor, ZMIN, ZMAX), k = z / v.z;
  v.x = cx - (cx - v.x) * k;
  v.y = cy - (cy - v.y) * k;
  v.z = z;
  applyView(); saveView();
}
function zoomStep(dir) {
  const v = board().view;
  const target = clamp(Math.round(v.z * (dir > 0 ? 1.2 : 1 / 1.2) * 20) / 20, ZMIN, ZMAX);
  ease.zoom(innerWidth / 2, innerHeight / 2, Math.log(target / v.z));
}
function fitView() {
  const b = board();
  if (!b.cards.length) { goTo({ x: 0, y: 0, z: 1 }); return; }
  const x0 = Math.min(...b.cards.map(c => c.x)), y0 = Math.min(...b.cards.map(c => c.y));
  const x1 = Math.max(...b.cards.map(c => c.x + c.w)), y1 = Math.max(...b.cards.map(c => c.y + c.h));
  const top = 68, bottom = 76, pad = 28;
  const W = innerWidth - pad * 2, H = innerHeight - top - bottom;
  const z = clamp(Math.min(W / (x1 - x0), H / (y1 - y0)), ZMIN, 1);
  goTo({ z, x: pad + (W - (x1 - x0) * z) / 2 - x0 * z, y: top + (H - (y1 - y0) * z) / 2 - y0 * z });
}

const picked = new Set();                             // every selected card (Ctrl / Shift + click, or a box)
function select(id) {
  if (selected === id && picked.size <= 1) return;
  world.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected'));
  picked.clear();
  selected = id;
  if (id) { picked.add(id); cardEl(id)?.classList.add('selected'); }
  groupHint();
}
function togglePick(id) {                             // add or take out one card, keeping the others
  if (picked.has(id)) { picked.delete(id); cardEl(id)?.classList.remove('selected'); if (selected === id) selected = [...picked].pop() || null; }
  else { picked.add(id); cardEl(id)?.classList.add('selected'); selected = id; }
  groupHint();
}
const pickedCards = () => board().cards.filter(c => picked.has(c.id));
function groupHint() { if (picked.size > 1) hud(`${picked.size} cards selected · drag one to move them all · Ctrl+C / X / D, Delete`); }

function track(onMove, onEnd, cls = '') {
  const classes = ['dragging', ...(cls ? [cls] : [])];
  document.body.classList.add(...classes);
  const end = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', end);
    removeEventListener('pointercancel', end);
    document.body.classList.remove(...classes);
    onEnd();
  };
  // a pointer-up can be lost (released over a website window): moving again with no button held ends the drag
  const move = e => { if (e.pointerType === 'mouse' && e.buttons === 0 && e.isTrusted) { end(); return; } onMove(e); };
  addEventListener('pointermove', move);
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}

/* Moving around, the way good canvas apps do it (tldraw, Figma, Miro, d3-zoom, and the browsers' own scrolling):
   - drag the background, or hold Space / the middle button and drag anywhere; a flick glides on and slows down
   - a wheel gesture (events less than ~200 ms apart) keeps the target it started on ("scroll latching"):
     a pan that passes over a card keeps panning; scrolling inside a card never jumps over to the board
   - inside a card, its contents scroll only when the thing under the pointer can scroll that way (or it is in use);
     anything else under the pointer pans the board
   - a mouse wheel moves in notches, so those are eased over a few frames (like Lenis); a touchpad already sends
     smooth deltas, which are used as they come
   - a touchpad pinch arrives as Ctrl + wheel with small deltas: it zooms ten times faster than a Ctrl + mouse notch (d3-zoom) */
const ZMIN = .1, ZMAX = 3;
const ease = (() => {
  let px = 0, py = 0, pz = 0, ax = 0, ay = 0, raf = 0, last = 0;
  const frame = now => {
    const dt = Math.min(50, now - (last || now - 16)); last = now;
    const k = 1 - Math.exp(-dt / 55);                   // about 90 % of a notch in 130 ms
    const v = board().view;
    if (Math.abs(px) + Math.abs(py) > .3) { const dx = px * k, dy = py * k; px -= dx; py -= dy; v.x -= dx; v.y -= dy; } else { v.x -= px; v.y -= py; px = py = 0; }
    if (Math.abs(pz) > .0005) { const d = pz * k; pz -= d; zoomAt(ax, ay, Math.exp(d)); } else if (pz) { zoomAt(ax, ay, Math.exp(pz)); pz = 0; }
    applyView(); saveView();
    raf = px || py || pz ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  };
  const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
  return {
    pan(dx, dy) { if (board().frozen) return; px += dx; py += dy; go(); },
    zoom(cx, cy, logFactor) {
      if (board().frozen) return;
      const v = board().view, want = clamp(Math.log(v.z) + pz + logFactor, Math.log(ZMIN), Math.log(ZMAX));
      pz = want - Math.log(v.z); ax = cx; ay = cy; go();
    },
    stop() { px = py = pz = 0; cancelAnimationFrame(raf); raf = 0; last = 0; },
  };
})();
/* A flick of the board glides on and slows down, like a phone list. Stops at any touch. */
let glideRaf = 0;
function stopGlide() { cancelAnimationFrame(glideRaf); glideRaf = 0; }
function glide(vx, vy) {                              // pixels per millisecond
  if (Math.hypot(vx, vy) < .35 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let last = performance.now();
  const v = board().view;
  const step = now => {
    const dt = Math.min(40, now - last); last = now;
    const f = Math.exp(-dt / 260);                    // friction
    v.x += vx * dt; v.y += vy * dt; vx *= f; vy *= f;
    applyView();
    if (Math.hypot(vx, vy) > .02) glideRaf = requestAnimationFrame(step); else { glideRaf = 0; saveView(); }
  };
  glideRaf = requestAnimationFrame(step);
}
function panDrag(e) {
  stopGlide(); ease.stop();
  if (board().frozen) return;
  const v = board().view, ox = e.clientX - v.x, oy = e.clientY - v.y;
  const trail = [];                                   // recent positions, for the flick speed
  track(ev => {
    v.x = ev.clientX - ox; v.y = ev.clientY - oy; applyView();
    trail.push([ev.timeStamp, ev.clientX, ev.clientY]);
    while (trail.length > 2 && ev.timeStamp - trail[0][0] > 90) trail.shift();
  }, () => {
    saveView();
    const a = trail[0], b = trail[trail.length - 1];
    if (a && b && b[0] - a[0] > 10 && performance.now() - b[0] < 60) glide((b[1] - a[1]) / (b[0] - a[0]), (b[2] - a[2]) / (b[0] - a[0]));
  }, 'panning');
}
let spaceDown = false;
addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || isEditable(e.target) || e.target.closest?.('.xterm') || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault(); spaceDown = true; document.body.classList.add('space-pan');
});
addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; document.body.classList.remove('space-pan'); } });
addEventListener('blur', () => { spaceDown = false; document.body.classList.remove('space-pan'); });
document.addEventListener('pointerdown', e => {      // Space + drag pans from anywhere, even over a card
  if (!spaceDown || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  panDrag(e);
}, true);
/* Shift (or Ctrl) + drag on empty board: a selection box; every card it touches is selected */
function boxSelect(e) {
  const box = h('div', { class: 'select-box' });
  document.body.append(box);
  const sx = e.clientX, sy = e.clientY, keep = new Set(picked);
  const update = ev => {
    const x0 = Math.min(sx, ev.clientX), y0 = Math.min(sy, ev.clientY), x1 = Math.max(sx, ev.clientX), y1 = Math.max(sy, ev.clientY);
    Object.assign(box.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
    const a = toWorld(x0, y0), b = toWorld(x1, y1);
    world.querySelectorAll(':scope > .card.selected').forEach(n => n.classList.remove('selected'));
    picked.clear(); keep.forEach(id => picked.add(id));
    for (const c of board().cards) if (c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y) picked.add(c.id);
    for (const id of picked) cardEl(id)?.classList.add('selected');
    selected = [...picked].pop() || null;
  };
  track(update, () => { box.remove(); groupHint(); }, 'boxing');
}
canvas.addEventListener('pointerdown', e => {
  stopGlide();
  if (e.target === canvas && e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey) && !spaceDown) { e.preventDefault(); boxSelect(e); return; }
  const onBg = e.target === canvas;
  if (!((onBg && e.button === 0) || e.button === 1)) return;
  if (onBg) { select(null); document.activeElement?.blur?.(); }
  if (e.button === 1) e.preventDefault();
  panDrag(e);
});
canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });

/* the element inside a card that would scroll for this wheel movement, if any */
function scrollerFor(target, cardNode, dx, dy) {
  for (let n = target; n && n !== cardNode.parentNode; n = n.parentElement) {
    if (n.nodeType !== 1) continue;
    const st = getComputedStyle(n);
    if (dy && /(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1
      && (dy < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1)) return n;
    if (dx && /(auto|scroll)/.test(st.overflowX) && n.scrollWidth > n.clientWidth + 1
      && (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1)) return n;
    if (n === cardNode) break;
  }
  return null;
}
let wheelGesture = null;                              // { to: 'board' | 'card' | 'zoom' | 'text', mouse, until }
const isMouseWheel = e => e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
canvas.addEventListener('wheel', e => {
  stopGlide();
  const now = e.timeStamp, unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
  const zooming = e.ctrlKey || e.metaKey;
  let g = wheelGesture && now < wheelGesture.until && (wheelGesture.to === 'zoom' || wheelGesture.to === 'text') === zooming ? wheelGesture : null;
  if (!g) {
    const cardNode = e.target.closest('.card');
    let to = 'board';
    if (zooming) {
      // over the selected card: its text size; anywhere else: the whole board
      to = cardNode && cardNode.classList.contains('selected') && ZOOMABLE.has(board().cards.find(k => k.id === cardNode.dataset.id)?.type) ? 'text' : 'zoom';
    } else if (cardNode && !e.target.closest('.card-head')) {
      const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
      if (scrollerFor(e.target, cardNode, dx, dy)) to = 'card';
    }
    g = wheelGesture = { to, mouse: isMouseWheel(e), card: cardNode?.dataset.id };
    document.body.classList.toggle('wheel-pan', to === 'board');   // frames under the pointer must not catch the rest of the gesture
  }
  g.until = now + (g.mouse ? 260 : 180);
  clearTimeout(g.timer);
  g.timer = setTimeout(() => { document.body.classList.remove('wheel-pan'); if (wheelGesture === g) wheelGesture = null; }, g.mouse ? 260 : 180);
  if (g.to === 'card') return;                        // the browser scrolls the card's contents
  e.preventDefault();
  if (g.to === 'text') {
    const c = board().cards.find(k => k.id === g.card);
    if (c) setTextSize(c, (c.zoom || 1) * Math.exp(-e.deltaY * unit * (g.mouse ? .0015 : .01)));
    return;
  }
  if (g.to === 'zoom') {
    const log = -e.deltaY * unit * (g.mouse ? .0018 : .012);
    if (g.mouse) ease.zoom(e.clientX, e.clientY, log); else { ease.stop(); zoomAt(e.clientX, e.clientY, Math.exp(log)); }
    return;
  }
  if (board().frozen) return;
  const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit, dy = (e.shiftKey ? 0 : e.deltaY) * unit;
  if (g.mouse) ease.pan(dx, dy);
  else { const v = board().view; v.x -= dx; v.y -= dy; applyView(); saveView(); }
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

