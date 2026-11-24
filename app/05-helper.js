/* Homeboard · The helper, the file browser, the console.
   Part 6 of 9 of the board page: classic scripts that share one scope, loaded in order by index.html
   (app/00-core.js … app/08-main.js). See docs/ARCHITECTURE.md. */
'use strict';

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
    if (!key) throw new Error(helperHint());
    let r;
    try { r = await fetch(this.base + what, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
    catch { this.up = false; throw new Error(helperHint()); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'The helper could not do that.'), { code: j.code });
    return j;
  },
  async ready(force) {
    if (!force && Date.now() - this.checked < 4000) return this.up;
    this.checked = Date.now();
    try { await this.call('/ping'); this.up = true; } catch { this.up = false; this.token = null; }
    return this.up;
  },
};
let installedAt = '';                               // the folder this copy runs from (written there by tools\\install.ps1)
fetch('install-path.txt', { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(t => { installedAt = t.trim(); }, () => {});
const helperFolder = () => (installedAt || 'the Homeboard folder') + '\\tools';
const helperHint = () => `This needs the Homeboard helper, a small program on this computer that lets Homeboard move files, run a console and keep daily backups. Start it once: open ${helperFolder()}, right-click start-helper.ps1 and choose “Run with PowerShell”. To have it start with Windows, do the same with install-helper-startup.ps1.`;
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
    return new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', row.url); x.onload = () => res(x.responseText.slice(0, 5000000)); x.onerror = rej; x.send(); });
  };
  let textMode = null;                               // the last view chosen for text files in this card
  function textView(row) {
    const host = h('div', { class: 'files-doc' }), editable = direct && !!row.url, path = editable && pathOf(row.url);
    globalThis.HomeboardFileView.mount(host, {
      isMd: /\.(md|markdown)$/i.test(row.name), base: row.url || null, mode: textMode,
      load: async () => ({ text: await textOf(row) }),
      open: editable ? async () => { if (!(await helper.ready(true))) throw new Error(helperHint()); return helper.call('/fs/read', { path }); } : null,
      save: editable ? d => helper.call('/fs/write', { path, ...d }) : null,
      onMode: m => { if (m !== 'edit') textMode = m; },
      onLink: href => { if (/^file:/i.test(href)) { openExternal(href); return true; } return false; },
    });
    return host;
  }
  async function viewer(row, big) {
    const kind = fileKind(row.name);
    if (kind === 'text') return textView(row);
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
/* ---- console: a real terminal (xterm.js, the one VS Code uses) on a Windows pseudo-console run by the helper.
   Full-screen programs work (Claude Code, vim, htop-likes), with colours and resizing. Ctrl+C copies when text is
   selected and otherwise stops what runs; Ctrl+V pastes. The session keeps running when the board closes. ---- */
const SHELL_NAMES = { powershell: 'Windows PowerShell', pwsh: 'PowerShell 7', cmd: 'Command Prompt' };
function termTheme() {
  const cs = getComputedStyle(document.body), v = n => cs.getPropertyValue(n).trim();
  return { background: 'rgba(0,0,0,0)', foreground: v('--text') || '#e6e6e6', cursor: v('--accent') || '#7aa2ff', cursorAccent: '#000',
    selectionBackground: 'rgba(122,162,255,.35)' };
}
function buildTerm(c, body, head, more) {
  const box = h('div', { class: 'term-x' });
  body.append(box);
  if (!window.Terminal || !window.FitAddon) { box.textContent = 'The terminal files are missing (vendor/xterm).'; return; }
  const term = new Terminal({
    fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, monospace', fontSize: Math.round(13 * cardZoom(c)),
    cursorBlink: true, scrollback: 8000, allowTransparency: true, theme: termTheme(), drawBoldTextInBrightColors: true,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  // the terminal undoes the board's zoom: it draws at the screen's own size, so the mouse lands on the right letter
  // (xterm works out positions without knowing about a scaled page) and the text stays crisp at any zoom
  const inner = h('div', { class: 'term-in' });
  box.append(inner);
  let id = null, abort = null, ended = false, opened = false;
  let refitZoom = 0;
  const counter = z => {
    if (!box.isConnected && opened) { zoomWatch.delete(counter); return; }
    inner.style.width = (100 * z) + '%'; inner.style.height = (100 * z) + '%'; inner.style.transform = `scale(${1 / z})`;
    clearTimeout(refitZoom); refitZoom = setTimeout(() => { try { if (opened) fit.fit(); } catch { /* not on screen */ } }, 160);
  };
  zoomWatch.add(counter);
  counter(board().view.z || 1);
  const say = text => term.write('\r\n\x1b[2m' + text.replace(/\n/g, '\r\n') + '\x1b[0m\r\n');

  // keys go to the helper in order, gathered while one is on its way
  let queue = '', sending = false;
  const flushKeys = async () => {
    if (sending || !queue || !id) return;
    sending = true;
    const data = queue; queue = '';
    try { await helper.call('/term/write', { id, data }); } catch { say('[the console has ended]'); id = null; ended = true; }
    sending = false;
    flushKeys();
  };
  term.onData(d => {
    if (!id) { if (ended) start(); return; }               // after the end, any key starts a new console
    queue += d; flushKeys();
  });
  term.attachCustomKeyEventHandler(e => {
    if (e.type !== 'keydown') return true;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'c' && term.hasSelection()) {   // copy, like Windows Terminal
      navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
      term.clearSelection();
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'v') return false;              // the browser pastes into the terminal
    return true;
  });
  let sizeTimer = 0, sent = '';
  const refit = () => {
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => {
      if (!box.isConnected || !box.clientWidth || !box.clientHeight) return;
      try { fit.fit(); } catch { return; }
      const now = term.cols + 'x' + term.rows;
      if (id && now !== sent) { sent = now; helper.call('/term/resize', { id, cols: term.cols, rows: term.rows }).catch(() => {}); }
    }, 60);
  };
  new ResizeObserver(refit).observe(box);
  body.closest('.card')?.addEventListener('hb-zoom', () => { term.options.fontSize = Math.round(13 * cardZoom(c)); refit(); });

  async function start() {
    ended = false;
    abort?.abort();
    if (!opened) { term.open(inner); opened = true; }
    term.reset();
    if (!(await helper.ready(true))) { say(helperHint()); ended = true; return; }
    try { fit.fit(); } catch { /* not on screen yet */ }
    try { id = (await helper.call('/term/start', { cwd: c.cwd, key: c.id, cols: term.cols, rows: term.rows, shell: c.shell })).id; }
    catch (e) { say(e.message); ended = true; return; }
    sent = term.cols + 'x' + term.rows;
    abort = new AbortController();
    try {
      const res = await fetch(`${helper.base}/term/stream?id=${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + helper.token }, signal: abort.signal });
      if (!res.ok) { say('The console could not be connected to the helper.'); id = null; ended = true; return; }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !box.isConnected) break;           // the card is gone: stop listening (the console keeps running)
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buf.slice(0, i));
          buf = buf.slice(i + 1);
          if (msg.b) term.write(Uint8Array.from(atob(msg.b), ch => ch.charCodeAt(0)));
          else if ('x' in msg) { say('[the console ended · press any key for a new one]'); id = null; ended = true; }
        }
      }
    } catch { /* stopped */ }
  }
  const restart = async () => {
    if (id) await helper.call('/term/stop', { id }).catch(() => {});
    id = null; abort?.abort();
    setTimeout(start, 300);
  };
  box.addEventListener('pointerdown', () => setTimeout(() => term.focus(), 0));
  more.before(h('button', { class: 'icon-btn', type: 'button', title: 'End what runs here and start a fresh console', 'aria-label': 'Restart console', onclick: restart }, icon('reload')));
  requestAnimationFrame(() => start());
}

