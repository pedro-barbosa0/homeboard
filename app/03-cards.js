/* Homeboard · Cards: building, placing, dragging, expanding, linked cards, strings.
   Part 4 of 9 of the board page: classic scripts that share one scope, loaded in order by index.html
   (app/00-core.js … app/08-main.js). See docs/ARCHITECTURE.md. */
'use strict';

/* ------------------------------------------------------------------ *
 *  Cards
 * ------------------------------------------------------------------ */
/* How big a card's contents are drawn: its own text size, times its growth since "grows with the card" was set. */
const ZOOMABLE = new Set(['note', 'todo', 'links', 'files', 'term', 'web', 'apps']);
const cardZoom = c => clamp((c.zoom || 1) * (c.grow ? c.w / c.grow : 1), .3, 5);
function setTextSize(c, z) {
  c.zoom = clamp(Math.round(z * 100) / 100, .3, 4);
  const el = cardEl(c.id);
  if (el) { place(el, c); el.dispatchEvent(new Event('hb-zoom')); }
  save();
  hud(`${c.type === 'web' ? 'Zoom' : 'Text'} ${Math.round(cardZoom(c) * 100)}%`);
}
function place(el, c) {
  if (ZOOMABLE.has(c.type)) el.style.setProperty('--cz', cardZoom(c));
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';
  el.style.width = c.w + 'px';
  el.style.height = c.h + 'px';
  el.style.zIndex = c.back ? c.z - 1000000 : c.z;   // "behind" cards keep their own order under everything else
  el.classList.toggle('tinted', !!c.color);
  if (c.color) el.style.setProperty('--tint', COLORS[c.color]); else el.style.removeProperty('--tint');
  if (c.surface && SURFACES[c.surface]) el.dataset.surface = c.surface; else delete el.dataset.surface;   // a backing for a frameless card
  cardStyle(el, c);
}
/* A card's own CSS (Style with CSS…), scoped to that card so it cannot spill onto the rest of the board. */
function cardStyle(el, c) {
  let tag = el.querySelector(':scope > style.card-css');
  if (!c.css) { if (tag) tag.remove(); return; }
  if (!tag) { tag = h('style', { class: 'card-css' }); el.prepend(tag); }
  const text = `@scope ([data-id="${CSS.escape(c.id)}"]) { ${String(c.css).replace(/<\/style/gi, '')} }`;
  if (tag.textContent !== text) tag.textContent = text;
}
/* The board's own CSS (Customize → Your own CSS): for whole looks, over everything else. */
function boardStyle() {
  let tag = document.getElementById('user-css');
  const css = String(state.settings.userCss || '');
  if (!css) { if (tag) tag.remove(); return; }
  if (!tag) { tag = h('style', { id: 'user-css' }); document.head.append(tag); }
  const text = css.replace(/<\/style/gi, '');
  if (tag.textContent !== text) tag.textContent = text;
}

/* A code editor in a panel: the card or board changes as you type; Design with AI writes a brief for an assistant. */
function codeEditor({ title, note, value, placeholder, onInput, onDone, brief }) {
  const wrap = h('div', { class: 'cc-editor' }), area = h('textarea', { class: 'cc-code', spellcheck: 'false', placeholder: placeholder || '' });
  area.value = value || '';
  let timer = 0;
  area.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => onInput(area.value), 300); });
  area.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); const a = area.selectionStart; area.setRangeText('  ', a, area.selectionEnd, 'end'); area.dispatchEvent(new Event('input')); }
    e.stopPropagation();
  });
  const close = () => { clearTimeout(timer); onInput(area.value); onDone(area.value); wrap.remove(); document.removeEventListener('keydown', esc, true); };
  const esc = e => { if (e.key === 'Escape' && wrap.isConnected) { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', esc, true);
  wrap.append(h('div', { class: 'cc-editor-panel' }, h('b', null, title), h('p', { class: 'cc-editor-note' }, note), area,
    h('div', { class: 'btn-row' },
      brief && h('button', { class: 'btn', type: 'button', onclick: () => aiBriefPanel(brief(area.value)) }, 'Design with AI…'),
      h('button', { class: 'btn', type: 'button', onclick() { area.value = ''; onInput(''); } }, 'Clear'),
      h('button', { class: 'btn primary', type: 'button', onclick: close }, 'Done'))));
  document.body.append(wrap);
  area.focus();
}
/* The brief for an assistant: what you describe, plus the reference it needs (docs/STYLING.md). */
async function aiBriefPanel({ intro, current, guide }) {
  const text = await fetch(guide, { cache: 'no-store' }).then(r => (r.ok ? r.text() : ''), () => '');
  const ref = (text.split('<!-- for-ai -->')[1] || text).slice(0, 9000);
  const wrap = h('div', { class: 'cc-editor' }), want = h('textarea', { class: 'cc-want', placeholder: 'Describe the look: colours, shapes, mood. For example: “the cards like frosted ice, thin white borders, the titles in small capitals, a soft blue glow on the selected card”.' });
  const out = h('textarea', { class: 'cc-code', readonly: true });
  const make = () => { out.value = [intro, '', 'What I want:', want.value.trim() || '(describe it here)', current && current.trim() ? '\nWhat I have now:\n```css\n' + current.slice(0, 15000) + '\n```' : '', '', ref.trim()].join('\n'); };
  want.addEventListener('input', make);
  want.addEventListener('keydown', e => e.stopPropagation());
  const close = () => wrap.remove();
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  wrap.append(h('div', { class: 'cc-editor-panel' }, h('b', null, 'Design with AI'),
    h('p', { class: 'cc-editor-note' }, 'Homeboard has no AI inside and sends nothing anywhere. Copy this brief into Claude Code or any AI assistant; paste the CSS it gives you back here.'),
    want, out, h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', type: 'button', async onclick() { make(); try { await navigator.clipboard.writeText(out.value); toast('Brief copied.'); } catch { out.select(); document.execCommand('copy'); } } }, 'Copy the brief'),
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Close'))));
  document.body.append(wrap);
  make(); want.focus();
}
function styleCard(c) {
  const el = cardEl(c.id), before = c.css || '';
  codeEditor({
    title: 'Style this card with CSS', value: before, placeholder: '.card-body { background: linear-gradient(135deg, #1e3c72, #2a5298); }\n.card-title { letter-spacing: .1em; text-transform: uppercase; }',
    note: 'Only this card changes. Its parts: .card, .card-head, .card-title, .card-body (and the widget\'s own classes inside). The board\'s colours: var(--accent), var(--text), var(--surface)… See docs/STYLING.md.',
    onInput(v) { c.css = v.slice(0, 50000); if (!c.css) delete c.css; if (el) cardStyle(el, c); },
    onDone() { if ((c.css || '') !== before) save(); },
    brief: v => ({ intro: `I use Homeboard, a new-tab board extension. Write CSS for ONE card on my board (a "${c.type === 'widget' ? c.widget : c.type}" card). The CSS is scoped to that card, so write plain selectors like .card-body or .card-title. Reply with the CSS only.`, current: v, guide: 'docs/STYLING.md' }),
  });
}
function styleBoard() {
  const before = state.settings.userCss || '';
  codeEditor({
    title: 'Your own CSS for the board', value: before, placeholder: '#world > .card { border-radius: 2px; }\n.card-title { font-variant: small-caps; }',
    note: 'Applies to every board, over the theme and the style kit. Undo with Clear. See docs/STYLING.md for the parts and colours.',
    onInput(v) { state.settings.userCss = v.slice(0, 200000); boardStyle(); },
    onDone() { if ((state.settings.userCss || '') !== before) save(); },
    brief: v => ({ intro: 'I use Homeboard, a new-tab board extension. Write CSS that restyles my whole board (the page, the cards, the bars and menus). Reply with the CSS only.', current: v, guide: 'docs/STYLING.md' }),
  });
}
/* Frameless cards (clocks, visualisers, frames, components) float on the board; any of them can get a backing so it
   reads well on a busy backdrop and sits with the cards around it. */
const SURFACES = { '': 'None (floats on the board)', card: 'Card (like the other cards)', glass: 'Glass', dark: 'Dark' };

function buildCard(c) {
  const el = h('div', { class: `card card-${c.type}`, 'data-id': c.id });
  const title = h('div', { class: 'card-title', title: 'Double-click to rename' }, c.title);
  const more = h('button', {
    class: 'icon-btn', type: 'button', title: 'Colour and more', 'aria-label': 'Card menu',
    onclick() { const r = more.getBoundingClientRect(); cardMenu(c, r.left, r.bottom + 4); },
  }, icon('more'));
  const grow = h('button', { class: 'icon-btn card-expand', type: 'button', title: 'Expand (F) · double-click the top edge', 'aria-label': 'Expand', onclick: () => toggleExpand(c) }, icon('expand'));
  const copies = c.sync ? linkedCopies(c) : [];
  const linked = copies.length > 0 && h('button', { class: 'icon-btn card-linked', type: 'button', 'aria-label': 'Linked copies',
    title: `Linked: the same ${c.type === 'todo' ? 'list' : 'note'} is also on ${[...new Set(copies.map(([b]) => b.id === state.active ? 'this board' : '“' + b.name + '”'))].join(', ')}. Changes show everywhere.`,
    onclick() {
      const r = linked.getBoundingClientRect();
      openMenu(r.left, r.bottom + 4, [
        { info: 'The same note in several places: change it in any of them and all change.' },
        ...copies.map(([b, k]) => ({ label: b.id === state.active ? 'The copy on this board' : `On “${b.name}”`, icon: 'arrow', action: () => followBoardLink(`homeboard:board/${b.id}/card/${k.id}`) })),
        { sep: true },
        { label: 'Make this one separate', icon: 'x', action: () => stopSharing(c) },
      ]);
    } }, icon('links'), h('span', null, String(copies.length + 1)));
  const head = h('div', { class: 'card-head' }, h('span', { class: 'card-icon' }, icon(c.type)), title, linked, grow, more);
  const body = h('div', { class: 'card-body' });
  const grip = h('div', { class: 'card-resize', title: 'Resize' });
  const pin = h('button', {
    class: 'card-pin', type: 'button', title: 'Drag onto another card to tie a string', 'aria-label': 'Tie a string',
    onpointerdown: e => startString(e, c),
  });
  el.append(head, body, grip, pin);

  el.addEventListener('pointerdown', e => {
    if (c.z !== maxZ) { c.z = ++maxZ; place(el, c); save(); }
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && e.button === 0 && !e.target.closest('input, textarea, [contenteditable="true"], .xterm, a')) {
      e.preventDefault(); e.stopPropagation(); togglePick(c.id); return;   // adds to the selection (no drag, no typing)
    }
    if (!(picked.size > 1 && picked.has(c.id))) select(c.id);           // a click inside the group keeps the group
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
  // double-click the title's words to rename it; anywhere else on the top edge expands the card (like a window's title bar)
  const onWords = e => { const rg = document.createRange(); rg.selectNodeContents(title); const r = rg.getBoundingClientRect(); return e.clientX <= r.right + 6; };
  head.addEventListener('dblclick', e => {
    if (e.target.closest('button, input, a') || e.target.isContentEditable) return;
    if (e.target.closest('.card-title') && onWords(e)) renameCard(c); else toggleExpand(c);
  });

  TYPES[c.type].build(c, body, head, more);
  if (c.type === 'web' && c.plain && c.url) el.classList.add('web-plain');
  if (c.veil) el.classList.add('veil', 'veil-' + c.veil);
  place(el, c);
  if (selected === c.id) el.classList.add('selected');
  onScreen.watch(el);
  return el;
}
/* Cards outside the window are marked "offscreen": their animations rest and their widgets skip their updates
   (they catch up the moment they come back). One observer for the whole board; a margin so nothing pops in late. */
const onScreen = (() => {
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(list => {
    for (const e of list) { e.target.classList.toggle('offscreen', !e.isIntersecting); lens.seen(e.target); }
  }, { rootMargin: '200px' }) : null;
  return {
    watch: el => { if (io) io.observe(el); },
    refresh() { if (!io) return; io.disconnect(); for (const el of world.querySelectorAll(':scope > .card')) io.observe(el); },   // after a rebuild: let go of removed cards
  };
})();

/* ---- a card expanded: big, in the middle of the screen, over a dimmed board ---- */
let expanded = null;                                  // { c, el, mark } or { c, back } for a zoomed website
const focusLayer = h('div', { id: 'focus-layer', hidden: true });
document.body.append(focusLayer);
focusLayer.addEventListener('pointerdown', e => { if (e.target === focusLayer) collapseCard(); });
function toggleExpand(c) { if (expanded && expanded.c.id === c.id) collapseCard(); else expandCard(c); }
function expandCard(c) {
  collapseCard();
  const el = cardEl(c.id);
  if (!el) return;
  select(c.id);
  if (c.type === 'web' || c.type === 'media' || c.type === 'widget') {   // these keep their place: the board zooms to them
    const back = { ...board().view };
    const W = innerWidth - 80, H = innerHeight - 140;
    const z = clamp(Math.min(W / c.w, H / c.h), ZMIN, ZMAX);
    goTo({ z, x: innerWidth / 2 - (c.x + c.w / 2) * z, y: 64 + H / 2 + 6 - (c.y + c.h / 2) * z });
    expanded = { c, back };
    document.body.classList.add('card-zoomed');
    return;
  }
  const mark = document.createComment('expanded card');
  el.before(mark);
  focusLayer.append(el);
  el.classList.add('expanded');
  el.style.setProperty('--cz', clamp(c.zoom || 1, .6, 4));
  focusLayer.hidden = false;
  document.body.classList.add('has-expanded');
  expanded = { c, el, mark };
  requestAnimationFrame(() => focusLayer.classList.add('open'));
}
function collapseCard() {
  const x = expanded;
  if (!x) return false;
  expanded = null;
  document.body.classList.remove('card-zoomed', 'has-expanded');
  if (x.back) { goTo(x.back); return true; }
  focusLayer.classList.remove('open');
  focusLayer.hidden = true;
  x.el.classList.remove('expanded');
  if (x.mark.isConnected) x.mark.replaceWith(x.el); else { x.mark.remove(); x.el.remove(); }   // the board was drawn again meanwhile
  const c = board().cards.find(k => k.id === x.c.id);
  if (c && x.el.isConnected) place(x.el, c);
  return true;
}

/* ---- linked cards: one note or to-do list in several places; a change in any of them changes all ----
   Cards of one group share `sync`. After every change, the copy that differs from what was last spread is
   copied to the others, and those on screen are drawn again. */
const SHARED = { note: ['md', 'html', 'markdown', 'title', 'named'], todo: ['items', 'title', 'named'] };
const spread = new Map();                             // group -> what its cards hold now (as text)
const sharedSig = c => JSON.stringify(SHARED[c.type].map(k => c[k] ?? null));
function linkedCopies(c) {
  const out = [];
  if (c.sync) for (const b of state.boards) for (const k of b.cards) if (k.sync === c.sync && k.id !== c.id) out.push([b, k]);
  return out;
}
function spreadShared() {
  const groups = new Map();
  for (const b of state.boards) for (const c of b.cards) {
    if (!c.sync || !SHARED[c.type] || c.lock) continue;
    if (!groups.has(c.sync)) groups.set(c.sync, []);
    groups.get(c.sync).push([b, c]);
  }
  for (const [id, list] of groups) {
    const sigs = list.map(([, c]) => sharedSig(c)), last = spread.get(id);
    if (sigs.every(x => x === sigs[0])) { spread.set(id, sigs[0]); continue; }
    const i = Math.max(0, sigs.findIndex(x => x !== last));
    const from = list[i][1];
    for (const [b, c] of list) {
      if (c === from || c.type !== from.type) continue;
      for (const k of SHARED[c.type]) { if (from[k] === undefined) delete c[k]; else c[k] = structuredClone(from[k]); }
      if (b.id === state.active) redrawSoon(c);
    }
    spread.set(id, sigs[i]);
  }
}
const redrawing = new Set();
function redrawSoon(c) {                              // a linked copy on screen shows the change (not the one being typed in)
  if (redrawing.has(c.id)) return;
  redrawing.add(c.id);
  requestAnimationFrame(() => {
    redrawing.delete(c.id);
    const el = cardEl(c.id);
    if (!el || el.contains(document.activeElement)) return;
    refreshCard(c);
  });
}
function makeLinkedCopy(c, b, at) {
  if (!SHARED[c.type] || c.lock) return null;
  c.sync ||= uid();
  const copy = { ...structuredClone(c), id: uid(), sync: c.sync };
  if (copy.items) for (const it of copy.items) it.id = it.id || uid();
  const here = b.id === state.active;
  copy.x = at ? at.x : c.x + (here ? c.w + 30 : 0); copy.y = at ? at.y : c.y;
  copy.z = here ? ++maxZ : Math.max(0, ...b.cards.map(k => k.z)) + 1;
  b.cards.push(copy);
  spread.set(c.sync, sharedSig(c));
  if (here) { stringsEl.before(buildCard(copy)); select(copy.id); }
  const mine = cardEl(c.id);
  if (mine) refreshCard(c);                           // its linked mark appears
  save();
  return copy;
}
function stopSharing(c) {
  const rest = linkedCopies(c);
  delete c.sync;
  if (rest.length === 1) { delete rest[0][1].sync; if (rest[0][0].id === state.active) refreshCard(rest[0][1]); }
  refreshCard(c); save();
}

function moveCardTo(c, b) {
  const from = board();
  if (b.id === from.id || !from.cards.includes(c)) return;
  from.cards.splice(from.cards.indexOf(c), 1);
  cutStringsOf(from, c.id);
  c.z = Math.max(0, ...b.cards.map(k => k.z)) + 1;
  b.cards.push(c);
  cardEl(c.id)?.remove();
  if (selected === c.id) selected = null;
  drawStrings(); save();
  toast(`Moved to “${b.name}”`, 'Go there', () => followBoardLink(`homeboard:board/${b.id}/card/${c.id}`));
}
function dragCard(e, c, el, mode) {
  if (el.classList.contains('expanded')) return;
  const z = board().view.z, sx = e.clientX, sy = e.clientY;
  const o = { x: c.x, y: c.y, w: c.w, h: c.h };
  const group = mode === 'move' && picked.size > 1 && picked.has(c.id) ? pickedCards().filter(k => k !== c).map(k => ({ k, x: k.x, y: k.y, el: cardEl(k.id) })) : [];
  let moved = false, overBoard = null;
  track(ev => {
    const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    moved = true;
    if (mode === 'move') { c.x = snap(o.x + dx); c.y = snap(o.y + dy); for (const g of group) { g.k.x = snap(g.x + dx); g.k.y = snap(g.y + dy); if (g.el) place(g.el, g.k); } }
    else {
      c.w = Math.max(minW(c), snap(o.w + dx));
      c.h = Math.max(minH(c), snap(o.h + dy));
      // pictures, videos and widgets keep their shape unless Shift is held
      const ratio = c.type === 'media' ? (c.kind !== 'pdf' && c.ratio) : c.type === 'widget' ? WIDGETS[c.widget]?.ratio : 0;
      if (ratio && !ev.shiftKey) c.h = Math.round(c.w / ratio);
    }
    place(el, c);
    drawStrings();
    if (mode === 'move') {                            // over a board in the tree: dropping moves the card there
      tabsEl.querySelectorAll('.drop-in').forEach(n => n.classList.remove('drop-in'));
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.tab[data-board]');
      overBoard = row && row.dataset.board !== state.active ? row.dataset.board : null;
      if (overBoard) row.classList.add('drop-in');
      el.classList.toggle('leaving', !!overBoard);
    }
  }, () => {
    if (!moved) return;
    tabsEl.querySelectorAll('.drop-in').forEach(n => n.classList.remove('drop-in'));
    el.classList.remove('leaving');
    const to = overBoard && boardById(overBoard);
    if (to) { c.x = o.x; c.y = o.y; for (const g of group) { g.k.x = g.x; g.k.y = g.y; moveCardTo(g.k, to); } moveCardTo(c, to); return; }
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

/* A Homeboard tab that has been in the background for 5 minutes, while another Homeboard tab is in use, lets its
   website windows rest (they are live in the tab you use). Never one that is playing. They load again, where they
   were, the moment this tab is shown. Tabs find each other on a BroadcastChannel. */
(() => {
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel('homeboard-tabs') : null;
  const me = WRITER;
  let hiddenAt = document.hidden ? Date.now() : 0, others = new Map(), timer = 0, rested = new Set();
  const say = kind => { try { ch && ch.postMessage({ kind, from: me, visible: !document.hidden }); } catch { /* closed */ } };
  if (ch) ch.onmessage = e => { const m = e.data || {}; if (!m.from || m.from === me) return; others.set(m.from, { visible: !!m.visible, at: Date.now() }); if (m.kind === 'who') say('here'); };
  const otherInUse = () => [...others.values()].some(o => o.visible && Date.now() - o.at < 120000);
  function check() {
    if (!document.hidden || !hiddenAt || Date.now() - hiddenAt < 300000) return;
    say('who');
    setTimeout(() => {
      if (!document.hidden || !otherInUse()) return;
      for (const el of world.querySelectorAll(':scope > .card.card-web')) {
        if (rested.has(el.dataset.id) || isPlayingEl(el)) continue;
        const fr = el.querySelector('.web-frame iframe');
        if (!fr) continue;
        rested.add(el.dataset.id);
        fr.src = 'about:blank';
      }
    }, 400);
  }
  document.addEventListener('visibilitychange', () => {
    say(document.hidden ? 'hidden' : 'shown');
    if (document.hidden) { hiddenAt = Date.now(); clearInterval(timer); timer = setInterval(check, 60000); return; }
    hiddenAt = 0; clearInterval(timer); timer = 0;
    for (const id of rested) { const f = findCard(id); if (f && cardEl(id)) refreshCard(f[1]); }   // back where they were (c.last)
    rested.clear();
  });
  say('here');
  return { count: () => rested.size };
})();

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
  delete copy.sync;
  board().cards.push(copy);
  stringsEl.before(buildCard(copy));
  select(copy.id);
  save();
}

/* A deleted console keeps running for two minutes (Undo brings it back as it was), then the helper closes it. */
function closeConsolesLater(cards) {
  for (const c of cards) if (c && c.type === 'term') setTimeout(() => { if (!findCard(c.id)) helper.call('/term/stop', { key: c.id }).catch(() => {}); }, 120000);
}
function removeCard(c) {
  const b = board(), i = b.cards.indexOf(c);
  if (i < 0) return;
  closeConsolesLater([c]);
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
    c.type === 'media' && c.kind === 'video' && { label: 'Play on a TV or box…', icon: 'cast', action: () => castVideo(el?.querySelector('video')) },
    c.type === 'web' && { label: 'Play on a TV or box…', icon: 'cast', action() { let host = ''; try { host = new URL(c.last?.url || c.url).hostname; } catch { /* none */ } castSite(c.id, host); } },
    bare && { label: 'Background', icon: 'layers', items: Object.entries(SURFACES).map(([k, name]) => ({ label: name, checked: (c.surface || '') === k, preview: () => { const card = c.type === 'widget' && widgetPreview(c.widget, c.data, 150, 100); if (card && k) card.dataset.surface = k; return card || null; }, action() { if (k) c.surface = k; else delete c.surface; place(el, c); save(); } })) },
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
    { label: expanded && expanded.c.id === c.id ? 'Back to the board' : 'Expand', icon: 'expand', action: () => toggleExpand(c) },
    ZOOMABLE.has(c.type) && { label: `${c.type === 'web' ? 'Zoom' : 'Text size'} · ${Math.round(cardZoom(c) * 100)}%`, icon: 'expand', items: [
      { label: c.type === 'web' ? 'Zoom in' : 'Bigger', icon: 'plus', action: () => setTextSize(c, (c.zoom || 1) * (c.type === 'web' ? 1.1 : 1.15)) },
      { label: c.type === 'web' ? 'Zoom out' : 'Smaller', icon: 'minus', action: () => setTextSize(c, (c.zoom || 1) / (c.type === 'web' ? 1.1 : 1.15)) },
      { label: c.type === 'web' ? 'Actual size (100%)' : 'Normal size', icon: 'reload', action() { delete c.grow; setTextSize(c, 1); } },
      ...(c.type === 'web' ? [50, 67, 80, 90, 110, 125, 150, 175, 200].map(p => ({ label: p + '%', checked: Math.round(cardZoom(c) * 100) === p, action() { delete c.grow; setTextSize(c, p / 100); } })) : []),
      { label: 'Grows with the card', checked: !!c.grow, action() {
        if (c.grow) { c.zoom = cardZoom(c); delete c.grow; } else c.grow = c.w;    // keep today's size either way
        setTextSize(c, c.zoom || 1);
      } },
      { info: c.type === 'web' ? 'Or, inside the site: Ctrl + scroll, pinch, Ctrl + plus / minus, Ctrl + 0.' : 'Or hold Ctrl and scroll over the selected card.' },
    ] },
    c.type === 'links' && { label: 'One click shows a preview (two clicks open)', checked: !c.direct, action() { c.direct = !c.direct; save(); } },
    c.type === 'term' && { label: `Shell · ${SHELL_NAMES[c.shell] || SHELL_NAMES.powershell}`, icon: 'term', items: Object.entries(SHELL_NAMES).map(([k, name]) => ({
      label: name, checked: (c.shell || 'powershell') === k, async action() {
        if ((c.shell || 'powershell') === k) return;
        c.shell = k; save();
        await helper.call('/term/stop', { key: c.id }).catch(() => {});
        setTimeout(() => refreshCard(c), 300);
      } })) },
    c.type === 'web' && { label: 'Show only the website (no frame)', checked: !!c.plain, action() { c.plain = !c.plain; refreshCard(c); save(); } },
    { label: c.css ? 'Style with CSS… (has its own style)' : 'Style with CSS…', icon: 'edit', action: () => styleCard(c) },
    c.type === 'web' && { label: 'Hide the scroll bars', checked: hidesBars(c), action() { c.noScroll = !hidesBars(c); refreshCard(c); save(); } },
    c.type === 'web' && { label: 'Come back where I left it (page and scroll)', checked: !c.forget, action() { c.forget = !c.forget; if (c.forget) delete c.last; save(); } },
    c.type === 'web' && { label: 'Always open in its own window', checked: !!c.own, action() { c.own = !c.own; refreshCard(c); save(); } },
    !bare && { label: 'Rename', icon: 'edit', action: () => renameCard(c) },
    { label: 'Copy link to this card', icon: 'links', action: () => copyBoardLink(`homeboard:board/${state.active}/card/${c.id}`) },
    { label: 'Duplicate', icon: 'copy', action: () => duplicateCard(c) },
    SHARED[c.type] && !c.lock && { label: 'Linked copy (stays the same)', icon: 'links', items: [
      { info: 'A second copy of this that changes whenever this one does, and the other way round.' },
      { label: 'Here, beside it', icon: 'plus', action: () => makeLinkedCopy(c, board()) },
      ...others.map(b => ({ label: `On “${b.name}”`, icon: 'arrow', action() {
        const k = makeLinkedCopy(c, b, { x: 80, y: 80 });
        if (k) toast(`Linked copy put on “${b.name}”.`, 'Go there', () => followBoardLink(`homeboard:board/${b.id}/card/${k.id}`));
      } })),
    ] },
    c.sync && { label: 'Make this one separate', icon: 'x', action: () => stopSharing(c) },
    ...others.map(b => ({
      label: `Move to “${b.name}”`, icon: 'arrow',
      action() {
        moveCardTo(c, b);
      },
    })),
    { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, action: () => removeCard(c) },
  ];
}

