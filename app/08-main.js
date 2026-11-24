/* Homeboard · Wiring and start-up.
   Part 9 of 9 of the board page: classic scripts that share one scope, loaded in order by index.html
   (app/00-core.js … app/08-main.js). See docs/ARCHITECTURE.md. */
'use strict';

/* ------------------------------------------------------------------ *
 *  Wiring
 * ------------------------------------------------------------------ */
function wire() {
  api?.runtime?.onMessage?.addListener((msg, sender, reply) => {
    if (!msg || msg.homeboard !== 'frame' || !sender.tab || sender.tab.id !== tabId) return;
    alive.set(msg.card, Date.now());
    if (msg.kind === 'alive') return;                 // (an older frame.js still in a page)
    if (msg.kind === 'media') { setMedia(msg.card, msg.media); return; }
    const c = board().cards.find(k => k.id === msg.card && k.type === 'web');
    if (msg.kind === 'zoom') {                        // Ctrl + scroll, pinch or Ctrl + plus / minus / 0 inside the site
      if (!c) return;
      const z = c.zoom || 1;
      setTextSize(c, msg.key === '0' ? 1 : msg.key === '+' ? z * 1.1 : msg.key === '-' ? z / 1.1 : z * Math.exp((+msg.by || 0) * (msg.mouse ? .0015 : .01)));
      return;
    }
    if (msg.kind === 'where') {                       // where you are on the site, for next time
      if (c && !c.forget && /^https?:/i.test(msg.url || '')) { c.last = { url: String(msg.url).slice(0, 2000), path: typeof msg.path === 'string' ? msg.path.slice(0, 200) : '', x: Math.max(0, +msg.x || 0), y: Math.max(0, +msg.y || 0) }; saveQuiet(); }
      return;
    }
    if (msg.kind === 'ok' && c && !c.forget && /^https?:/i.test(msg.url || '')) {
      if (c.last && c.last.url === msg.url) { if (c.last.x || c.last.y) reply({ restore: { path: c.last.path || '', x: c.last.x, y: c.last.y } }); }
      else if (c.last || msg.url !== c.url) { c.last = { url: String(msg.url).slice(0, 2000), path: '', x: 0, y: 0 }; saveQuiet(); }   // you went to another page in it
    }
    frameWatch.get(msg.card)?.(msg);
  });
  $('#export-md').addEventListener('click', () => exportNotes(null));
  $('#undo-update').addEventListener('click', undoUpdate);
  document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.add === 'media') pickMedia();
    else if (b.dataset.add === 'apps') {
      const r = b.getBoundingClientRect();
      openMenu(r.left, r.top - 8 - 92, [
        { label: 'App launcher', icon: 'apps', action: () => addCard('apps') },
        { label: 'Workspace (apps placed on the screen)', icon: 'space', action: () => addCard('space') },
      ]);
    }
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
    if (e.dataTransfer.types.includes(FILES_DND)) {                // from a file browser: the board takes it unless a card that takes files is under it
      if (e.target.closest?.(FILE_TAKERS)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      return;
    }
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

  setupFinder();
  window.HomeboardMusic?.subscribe(st => {            // "colours follow the music"
    const big = st && st.art ? window.HomeboardMusic.big(st.art, 600) : '';
    if (big !== coverArt) { coverArt = big; if (/^cover/.test(shown().scene)) applySettings(); }
    if (!st || !st.art) { if (musicTint) { musicTint = null; applySettings(); } return; }
    window.HomeboardMusic.palette(st.art).then(p => { coverPalette = p; const next = p && p.vivid; if (next !== musicTint) { musicTint = next; const sh = shown(); if (sh.musicAccent || sh.glassTint === 'cover' || sh.scene === 'cover') applySettings(); } });
  });
  nowPlaying.setup();
  fx.refresh();
  $('#search').addEventListener('submit', e => {
    e.preventDefault();
    if (finderPick()) return;                           // a Homeboard result was chosen
    const q = searchInput.value.trim();
    if (!q) return;
    if (/^[>/]/.test(q)) {                              // a command, never a web search
      const cq = fold(q.slice(1).trim()), c = commandOrder(cq)[0];
      searchInput.value = ''; searchInput.blur(); finder.box.hidden = true;
      if (c) c.run(); else toast('No command matches “' + q.slice(1).trim() + '”.');
      return;
    }
    const looksLikeAddress = /^https?:\/\//i.test(q) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(q);
    if (!navigator.onLine) { toast('You are offline, so a web search cannot open right now. Everything on the board still works.'); return; }
    location.href = (looksLikeAddress && normalizeUrl(q)) || (ENGINES[state.settings.engine] || ENGINES.bing) + encodeURIComponent(q);
  });

  // settings panel
  $('#settings-btn').addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) syncSettingsUI(); });
  $('#settings-close').addEventListener('click', () => { panel.hidden = true; });
  $('#css-edit').addEventListener('click', () => styleBoard());
  $('#open-np').addEventListener('click', () => { panel.hidden = true; setTimeout(() => nowPlaying.open(), 0); });
  $('#look-save').addEventListener('click', () => {
    const l = { id: uid(), name: `My style ${state.looks.length + 1}`, s: structuredClone(pickLook(shown())) };
    state.looks.push(l);
    renderLooks(); save();
    const name = $(`#looks [data-look="${CSS.escape(l.id)}"] .look-name`);
    if (name) editInline(name, v => { if (v) { l.name = v.slice(0, 30); save(); } renderLooks(); });
  });
  // right-click the Customize button: change look without opening the panel
  $('#settings-btn').addEventListener('contextmenu', e => {
    e.preventDefault();
    openMenu(e.clientX - 180, e.clientY + 8, state.looks.length
      ? [{ info: 'Wear one of your styles' }, ...state.looks.map(l => ({ label: l.name, icon: 'layers', action: () => wearLook(l) }))]
      : [{ info: 'No styles of your own yet. Open Customize and choose “Save what you see as a style”.' }]);
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
    if (e.target.closest?.('.xterm')) return;          // a console card: every key is the program's
    if (e.key === 'Escape') {
      if (ambient.on) { ambient.toggle(false); return; }
      if (!menu.hidden) closeMenu();
      else if (closePeek()) { /* closed the preview */ }
      else if (expanded && !isEditable(e.target)) collapseCard();
      else if (!panel.hidden) panel.hidden = true;
      else { document.activeElement?.blur?.(); select(null); }
      return;
    }
    const t = e.target;
    if (isEditable(t) || e.altKey) return;
    if (e.ctrlKey || e.metaKey) {
      const c = selected && board().cards.find(k => k.id === selected), k = e.key.toLowerCase();
      if (c && k === 'd') { e.preventDefault(); if (picked.size > 1) duplicateCards(pickedCards()); else duplicateCard(c); }
      else if (k === 'a' && !e.shiftKey) { e.preventDefault(); world.querySelectorAll(':scope > .card').forEach(n => n.classList.add('selected')); picked.clear(); for (const k2 of board().cards) picked.add(k2.id); selected = board().cards.at(-1)?.id || null; groupHint(); }
      else if (c && ZOOMABLE.has(c.type) && ['=', '+', '-', '_', '0'].includes(e.key)) {   // the selected card's zoom, not the whole page's
        e.preventDefault();
        const z = c.zoom || 1, step = c.type === 'web' ? 1.1 : 1.15;
        if (e.key === '0') { delete c.grow; setTextSize(c, 1); } else setTextSize(c, e.key === '-' || e.key === '_' ? z / step : z * step);
      }
      else if (/^Arrow/.test(e.key) && stepMap(e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0)) e.preventDefault();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); stepView(e.key === 'ArrowRight' ? 1 : -1, false); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); stepView(e.key === 'ArrowDown' ? 1 : -1, true); }
      else if (k === 'm') { e.preventDefault(); viewMapOpen(); }
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoStep(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redoStep(); }
      return;
    }
    if (e.key === 'Delete' && selected) {
      if (picked.size > 1) removeCards(pickedCards());
      else { const c = board().cards.find(k => k.id === selected); if (c) removeCard(c); }
    } else if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); goHome(); }
    else if ((e.key === 'f' || e.key === 'F') && selected) { const c = board().cards.find(k => k.id === selected); if (c) { e.preventDefault(); toggleExpand(c); } }
    else if (/^Arrow/.test(e.key) && !selected) {
      e.preventDefault();
      const d = e.shiftKey ? 400 : 120;
      ease.pan(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0);
    }
    else if ((e.key === '+' || e.key === '=') && !e.ctrlKey) { e.preventDefault(); zoomStep(1); }
    else if (e.key === '-' && !e.ctrlKey) { e.preventDefault(); zoomStep(-1); }
    else if (/^Digit[1-9]$/.test(e.code) && !e.shiftKey) { const p = board().views[+e.code.slice(5) - 1]; if (p) { e.preventDefault(); goToStop({ b: board(), p }); } }
    else if (e.key === 'Tab' && !e.shiftKey && (!document.activeElement || document.activeElement === document.body)) { e.preventDefault(); boardKeys(); }
  });

  // persistence across tabs and page lifetime
  store.onExternal(next => {
    if (!next || next.writer === WRITER) return;
    if (document.hidden) stale = true; else adopt(next);
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { flushViews(); flush(); return; }
    if (stale) { stale = false; adopt(await store.load()); }
  });
  addEventListener('pagehide', () => { flushViews(); flush(); dropUnblock(); });
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
  try { await pics.persist(); await api.storage.local.set({ [SNAP_KEY]: { from: raw.seenVersion, to: version, at: Date.now(), data: pics.pack(raw) } }); } catch { /* storage full: the file copy below still helps */ }
  try {
    if (await Promise.race([helper.ready(true), new Promise(r => setTimeout(() => r(false), 1500))])) {
      await helper.call('/backup', { data: JSON.stringify(raw), tag: 'before-' + version });
    }
  } catch { /* no helper: the browser copy is enough */ }
}
async function undoUpdate() {
  const snap = hasExtStorage && (await api.storage.local.get(SNAP_KEY))[SNAP_KEY];
  const back = snap && normalize(await pics.inflate(structuredClone(snap.data)));
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
  undo.now = snapshot();                             // where undo starts
  applySettings();
  await Promise.race([setupUnblock(), new Promise(r => setTimeout(r, 1200))]);
  if (api?.extension?.isAllowedFileSchemeAccess) {
    try { fileAccess = !!(await api.extension.isAllowedFileSchemeAccess()); } catch { /* stays false */ }
  }
  setTimeout(autoBackup, 15000);
  setTimeout(() => { pics.pack(state); mediaStore.sweep(new Set([...mediaIds(), ...pics.ids(), clip?.card?.mediaId].filter(Boolean))); }, 10000);
  wire();
  syncSettingsUI();
  renderTabs();
  renderBoard();
}
init();

