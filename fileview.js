/* A text or Markdown file, shown three ways: Formatted (Markdown only), Text, and Edit with Save.
   Used by the file browser on the board and by .md files opened directly in Edge (mdview.js).
   The host supplies how to read and save:
     load()  -> { text }                          what to show
     open()  -> { text, mtime, eol, bom }         the file as it is on disk, for editing (throws when it cannot)
     save(d) -> { mtime }                         writes d.text; throws { code: 'changed' } if the file changed meanwhile
   Edits are kept while switching views, until saved. */
(() => {
'use strict';
const MD = globalThis.HomeboardMd;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

function mount(host, o) {
  const isMd = !!o.isMd;
  let mode = o.mode === 'edit' ? 'edit' : isMd && o.mode !== 'text' ? 'formatted' : 'text';
  let text = '', saved = null, meta = null, busy = false;
  const dirty = () => saved != null && text !== saved;

  const root = el('div', 'hbfv' + (o.page ? ' hbfv-page' : ''));
  const bar = el('div', 'hbfv-bar'), seg = el('div', 'hbfv-seg');
  const btn = (label, title) => { const b = el('button', 'hbfv-btn', label); b.type = 'button'; b.title = title; return b; };
  const bFormatted = btn('Formatted', 'Show it formatted'), bText = btn('Text', 'Show the plain text'), bEdit = btn('Edit', 'Change the file');
  const bSave = btn('Save', 'Save the file (Ctrl+S)'), status = el('span', 'hbfv-status');
  bSave.classList.add('primary');
  if (isMd) seg.append(bFormatted);
  seg.append(bText);
  if (o.open && o.save) seg.append(bEdit);
  bar.append(seg, status, bSave);
  const view = el('div', 'hbfv-view');
  root.append(bar, view);
  host.replaceChildren(root);

  const say = (msg, kind) => { status.textContent = msg || ''; status.dataset.kind = kind || ''; };
  function paint() {
    for (const [b, m] of [[bFormatted, 'formatted'], [bText, 'text'], [bEdit, 'edit']]) { b.classList.toggle('on', mode === m); b.setAttribute('aria-pressed', String(mode === m)); }
    bSave.hidden = !(mode === 'edit' || dirty());
    bSave.disabled = !dirty() || busy;
    root.dataset.mode = mode;
    if (mode === 'formatted') {
      const md = el('div', 'md-view hbfv-md');
      md.innerHTML = MD.render(text, { base: o.base || null });
      view.replaceChildren(md);
    } else if (mode === 'text') {
      view.replaceChildren(el('pre', 'hbfv-text', text));
    } else {
      const ta = el('textarea', 'hbfv-edit');
      ta.spellcheck = isMd; ta.value = text; ta.setAttribute('aria-label', 'File text');
      ta.addEventListener('input', () => { text = ta.value; bSave.hidden = false; bSave.disabled = !dirty() || busy; say(dirty() ? 'Not saved' : ''); });
      ta.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); doSave(); }
        else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
        else if (e.key === 'Escape') { e.stopPropagation(); ta.blur(); }
      });
      view.replaceChildren(ta);
      ta.focus();
    }
    o.onMode?.(mode);
  }
  async function setMode(m) {
    if (m === 'edit' && saved == null) {             // first edit: read the file as it is on disk
      try { busy = true; say('Opening…'); const d = await o.open(); meta = d; if (!dirty()) text = d.text; saved = d.text; say(''); }
      catch (e) { busy = false; say(e.message || 'This file cannot be edited here.', 'err'); return; }
      busy = false;
    }
    mode = m; paint();
  }
  async function doSave(force) {
    if (!dirty() || busy) return;
    busy = true; bSave.disabled = true; say('Saving…');
    try {
      const r = await o.save({ text, mtime: force ? null : meta.mtime, eol: meta.eol, bom: meta.bom });
      meta.mtime = r.mtime; saved = text;
      say('Saved', 'ok'); setTimeout(() => { if (status.dataset.kind === 'ok') say(''); }, 2500);
    } catch (e) {
      busy = false;
      if (e.code === 'changed' && confirm('This file was changed somewhere else since you opened it. Save anyway and replace that version?')) return doSave(true);
      say(e.message || 'Could not save.', 'err');
    }
    busy = false; bSave.disabled = !dirty(); bSave.hidden = !(mode === 'edit' || dirty());
  }
  bFormatted.addEventListener('click', () => setMode('formatted'));
  bText.addEventListener('click', () => setMode('text'));
  bEdit.addEventListener('click', () => setMode('edit'));
  bSave.addEventListener('click', () => doSave());
  view.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (a && o.onLink && o.onLink(a.href, e) === true) e.preventDefault();
  });

  (async () => {
    try { text = (await o.load()).text || ''; } catch { text = ''; say('This file could not be read.', 'err'); }
    if (mode === 'edit') setMode('edit'); else paint();
  })();
  return { dirty, get mode() { return mode; }, setMode };
}

window.HomeboardFileView = { mount };
})();
