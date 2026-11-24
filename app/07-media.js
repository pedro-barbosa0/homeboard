/* Homeboard · Clipboard, drag and drop, what plays where, Now playing.
   Part 8 of 9 of the board page: classic scripts that share one scope, loaded in order by index.html
   (app/00-core.js … app/08-main.js). See docs/ARCHITECTURE.md. */
'use strict';

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
const GROUP_TYPE = 'application/x-homeboard-cards+json';
function copySelected(e, cut) {
  if (isEditable(e.target) || !selected || String(getSelection()).trim()) return;   // real text selections copy as usual
  if (picked.size > 1) {                              // a group: its cards and where they sit relative to each other
    e.preventDefault();
    const cards = pickedCards(), b = board();
    const pack = { homeboard: 'cards', v: 1, cards: structuredClone(cards), strings: b.strings.filter(t => picked.has(t.from) && picked.has(t.to)) };
    const json = JSON.stringify(pack), text = cards.map(k => cardText(k) || k.title).join('\n\n');
    e.clipboardData.setData('text/plain', text);
    try { e.clipboardData.setData(GROUP_TYPE, json); } catch { /* clip covers it */ }
    clip = { text, group: JSON.parse(json) };
    if (cut) removeCards(cards); else toast(`${cards.length} cards copied. Ctrl+V pastes them (here or on another board).`);
    return;
  }
  const c = board().cards.find(k => k.id === selected);
  if (!c) return;
  e.preventDefault();
  const text = cardText(c) || c.title, json = JSON.stringify(c);
  e.clipboardData.setData('text/plain', text);
  try { e.clipboardData.setData(CLIP_TYPE, json); } catch { /* custom types unsupported: `clip` covers it */ }
  clip = { text, card: JSON.parse(json) };
  if (cut) removeCard(c); else toast('Card copied. Ctrl+V pastes it.');
}
let pasteLinked = false;                            // Ctrl+Shift+V: paste a copied note as a linked copy
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') { pasteLinked = true; setTimeout(() => { pasteLinked = false; }, 300); } }, true);
function findCard(id) { for (const b of state.boards) { const c = b.cards.find(k => k.id === id); if (c) return [b, c]; } return null; }
/* a copied group: pasted where the pointer is, keeping its layout and the strings inside it */
function pasteGroup(pack) {
  const list = (Array.isArray(pack.cards) ? pack.cards : []).map(raw => normalize({ boards: [{ cards: [structuredClone(raw)] }] })?.boards[0].cards[0]).filter(Boolean);
  if (!list.length) return;
  const ids = new Map(), b = board();
  const minX = Math.min(...list.map(c => c.x)), minY = Math.min(...list.map(c => c.y));
  const at = pointerSpot() || toWorld(innerWidth / 2 - 100, innerHeight / 2 - 100);
  world.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected'));
  picked.clear();
  for (const src of list) {
    const c = { ...src, id: uid(), z: ++maxZ, x: snap(at.x + (src.x - minX)), y: snap(at.y + (src.y - minY)) };
    ids.set(src.id, c.id);
    delete c.sync;
    for (const it of [...(c.items || []), ...(c.links || [])]) it.id = uid();
    b.cards.push(c);
    stringsEl.before(buildCard(c));
    picked.add(c.id); cardEl(c.id)?.classList.add('selected'); selected = c.id;
  }
  for (const t of Array.isArray(pack.strings) ? pack.strings : []) if (ids.has(t.from) && ids.has(t.to)) b.strings.push({ ...t, id: uid(), from: ids.get(t.from), to: ids.get(t.to) });
  drawStrings(); save();
  toast(`Pasted ${list.length} cards.`);
}
function removeCards(cards) {                         // a group deleted at once, with one Undo
  const b = board(), gone = [];
  closeConsolesLater(cards);
  for (const c of cards) { const i = b.cards.indexOf(c); if (i < 0) continue; b.cards.splice(i, 1); gone.push({ c, cut: cutStringsOf(b, c.id) }); cardEl(c.id)?.remove(); picked.delete(c.id); }
  selected = null; drawStrings(); save();
  toast(`${gone.length} cards deleted`, 'Undo', () => {
    const home = state.boards.find(x => x.id === b.id) || board();
    for (const { c } of gone) home.cards.push(c);
    for (const { cut } of gone) home.strings.push(...cut.filter(s2 => home.cards.some(k => k.id === s2.from) && home.cards.some(k => k.id === s2.to) && !home.strings.includes(s2)));
    if (home.id === state.active) { for (const { c } of gone) stringsEl.before(buildCard(c)); drawStrings(); }
    save();
  });
}
function duplicateCards(cards) {
  world.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected'));
  picked.clear();
  for (const c of cards) {
    const copy = { ...structuredClone(c), id: uid(), x: c.x + 26, y: c.y + 26, z: ++maxZ };
    delete copy.sync;
    board().cards.push(copy); stringsEl.before(buildCard(copy));
    picked.add(copy.id); cardEl(copy.id)?.classList.add('selected'); selected = copy.id;
  }
  save();
}
function pasteCard(raw) {
  const original = raw && raw.id && findCard(String(raw.id));
  const shareable = original && SHARED[original[1].type] && !original[1].lock;
  if (pasteLinked && shareable) {
    const at = pointerSpot();
    makeLinkedCopy(original[1], board(), at ? { x: snap(at.x - original[1].w / 2), y: snap(at.y - 16) } : null);
    toast('Pasted a linked copy: it stays the same as the original.');
    return;
  }
  const src = normalize({ boards: [{ cards: [structuredClone(raw)] }] })?.boards[0].cards[0];
  if (!src) return;
  const c = { ...src, id: uid(), z: ++maxZ };
  delete c.sync;
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
  if (shareable) toast('Pasted a separate copy.', 'Keep them the same', () => {   // turn it into a linked copy instead
    const [, orig] = findCard(original[1].id) || [];
    if (!orig || !board().cards.includes(c)) return;
    orig.sync ||= uid();
    for (const k of SHARED[orig.type]) { if (orig[k] === undefined) delete c[k]; else c[k] = structuredClone(orig[k]); }
    c.sync = orig.sync;
    spread.set(orig.sync, sharedSig(orig));
    refreshCard(c); if (cardEl(orig.id)) refreshCard(orig);
    save();
    toast('Linked: changing either one changes both.');
  });
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
  let pack = null;                                   // a copied board?
  try { const j = JSON.parse(text); if (j && j.homeboard === 'boards') pack = j; } catch { /* plain text */ }
  if (pack && pasteBoards(pack, board().parent, board().id)) return;
  let group = null;                                  // a copied group of cards?
  try { group = JSON.parse(cd.getData(GROUP_TYPE) || 'null'); } catch { /* not ours */ }
  if (!group && clip && clip.group && text === clip.text) group = clip.group;
  if (!group) { try { const j = JSON.parse(text); if (j && j.homeboard === 'cards') group = j; } catch { /* plain text */ } }
  if (group && group.homeboard === 'cards') { pasteGroup(group); return; }
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
/* Files dragged out of a file browser onto the board: a menu of what to make of them, the likely one first. */
const FILE_TAKERS = '.card-files, .card-apps, .card-space, .files-browser';
const fileText = url => new Promise((res, rej) => {
  const x = new XMLHttpRequest();
  x.open('GET', url);
  x.onload = () => (x.status === 0 || x.status === 200 ? res(x.responseText) : rej(new Error('unreadable')));
  x.onerror = () => rej(new Error('unreadable'));
  x.send();
});
const fileBlob = url => new Promise((res, rej) => {
  const x = new XMLHttpRequest();
  x.open('GET', url); x.responseType = 'blob';
  x.onload = () => (x.response ? res(x.response) : rej(new Error('unreadable')));
  x.onerror = () => rej(new Error('unreadable'));
  x.send();
});
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', ogv: 'video/ogg', pdf: 'application/pdf' };
function dropFiles(paths, at, x, y) {
  const list = [].concat(paths).filter(p => typeof p === 'string' && p).slice(0, 20).map(p => {
    const url = toAddress(p), name = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p, ext = ((/\.([^.\\/]+)$/.exec(name) || [])[1] || '').toLowerCase();
    return { path: p, url, name, ext, kind: !ext ? 'folder' : fileKind(name) };
  }).filter(f => f.url);
  if (!list.length) return;
  if (!fileAccess) { toast(localHint()); return; }
  const many = list.length > 1, step = i => ({ x: at.x + i * 30, y: at.y + i * 30 });
  const texts = list.filter(f => f.kind === 'text'), pics = list.filter(f => ['image', 'video', 'pdf'].includes(f.kind)), dirs = list.filter(f => f.kind === 'folder');
  const asNotes = async () => {
    let i = 0;
    for (const f of texts) {
      try {
        const t = (await fileText(f.url)).slice(0, 1000000);
        const md = /^(md|markdown|txt|text)$/.test(f.ext) ? t : '```' + f.ext + '\n' + t.replace(/\n$/, '') + '\n```';
        addCard('note', step(i++), { title: f.name, named: true, markdown: true, md, w: 380, h: 360 });
      } catch { toast(`“${f.name}” could not be read.`); }
    }
  };
  const asMedia = async () => {
    const files = [];
    for (const f of pics) { try { const b = await fileBlob(f.url); files.push(new File([b], f.name, { type: MIME[f.ext] || b.type })); } catch { toast(`“${f.name}” could not be read.`); } }
    if (files.length) addMediaFiles(files, at);
  };
  const asViews = () => list.forEach((f, i) => (f.kind === 'folder'
    ? addCard('files', step(i), { path: f.url.replace(/\/?$/, '/'), title: f.name, named: true })
    : addCard('web', step(i), { url: f.url, title: f.name, named: true })));
  const asLinks = () => addCard('links', at, { title: many ? 'Files' : list[0].name, links: list.map(f => ({ id: uid(), title: f.name, url: f.url, how: f.kind === 'folder' ? 'explorer' : 'tab' })) });
  const what = many ? `these ${list.length}` : `“${list[0].name}”`;
  openMenu(x, y, [
    { info: `Put ${what} on the board as…` },
    texts.length && { label: texts.length > 1 || many ? 'Notes with their text' : 'A note with its text', icon: 'note', action: asNotes },
    pics.length && { label: pics.length > 1 ? 'Pictures / videos / PDFs on the board' : list[0].kind === 'pdf' ? 'The PDF on the board' : 'The picture on the board', icon: 'media', action: asMedia },
    dirs.length && !texts.length && !pics.length && { label: dirs.length > 1 ? 'File browsers' : 'A file browser of this folder', icon: 'files', action: asViews },
    (texts.length || pics.length || list.some(f => f.kind === 'other')) && { label: many ? 'Windows showing the files' : 'A window showing the file (stays up to date)', icon: 'web', action: asViews },
    { label: many ? 'Links to them' : 'A link to it', icon: 'links', action: asLinks },
  ]);
}

function onDrop(e) {
  if (e.dataTransfer.types.includes(FILES_DND)) {                                // a file from a file browser
    if (e.target.closest?.(FILE_TAKERS)) return;                                  // file browsers, apps and workspaces take it themselves
    e.preventDefault();
    document.body.classList.remove('dropping');
    let paths = [];
    try { paths = JSON.parse(e.dataTransfer.getData(FILES_DND)); } catch { return; }
    dropFiles(paths, toWorld(e.clientX, e.clientY), e.clientX, e.clientY);
    return;
  }
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
  if (expanded) collapseCard();
  const b = board();
  opened.clear();                                   // leaving a board locks its notes again
  document.body.classList.toggle('view-locked', !!b.frozen);
  whenOnline.clear();
  applySettings();
  if (!panel.hidden) syncSettingsUI();
  b.cards.sort((a, c) => a.z - c.z).forEach((c, i) => { c.z = i + 1; });
  maxZ = b.cards.length;
  selected = null;
  // what is playing stays: its card is only hidden while another board is open (moving or rebuilding it would stop it)
  const keep = new Map();
  for (const el of world.querySelectorAll(':scope > .card')) if (isPlayingEl(el) && findCard(el.dataset.id)) keep.set(el.dataset.id, el);
  for (const n of [...world.children]) if (n !== stringsEl && !keep.has(n.dataset?.id)) n.remove();
  if (stringsEl.parentNode !== world) world.append(stringsEl);
  for (const c of b.cards) {
    const el = keep.get(c.id);
    if (el) { el.classList.remove('away'); place(el, c); keep.delete(c.id); }
    else stringsEl.before(buildCard(c));
  }
  for (const el of keep.values()) { el.classList.add('away'); el.classList.remove('selected'); }
  onScreen.refresh();
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

/* ---- media: what plays, wherever it is ---- */
const mediaState = new Map();                          // website window card id -> { playing, title, artist, art, video, at }
const MEDIA_HOSTS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|twitch\.tv|netflix\.com|vimeo\.com|deezer\.com|tidal\.com|music\.apple\.com|primevideo\.com|disneyplus\.com|dailymotion\.com|mixcloud\.com|bandcamp\.com)$/i;
/* Casting. A video of the board goes to a TV or box straight from here (the browser lists the devices);
   a site plays best through its own cast button (the TV then streams by itself); anything else, or a whole board,
   through Edge's menu. Browsers let a page start only the first of these. */
const CAST_EDGE = 'For anything else, or a whole board: Edge’s ⋯ menu → More tools → Cast media to device.';
function castVideo(v) {
  if (!v || !v.remote || !v.remote.prompt) { toast('This browser cannot send videos to a TV from a page. ' + CAST_EDGE); return; }
  v.muted = false;
  v.remote.prompt().then(() => hud('Sent to the TV'), e => toast(e && e.name === 'NotFoundError' ? 'No TV or box was found. It has to be on and on the same network (Chromecast / Google TV and similar). ' + CAST_EDGE : 'Not cast. ' + CAST_EDGE));
}
function castSite(cardId, host) {
  const own = /youtube|spotify|netflix|twitch|primevideo|disneyplus|deezer|tidal/i.test(host || '');
  toast(own ? 'Press the cast button inside the player (the screen with waves): the TV then plays it by itself, and this computer can rest. ' + CAST_EDGE : 'This site has no cast button of its own: use Edge’s ⋯ menu → More tools → Cast media to device.', null, null);
  if (cardId) { const el = cardEl(cardId); el?.querySelector('.web-shield')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }
}

function setMedia(id, m) {
  const was = mediaState.get(id)?.playing;
  if (m && typeof m === 'object') mediaState.set(id, { playing: !!m.playing, title: String(m.title || '').slice(0, 200), artist: String(m.artist || '').slice(0, 200), art: /^https?:/i.test(m.art || '') ? m.art : '', video: !!m.video, at: Date.now() });
  else mediaState.delete(id);
  if (was !== mediaState.get(id)?.playing) { renderTabs(); nowPlaying.update(); }
  else nowPlaying.update(true);
}
function isPlayingEl(el) {                            // a card that is making sound now (or paused a moment ago)
  if (!el.classList.contains('card')) return false;
  const st = mediaState.get(el.dataset.id);
  if (st && (st.playing || Date.now() - st.at < 600000) && el.querySelector('.web-frame iframe')) return true;
  return [...el.querySelectorAll('video')].some(v => !v.muted && (!v.paused || v.currentTime > 0) && !v.classList.contains('web-live'));
}
setInterval(() => {                                   // hidden cards of other boards that stopped long ago are let go
  for (const el of world.querySelectorAll(':scope > .card.away')) if (!isPlayingEl(el) || !findCard(el.dataset.id)) el.remove();
}, 30000);

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
        b.cards.some(c => mediaState.get(c.id)?.playing || cardEl(c.id)?.querySelector('video:not([muted]):not(.web-live)')?.paused === false) && h('span', { class: 'tab-playing', title: 'Something is playing on this board' }, '♪'),
        b.kind === 'file' && h('span', { class: 'tab-kind', title: 'Shows a page instead of cards' }, icon('file')),
        h('span', { class: 'tab-plus', title: 'New board inside', onclick(e) { e.stopPropagation(); addBoard(b.id); } }, icon('plus')));
      t.style.setProperty('--depth', depth);
      t.addEventListener('click', () => { if (boardDragged) { boardDragged = false; return; } if (!editing()) openBoard(b); });
      t.addEventListener('pointerdown', e => { if (!editing()) dragBoard(e, b, t); });
      t.addEventListener('keydown', e => {
        if (editing()) return;
        if (/^Arrow(Up|Down|Left|Right)$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); treeStep(b, e.key); return; }
        if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); t.blur(); tabsEl.classList.remove('keys'); return; }
        if (e.key === 'Enter') { e.preventDefault(); openBoard(b); t.blur(); tabsEl.classList.remove('keys'); return; }
        if (e.key === ' ') { e.preventDefault(); openBoard(b); }
        else if (e.key === 'F2') renameBoard(b);
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copyBoard(b); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateBoard(b); }
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

/* Drag a board in the tree, like pages in OneNote: the top or bottom of a row puts it before or after,
   the middle puts it inside; resting on a closed board opens it. Dropping on "New board" moves it to the top level. */
let boardDragged = false;
function dragBoard(e, b, row) {
  if (e.button !== 0 || e.target.closest('.tab-fold, .tab-plus')) return;
  boardDragged = false;
  const sx = e.clientX, sy = e.clientY;
  let on = false, drop = null, ghost = null, hoverRow = null, hoverTimer = 0;
  const line = h('div', { class: 'tab-drop-line' });
  const clear = () => { tabsEl.querySelectorAll('.drop-in').forEach(n => n.classList.remove('drop-in')); line.remove(); drop = null; };
  const move = ev => {
    if (!on) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      on = true;
      tabsEl.classList.add('hold', 'tab-dragging');
      ghost = h('div', { class: 'tab-ghost' }, row.querySelector('.tab-chip').cloneNode(true), h('span', null, b.name));
      document.body.append(ghost);
    }
    ghost.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY - 14}px)`;
    clear();
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    if (under?.closest?.('.tab-add')) { drop = { where: 'top' }; under.closest('.tab-add').classList.add('drop-in'); return; }
    const over = under?.closest?.('.tab[data-board]');
    const target = over && boardById(over.dataset.board);
    if (!target || isUnder(target, b.id)) { clearTimeout(hoverTimer); hoverRow = null; return; }   // never inside itself
    const r = over.getBoundingClientRect(), f = (ev.clientY - r.top) / r.height;
    const where = f < .28 ? 'before' : f > .72 ? 'after' : 'inside';
    drop = { target, where };
    if (where === 'inside') over.classList.add('drop-in');
    else { line.style.setProperty('--depth', over.style.getPropertyValue('--depth') || 0); if (where === 'before') over.before(line); else over.after(line); }
    if (over.dataset.board !== hoverRow) {
      hoverRow = over.dataset.board; clearTimeout(hoverTimer);
      if (target.collapsed && kidsOf(target.id).length) hoverTimer = setTimeout(() => { target.collapsed = false; renderTabs(); }, 650);
    }
  };
  const end = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
    clearTimeout(hoverTimer);
    ghost?.remove();
    tabsEl.classList.remove('hold', 'tab-dragging');
    const d = drop; clear();
    if (!on) return;
    boardDragged = true; setTimeout(() => { boardDragged = false; }, 0);
    if (!d) return;
    state.boards.splice(state.boards.indexOf(b), 1);
    if (d.where === 'top') { b.parent = null; state.boards.push(b); }
    else if (d.where === 'inside') { b.parent = d.target.id; d.target.collapsed = false; state.boards.push(b); }
    else { b.parent = d.target.parent || null; const i = state.boards.indexOf(d.target); state.boards.splice(d.where === 'before' ? i : i + 1, 0, b); }
    renderTabs(); save();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
}

/* homeboard:board/<id>, homeboard:board/<id>/view/<id>, homeboard:board/<id>/card/<id> */
const BOARD_LINK = /^homeboard:board\/([\w-]+)(?:\/(view|card)\/([\w-]+))?\/?$/;
function boardLinkName(href) {
  const m = BOARD_LINK.exec(href || ''), b = m && boardById(m[1]);
  if (!b) return 'Missing board';
  const v = m[2] === 'view' ? b.views.find(p => p.id === m[3]) : null, c = m[2] === 'card' ? b.cards.find(k => k.id === m[3]) : null;
  return b.name + (v ? ' › ' + v.name : c ? ' › ' + c.title : '');
}
function followBoardLink(href) {
  const m = BOARD_LINK.exec(href || '');
  if (!m) return false;
  const b = boardById(m[1]);
  if (!b) { toast('That board is not there any more.'); return true; }
  collapseCard();
  if (b.id !== state.active) openBoard(b);
  if (m[2] === 'view') {
    const p = b.views.find(v => v.id === m[3]);
    if (p) goTo(viewOf(p)); else { toast('That view was deleted; here is the board.'); goHome(); }
  } else if (m[2] === 'card') {
    const c = b.cards.find(k => k.id === m[3]);
    if (!c) { toast('That card is not on the board any more.'); return true; }
    const z = clamp(Math.min((innerWidth - 160) / c.w, (innerHeight - 220) / c.h, 1.2), ZMIN, ZMAX);
    goTo({ z, x: innerWidth / 2 - (c.x + c.w / 2) * z, y: innerHeight / 2 + 10 - (c.y + c.h / 2) * z });
    select(c.id);
    const el = cardEl(c.id);
    el?.classList.remove('flash'); void el?.offsetWidth; el?.classList.add('flash');
  } else if (b.id === state.active) goHome();
  return true;
}
function copyBoardLink(href) {
  const md = `[${boardLinkName(href).replace(/[[\]]/g, '')}](${href})`;
  navigator.clipboard?.writeText(md).then(() => toast('Link copied. Paste it into a note, or into a Links card, to jump there with a click.'), () => toast(md));
}
document.addEventListener('click', e => {             // board links anywhere on the page (notes, link tiles, the side panel)
  const a = e.target.closest?.('a[href^="homeboard:"]');
  if (!a) return;
  e.preventDefault(); e.stopPropagation();
  followBoardLink(a.getAttribute('href'));
}, true);

/* Tab (with nothing being typed) opens the board tree for the keyboard, like a file tree:
   ↑ / ↓ the boards on the same level, → into the boards inside (opening it if closed), ← back out to the parent.
   Each board opens as you reach it; Enter, Esc or Tab goes back to the board. */
function boardKeys() {
  const row = tabsEl.querySelector(`.tab[data-board="${CSS.escape(state.active)}"]`);
  if (!row) return;
  tabsEl.classList.add('keys');
  row.focus();
  hud('Boards: ↑ ↓ same level · → inside · ← out · Enter or Esc to stay');
}
function treeStep(b, key) {
  const sibs = kidsOf(b.parent), i = sibs.indexOf(b);
  let to = null;
  if (key === 'ArrowUp') to = sibs[i - 1] || null;
  else if (key === 'ArrowDown') to = sibs[i + 1] || null;
  else if (key === 'ArrowRight') { const kids = kidsOf(b.id); if (kids.length) { if (b.collapsed) { b.collapsed = false; save(); } to = kids[0]; } }
  else if (key === 'ArrowLeft') to = boardById(b.parent) || null;
  if (!to) { const row = tabsEl.querySelector(`.tab[data-board="${CSS.escape(b.id)}"]`); row?.classList.remove('bump'); void row?.offsetWidth; row?.classList.add('bump'); return; }
  if (to.id !== state.active) { state.active = to.id; renderTabs(); renderBoard(); save(); } else renderTabs();
  tabsEl.classList.add('keys');
  tabsEl.querySelector(`.tab[data-board="${CSS.escape(to.id)}"]`)?.focus();
}

tabsEl.addEventListener('focusout', e => { if (!tabsEl.contains(e.relatedTarget)) tabsEl.classList.remove('keys'); });

/* ---- Now playing: a button by the clock while something plays; its panel lists what plays on any board and in
   other Edge tabs (play / pause, Go there) and finds every piece of media on the boards. ---- */
const nowPlaying = (() => {
  let btn = null, panel = null, search = null, list = null, timer = 0, tabs = [], pausedTabs = new Map();
  const fmtWhere = (b, c) => `${b.name} › ${c.title}`;
  function sources() {                                  // things that play or were paused: board windows, board videos, Edge tabs
    const out = [];
    for (const [id, st] of mediaState) {
      const f = findCard(id);
      if (!f) continue;
      const [b, c] = f;
      let host = ''; try { host = new URL(c.last?.url || c.url).hostname; } catch { /* none */ }
      out.push({ key: 'w' + id, title: st.title || c.title, sub: [st.artist, fmtWhere(b, c)].filter(Boolean).join(' · '), art: st.art, playing: st.playing, at: st.at,
        cast: () => { close(); followBoardLink(`homeboard:board/${b.id}/card/${id}`); castSite(id, host); },
        toggle: () => api?.tabs?.sendMessage(tabId, { homeboard: 'media-cmd', card: id, action: 'toggle' }).catch(() => {}),
        go: () => followBoardLink(`homeboard:board/${b.id}/card/${id}`) });
    }
    for (const v of world.querySelectorAll('.card video:not(.web-live)')) {
      if (v.muted || (v.paused && !v.currentTime)) continue;
      const id = v.closest('.card').dataset.id, f = findCard(id);
      if (!f) continue;
      const [b, c] = f;
      out.push({ key: 'v' + id, title: c.title, sub: (v.remote && v.remote.state === 'connected' ? 'On the TV · ' : '') + fmtWhere(b, c), playing: !v.paused, at: Date.now(), icon: 'play',
        cast: () => castVideo(v),
        toggle: () => (v.paused ? v.play().catch(() => {}) : v.pause()), go: () => followBoardLink(`homeboard:board/${b.id}/card/${id}`) });
    }
    for (const t of tabs) out.push({ key: 't' + t.id, title: t.title, sub: 'Edge tab' + (t.host ? ' · ' + t.host : ''), art: t.art, fav: t.fav, playing: t.playing, at: t.at,
      cast: () => { close(); castSite(null, t.host); setTimeout(() => api.tabs.update(t.id, { active: true }).then(tab => api.windows.update(tab.windowId, { focused: true })).catch(() => {}), 2500); },
      toggle: async () => { const was = t.playing; await api.tabs.sendMessage(t.id, { homeboard: 'tap-cmd', action: 'toggle' }).catch(() => {}); if (was) pausedTabs.set(t.id, { ...t, playing: false, at: Date.now() }); else pausedTabs.delete(t.id); setTimeout(refreshTabs, 300); },
      go: async () => { try { const tab = await api.tabs.update(t.id, { active: true }); await api.windows.update(tab.windowId, { focused: true }); } catch { /* closed */ } } });
    return out.sort((a, b) => (b.playing - a.playing) || (b.at - a.at));
  }
  async function refreshTabs() {                       // other Edge tabs making sound (and the ones paused from here)
    if (!api?.tabs?.query) return;
    try {
      const found = await api.tabs.query({ audible: true });
      const next = [];
      for (const t of found) {
        if (t.id === tabId) continue;
        let info = null;
        try { info = await api.tabs.sendMessage(t.id, { homeboard: 'tap-cmd', action: 'what' }); } catch { /* no script there */ }
        let host = ''; try { host = new URL(t.url).hostname.replace(/^www\./, ''); } catch { /* none */ }
        next.push({ id: t.id, title: (info && info.title) || t.title || host, host, art: info && info.art, fav: t.favIconUrl, playing: true, at: Date.now() });
        pausedTabs.delete(t.id);
      }
      for (const [id, p] of pausedTabs) { if (Date.now() - p.at > 1800000) pausedTabs.delete(id); else if (!next.some(x => x.id === id)) next.push(p); }
      const changed = JSON.stringify(next.map(x => [x.id, x.playing, x.title])) !== JSON.stringify(tabs.map(x => [x.id, x.playing, x.title]));
      tabs = next;
      if (changed) update();
    } catch { /* tabs unavailable */ }
  }
  function library(q) {                                 // every piece of media on the boards, for the search
    const out = [], f = fold(q);
    for (const b of state.boards) for (const c of b.cards) {
      let host = '';
      if (c.type === 'web') { try { host = new URL(c.last?.url || c.url).hostname; } catch { /* none */ } }
      // only media of its own: a video, a picture, a PDF, a media site (Homeboard's own music widgets and frames are
      // controls for a player that is listed already, as its Edge tab, so they are left out)
      const isMedia = c.type === 'media' || (c.type === 'web' && MEDIA_HOSTS.test(host));
      if (!isMedia) continue;
      const kind = c.type === 'media' ? ({ image: 'Picture', video: 'Video', pdf: 'PDF' }[c.kind] || 'Media') : host.replace(/^www\./, '');
      const text = fold(`${c.title} ${kind} ${b.name} ${c.url || ''} ${c.last?.url || ''}`);
      if (f && !f.split(/\s+/).every(w => text.includes(w))) continue;
      const nice = /^[\w-]{12,}\.(jpe?g|png|webp|gif|heic)$/i.test(c.title) || /^(image|img|screenshot|photo)[\s_-]*\d*(\.\w+)?$/i.test(c.title) ? `${kind} on ${b.name}` : c.title;
      out.push({ key: 'l' + c.id, title: nice, sub: `${kind} · ${b.name}`, icon: c.type === 'media' ? (c.kind === 'video' ? 'play' : c.kind === 'pdf' ? 'file' : 'media') : c.type === 'web' ? 'web' : 'widget', go: () => followBoardLink(`homeboard:board/${b.id}/card/${c.id}`) });
    }
    return out.slice(0, 60);
  }
  function row(it, controls) {
    const pic = it.art ? h('img', { src: it.art, alt: '', referrerpolicy: 'no-referrer' }) : it.fav ? h('img', { src: it.fav, alt: '', class: 'fav' }) : icon(it.icon || 'volume');
    const r = h('div', { class: 'np-row' + (it.playing ? ' on' : ''), role: 'button', tabindex: '0', title: 'Go there', onclick: () => { close(); it.go(); } },
      h('span', { class: 'np-art' }, pic),
      h('div', { class: 'np-text' }, h('div', { class: 'np-title' }, it.title || 'Untitled'), h('div', { class: 'np-sub' }, it.sub || '')),
      controls && it.cast && h('button', { class: 'icon-btn np-cast', type: 'button', title: 'Play it on a TV or box', 'aria-label': 'Cast to a TV',
        onclick(e) { e.stopPropagation(); it.cast(); } }, icon('cast')),
      controls && h('button', { class: 'icon-btn np-toggle', type: 'button', title: it.playing ? 'Pause' : 'Play', 'aria-label': it.playing ? 'Pause' : 'Play',
        onclick(e) { e.stopPropagation(); it.toggle(); setTimeout(update, 350); } }, icon(it.playing ? 'pause' : 'play')));
    r.addEventListener('keydown', e => { if (e.key === 'Enter') r.click(); });
    return r;
  }
  function drawPanel() {
    if (!panel || panel.hidden) return;
    const q = search.value.trim(), f = fold(q);
    const src = sources().filter(it => !f || fold(`${it.title} ${it.sub}`).includes(f));
    const lib = library(q);
    list.replaceChildren(
      h('div', { class: 'np-head' }, src.length ? 'Playing and paused' : 'Nothing is playing'),
      ...src.map(it => row(it, true)),
      h('div', { class: 'np-head' }, q ? `Media on your boards matching “${q}”` : 'Media on your boards'),
      ...(lib.length ? lib.map(it => row(it, false)) : [h('div', { class: 'np-none' }, q ? 'Nothing matches.' : 'No videos, pictures, PDFs or media sites on the boards yet.')]));
  }
  function update(light) {
    if (!btn) return;
    const src = sources(), top = src[0];
    const any = src.some(x => x.playing);
    btn.hidden = !src.length && state.settings.overlay === 'off';
    btn.classList.toggle('on', any);
    btn.querySelector('.np-btn-title').textContent = top ? top.title : '';
    btn.title = top ? `${any ? 'Playing' : 'Paused'}: ${top.title}${top.sub ? ' — ' + top.sub : ''}` : '';
    if (!light || (panel && !panel.hidden)) drawPanel();
  }
  /* Screen visuals: pick the music overlay by its picture, not by name */
  let visuals = null;
  const PIC = {                                       // little moving pictures of each style (SVG; the bars bounce with CSS)
    off: '<rect x="6" y="10" width="68" height="34" rx="5" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="3 3"/><path d="M28 27h24" stroke="currentColor" stroke-opacity=".5"/>',
    bottom: Array.from({ length: 9 }, (_, i) => `<rect class="b" style="animation-delay:-${(i * .17).toFixed(2)}s" x="${8 + i * 7.4}" y="20" width="4.4" height="30" rx="2"/>`).join(''),
    both: Array.from({ length: 9 }, (_, i) => `<rect class="b" style="animation-delay:-${(i * .17).toFixed(2)}s" x="${8 + i * 7.4}" y="28" width="4.4" height="22" rx="2"/><rect class="t" style="animation-delay:-${(i * .23).toFixed(2)}s" x="${8 + i * 7.4}" y="4" width="4.4" height="18" rx="2"/>`).join(''),
    sides: Array.from({ length: 6 }, (_, i) => `<rect class="l" style="animation-delay:-${(i * .2).toFixed(2)}s" x="4" y="${6 + i * 7.6}" width="26" height="4.2" rx="2"/><rect class="r" style="animation-delay:-${(i * .27).toFixed(2)}s" x="50" y="${6 + i * 7.6}" width="26" height="4.2" rx="2"/>`).join(''),
    glow: '<rect class="g" x="5" y="5" width="70" height="44" rx="7" fill="none" stroke-width="5"/><rect x="5" y="5" width="70" height="44" rx="7" fill="none" stroke="currentColor" stroke-opacity=".25"/>',
    waves: '<path class="w1" d="M0 40 Q10 26 20 36 T40 34 T60 30 T80 36 V54 H0Z"/><path class="w2" d="M0 44 Q12 34 24 42 T48 38 T80 42 V54 H0Z"/>',
    frost: '<path class="fr" d="M2 2h76v50H2z M10 10 L16 6 L18 12 L24 8 L22 15 M70 44 L64 48 L62 42 L56 46 L58 39 M6 44 L12 40 L10 47 M74 8 L68 12 L70 5" fill="none" stroke-width="1.6"/><rect class="frg" x="2" y="2" width="76" height="50" rx="5" fill="none" stroke-width="7"/>',
    disco: '<line x1="40" y1="0" x2="40" y2="8" stroke="currentColor"/><circle class="ball" cx="40" cy="16" r="8"/><circle class="dot d1" cx="14" cy="30" r="2"/><circle class="dot d2" cx="64" cy="26" r="2"/><circle class="dot d3" cx="30" cy="42" r="1.6"/><circle class="dot d1" cx="56" cy="44" r="1.8"/><circle class="dot d2" cx="70" cy="40" r="1.4"/><rect class="tile t1" x="8" y="48" width="14" height="5"/><rect class="tile t2" x="34" y="48" width="14" height="5"/><rect class="tile t3" x="58" y="48" width="14" height="5"/>',
    bursts: '<path class="s" d="M14 6l3 7 7-3-3 7 7 3-7 3 3 7-7-3-3 7-3-7-7 3 3-7-7-3 7-3-3-7 7 3z"/><path class="s s2" d="M66 30l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z"/><path d="M4 46 Q24 34 40 42 T76 38" fill="none" stroke="currentColor" stroke-width="2"/>',
  };
  function drawVisuals() {
    const o = state.settings;
    const tile = (key, name) => h('button', { class: 'np-fx' + (o.overlay === key ? ' on' : ''), type: 'button', title: name, onclick() { o.overlay = key; fx.refresh(); save(); drawVisuals(); } },
      (() => { const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('viewBox', '0 0 80 54'); sv.setAttribute('class', 'np-fx-pic look-' + o.overlayLook); sv.innerHTML = PIC[key]; return sv; })(),
      h('span', null, name));
    const chip = (on, label, fn, sw) => h('button', { class: 'style-chip' + (on ? ' on' : ''), type: 'button', onclick: fn }, sw, label);
    const dot = bg => { const i = h('i', { class: 'scene-dot' }); i.style.background = bg; return i; };
    const pal = coverPalette ? `linear-gradient(90deg, ${coverPalette.vivid}, ${coverPalette.light})` : 'conic-gradient(#ff6b6b, #ffd93d, #4d96ff, #ff6b6b)';
    setTimeout(fxStatus, 0);
    // folded by default: one row that says what is on; a click opens the pictures (remembered)
    const nice = n => n.replace(/^Bars /, '').replace(/^(.)/, m => m.toUpperCase());
    const open = !!o.npVisualsOpen;
    const head = h('button', { class: 'np-head np-fold' + (open ? ' open' : ''), type: 'button', 'aria-expanded': String(open), title: open ? 'Hide the screen visuals' : 'Choose screen visuals',
      onclick() { o.npVisualsOpen = !open; save(); drawVisuals(); } },
      h('span', null, 'Screen visuals'), h('b', { class: 'np-fold-now' + (o.overlay !== 'off' ? ' on' : '') }, nice(FX_STYLES[o.overlay] || 'Off')), h('i', { class: 'np-chev', 'aria-hidden': 'true' }, '›'));
    if (!open) { visuals.replaceChildren(head); return; }   // (Intensity lives in Customize only: one home for each setting)
    visuals.replaceChildren(...[
      head,
      h('div', { class: 'np-fx-grid' }, Object.entries(FX_STYLES).map(([k, n]) => tile(k, nice(n)))),
      o.overlay !== 'off' && h('div', { class: 'np-fx-status' }),
      o.overlay !== 'off' && h('div', { class: 'style-row' }, Object.entries(FX_LOOKS).map(([k, n]) => chip(o.overlayLook === k, n, () => { o.overlayLook = k; save(); drawVisuals(); }))),
      o.overlay !== 'off' && h('div', { class: 'style-row' },
        chip(o.overlayColor === 'cover', 'Cover', () => { o.overlayColor = 'cover'; save(); drawVisuals(); }, dot(pal)),
        chip(o.overlayColor === 'accent', 'Accent', () => { o.overlayColor = 'accent'; save(); drawVisuals(); }, dot('var(--accent)')),
        chip(o.overlayColor === 'rainbow', 'Rainbow', () => { o.overlayColor = 'rainbow'; save(); drawVisuals(); }, dot('conic-gradient(red, yellow, lime, cyan, blue, magenta, red)')),
        chip(o.overlayColor === 'color', 'Colour', () => { o.overlayColor = 'color'; save(); drawVisuals(); }, dot(o.overlayHex)),
        o.overlayColor === 'color' && h('input', { type: 'color', value: o.overlayHex, 'aria-label': 'Overlay colour', oninput(e) { o.overlayHex = e.target.value; save(); } })),
      o.overlay !== 'off' && h('div', { class: 'np-sliders' },
        h('label', null, 'Strength', h('input', { type: 'range', min: 30, max: 200, step: 5, value: o.overlayPower, oninput(e) { o.overlayPower = +e.target.value; save(); } })),
        h('label', null, 'Opacity', h('input', { type: 'range', min: 20, max: 100, step: 5, value: o.overlayAlpha, oninput(e) { o.overlayAlpha = +e.target.value; save(); } }))),
      h('button', { class: 'btn np-ambient', type: 'button', title: 'Hide the bars and buttons; Esc brings them back', onclick() { close(); ambient.toggle(true); } }, ambient.on ? 'Leave ambient mode' : 'Ambient mode')].filter(Boolean));
  }
  function fxStatus() {                               // what the overlay hears, or what to do so it hears
    const box = visuals && visuals.querySelector('.np-fx-status');
    if (!box) return;
    const a = window.HomeboardAudio, st = a && a.status ? a.status() : { state: 'silent' };
    const name = (st.title || '').slice(0, 60);
    box.dataset.state = st.state;
    box.textContent = st.state === 'hearing' ? '♪ Moving with: ' + (name || 'what plays')
      : st.state === 'blocked' ? 'It cannot hear “' + (name || 'that tab') + '” yet: click once anywhere inside it (Edge only lets a page be heard after a click there).'
      : st.state === 'waiting' ? 'Getting ready to hear “' + name + '”… if nothing moves in a few seconds, reload that tab once.'
      : 'Nothing is playing in Edge right now — play something and it starts.';
  }
  function open() {
    if (!panel) {
      search = h('input', { class: 'field', type: 'search', placeholder: 'Find media on your boards', 'aria-label': 'Find media on your boards', spellcheck: 'false' });
      search.addEventListener('input', drawPanel);
      list = h('div', { class: 'np-list' });
      visuals = h('div', { class: 'np-visuals' });
      panel = h('div', { id: 'np-panel', role: 'dialog', 'aria-label': 'Now playing' }, search, h('div', { class: 'np-scroll' }, visuals, list));
      panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
      document.body.append(panel);
      document.addEventListener('pointerdown', e => { if (panel && !panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) close(); }, true);
    }
    panel.hidden = false;
    search.value = '';
    refreshTabs();
    drawVisuals();
    drawPanel();
    fxStatus();
    search.focus();
    clearInterval(timer);
    timer = setInterval(() => { if (panel.hidden) { clearInterval(timer); return; } refreshTabs(); update(); fxStatus(); }, 1500);
  }
  function close() { if (panel) panel.hidden = true; clearInterval(timer); }
  function setup() {
    btn = h('button', { id: 'now-playing', class: 'pill', type: 'button', hidden: true, 'aria-label': 'Now playing' },
      h('span', { class: 'np-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { class: 'np-btn-title' }));
    btn.addEventListener('click', () => (panel && !panel.hidden ? close() : open()));
    btn.addEventListener('contextmenu', e => {        // right-click: pause or play the one on top, without opening anything
      e.preventDefault();
      const top = sources()[0];
      if (top) { top.toggle(); setTimeout(update, 400); }
    });
    $('#right').prepend(btn);
    // Edge says when a tab starts or stops making sound, changes its title or closes: no need to keep asking.
    // A slow check stays as a safety net, and nothing runs while this Homeboard tab is hidden.
    let soon = 0;
    const later = () => { clearTimeout(soon); soon = setTimeout(() => { if (!document.hidden) { refreshTabs(); update(true); } }, 250); };
    api?.tabs?.onUpdated?.addListener((id, info, tab) => { if ('audible' in info || 'mutedInfo' in info || ('title' in info && tab && tab.audible)) later(); });   // titles only of tabs making sound
    api?.tabs?.onRemoved?.addListener(later);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) later(); });
    setInterval(() => { if (!document.hidden) { refreshTabs(); update(true); } }, 20000);
    refreshTabs();
  }
  return { setup, update, open, close };
})();

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
    { label: 'Copy link to this board', icon: 'links', action: () => copyBoardLink(`homeboard:board/${b.id}`) },
    { label: 'Copy board', icon: 'copy', action: () => copyBoard(b) },
    { label: 'Duplicate board', icon: 'copy', action: () => duplicateBoard(b) },
    boardClip && { label: 'Paste board inside', icon: 'plus', action: () => pasteBoards(boardClip, b.id, null) },
    boardClip && { label: 'Paste board after this one', icon: 'arrow', action: () => pasteBoards(boardClip, b.parent, b.id) },
    { sep: true },
    { label: 'Export notes as Markdown (.zip)', icon: 'file', action: () => exportNotes(b.id) },
    { label: 'Notes panel on the side', checked: !!b.side, action() { b.side = !b.side; state.active = b.id; again(); if (b.side) sideText.focus(); } },
    { sep: true },
    state.boards.some(o => !isUnder(o, b.id)) && { label: kidsOf(b.id).length ? 'Delete board and those inside' : 'Delete board', icon: 'trash', danger: true, action: () => deleteBoard(b) },
  ]);
}

/* A board travels with the boards inside it, as JSON on the clipboard, so it can also be pasted into
   another copy of Homeboard. Pasted boards get new ids; strings, views and the start view follow. */
let boardClip = null;
const subtree = b => state.boards.filter(o => isUnder(o, b.id));
function copyBoard(b, quiet) {
  boardClip = { homeboard: 'boards', v: 1, root: b.id, boards: structuredClone(subtree(b)) };
  try { navigator.clipboard?.writeText(JSON.stringify(boardClip)).catch(() => {}); } catch { /* the board's own copy is enough here */ }
  if (!quiet) toast(`Board “${b.name}” copied${subtree(b).length > 1 ? ' with the boards inside it' : ''}. Ctrl+V pastes it.`);
}
function pasteBoards(pack, parentId, afterId) {
  if (!pack || pack.homeboard !== 'boards' || !Array.isArray(pack.boards) || !pack.boards.some(o => o && o.id === pack.root)) return false;
  const ids = new Map(pack.boards.map(o => [o.id, uid()]));
  const groups = new Map();                           // linked notes inside the pasted boards stay linked to each other only
  for (const o of pack.boards) for (const c of (Array.isArray(o.cards) ? o.cards : [])) if (c && c.sync) { if (!groups.has(c.sync)) groups.set(c.sync, uid()); c.sync = groups.get(c.sync); }
  const out = pack.boards.map(o => {
    const n = structuredClone(o), cards = new Map(), views = new Map();
    n.id = ids.get(o.id);
    n.parent = o.id === pack.root ? parentId || null : ids.get(o.parent) || null;
    n.cards = (Array.isArray(n.cards) ? n.cards : []).map(c => { const k = { ...c, id: uid() }; cards.set(c.id, k.id); for (const it of [...(k.items || []), ...(k.links || [])]) if (it && typeof it === 'object') it.id = uid(); return k; });
    n.strings = (Array.isArray(n.strings) ? n.strings : []).filter(t => cards.has(t.from) && cards.has(t.to)).map(t => ({ ...t, id: uid(), from: cards.get(t.from), to: cards.get(t.to) }));
    n.views = (Array.isArray(n.views) ? n.views : []).map(p => { const q = { ...p, id: uid() }; views.set(p.id, q.id); return q; });
    n.home = views.get(n.home) || null;
    if (o.id === pack.root) n.name = (state.boards.some(x => x.name === o.name) ? `${o.name} (copy)` : String(o.name || 'Board')).slice(0, 40);
    return n;
  });
  const after = afterId && boardById(afterId);
  const tail = after ? Math.max(...subtree(after).map(x => state.boards.indexOf(x))) + 1 : state.boards.length;
  state.boards.splice(tail, 0, ...out);
  normalize(state);
  state.active = ids.get(pack.root);
  renderTabs(); renderBoard(); save();
  toast(`Pasted “${boardById(state.active).name}”.`);
  return true;
}
function duplicateBoard(b) { copyBoard(b, true); pasteBoards(boardClip, b.parent, b.id); }

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
/* A website window whose page crashed (Edge shows a grey frame with a sad face) goes silent: frame.js inside
   it says "alive" every few seconds. One silent for 15 s while the board is on screen is loaded again, back where
   you were; three times in ten minutes and it stops trying and says so. */
/* Each website window keeps a port open to this tab (frame.js): open = alive. Closed for 15 s (a crash, or a page that
   never came back), or open but silent for over 40 s (a page that hangs: two check-ins missed): it is loaded again. No heartbeats broadcast. */
const alive = new Map(), healed = new Map(), linked = new Map();   // card -> last sign of life; card -> its open port
let shownSince = Date.now();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { shownSince = Date.now(); for (const k of alive.keys()) alive.set(k, Date.now()); } });
api?.runtime?.onConnect?.addListener(port => {
  const mm = /^hb-frame:([\w-]+)$/.exec(port.name || '');
  if (!mm) return;
  const id0 = mm[1], from = port.sender?.tab?.id;
  if (from == null || (tabId != null ? from !== tabId : !findCard(id0))) { port.disconnect(); return; }   // another Homeboard tab's window
  const id = mm[1];
  linked.set(id, port); alive.set(id, Date.now());
  port.onMessage.addListener(() => alive.set(id, Date.now()));
  port.onDisconnect.addListener(() => { if (linked.get(id) === port) linked.delete(id); alive.set(id, Date.now()); });
});
setInterval(() => {
  if (document.hidden || !api?.runtime?.id || Date.now() - shownSince < 20000) return;
  for (const c of board().cards) {
    if (c.type !== 'web' || !alive.has(c.id)) continue;
    const quiet = Date.now() - alive.get(c.id);
    if (linked.has(c.id) ? quiet < 40000 : quiet < 15000) continue;
    const el = cardEl(c.id), frame = el?.querySelector('.web-frame iframe');
    alive.delete(c.id);
    if (!frame) continue;
    const times = (healed.get(c.id) || []).filter(t => Date.now() - t < 600000);
    if (times.length >= 3) { toast(`“${c.title}” keeps stopping. Reload it with ↻, or open it in its own window.`); continue; }
    healed.set(c.id, [...times, Date.now()]);
    refreshCard(c);
    hud(`“${c.title}” stopped working and was loaded again`);
  }
}, 5000);

function dropUnblock() {
  if (tabId == null || !api?.declarativeNetRequest) return;
  try { api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] })?.catch?.(() => {}); } catch { /* closing */ }
}

