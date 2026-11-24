/* Custom components: cards whose look and behaviour you write yourself (HTML, CSS and JavaScript), or have an AI
   write for you. Each runs in component.html, a sandboxed page with no access to the extension, your boards or your
   files; the board sends it the time, the theme, the music and the sound levels, and it can save its own settings.
   A component lives in the board (written in the editor here) or as a file in the Homeboard folder's components/
   (listed in components/index.json), which is reloaded the moment the file changes. See docs/COMPONENTS.md. */
(() => {
'use strict';

const REG = window.HomeboardWidgets = window.HomeboardWidgets || {};
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const row = (...kids) => { const r = el('div', 'btn-row'); r.append(...kids); return r; };
const btn = (text, cls, fn) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; };
const MAX_CODE = 400000, MAX_SETTINGS = 50000;

/* the components that come as files (components/index.json), read once per page and again when asked */
let listing = null;
async function fileComponents(fresh) {
  if (listing && !fresh) return listing;
  try {
    const r = await fetch('components/index.json', { cache: 'no-store' });
    const j = r.ok ? await r.json() : [];
    listing = (Array.isArray(j) ? j : j.components || []).filter(x => x && typeof x.id === 'string' && /^[\w-]{1,60}$/.test(x.id));
  } catch { listing = []; }
  return listing;
}
const fileOf = id => `components/${id}/index.html`;
async function readFile(id) {
  const r = await fetch(fileOf(id), { cache: 'no-store' });
  if (!r.ok) throw new Error(`components/${id}/index.html was not found`);
  return (await r.text()).slice(0, MAX_CODE);
}

/* the board's look, as the component sees it */
function theme() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue('--' + n).trim();
  return { accent: v('accent'), text: v('text'), muted: v('muted'), surface: v('surface'), raise: v('raise'), bg: v('bg'), border: v('border'),
    radius: v('radius'), font: v('font'), scheme: cs.colorScheme || 'dark' };
}

/* what plays, with the cover's colours (from the music hub, when there is one) */
function musicNow(pal) {
  const s = window.HomeboardMusic && window.HomeboardMusic.state();
  if (!s) return null;
  return { title: s.title, artist: s.artist, album: s.album, art: s.art, playing: !!s.playing, time: s.time, duration: s.duration, volume: s.volume, colors: pal || null };
}

/* ---------- the card ---------- */
function custom(host, saved, onChange) {
  const st = { source: '', id: '', name: '', code: '', settings: {} };
  if (saved && typeof saved === 'object') {
    if (saved.source === 'file' || saved.source === 'board') st.source = saved.source;
    if (typeof saved.id === 'string' && /^[\w-]{1,60}$/.test(saved.id)) st.id = saved.id;
    if (typeof saved.name === 'string') st.name = saved.name.slice(0, 80);
    if (typeof saved.code === 'string') st.code = saved.code.slice(0, MAX_CODE);
    if (saved.settings && typeof saved.settings === 'object') st.settings = saved.settings;
  }
  const keep = () => { try { onChange({ ...st }); } catch { /* host gone */ } };
  const root = el('div', 'cc');
  host.append(root);
  let frame = null, code = '', wants = new Set(), lastError = '', pal = null, unMusic = null, raf = 0, wait = 0, poll = 0, editor = null;
  const card = () => root.closest('.card');
  const post = msg => { try { frame && frame.contentWindow && frame.contentWindow.postMessage(msg, '*'); } catch { /* reloading */ } };

  /* the picker a new card shows */
  async function picker() {
    stopFeeds();
    frame = null;
    root.replaceChildren();
    const box = el('div', 'cc-pick');
    box.append(el('b', null, 'Custom component'), el('p', null, 'A card you design: pick one, write your own, or describe it to an AI.'));
    const list = el('div', 'cc-list');
    const items = await fileComponents(true);
    for (const it of items) {
      const b = el('button', 'cc-item'); b.type = 'button';
      b.append(el('b', null, it.name || it.id), el('span', null, it.description || 'components/' + it.id));
      b.addEventListener('click', () => { Object.assign(st, { source: 'file', id: it.id, name: it.name || it.id, code: '' }); keep(); start(); });
      list.append(b);
    }
    if (!items.length) list.append(el('p', 'cc-none', 'No components in the components folder yet.'));
    box.append(list, row(
      btn('Write my own…', 'primary', () => { Object.assign(st, { source: 'board', id: '', name: 'My component', code: STARTER }); keep(); start(); openEditor(); }),
      btn('Design with AI…', '', () => aiBrief())));
    root.append(box);
  }

  /* the component itself */
  async function start() {
    if (!st.source) { picker(); return; }
    try { code = st.source === 'file' ? await readFile(st.id) : st.code; }
    catch (e) { root.replaceChildren(el('div', 'cc-msg', String(e.message || e))); return; }
    root.replaceChildren();
    frame = el('iframe', 'cc-frame');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('title', st.name || 'Custom component');
    frame.src = 'component.html';
    const shield = el('div', 'cc-shield'), grip = el('div', 'cc-grip');
    shield.title = 'Drag to move · right-click for options';
    // a click (not a drag) on the cover selects the card and is passed on to the component, so one click is enough
    let downAt = null;
    shield.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; });
    shield.addEventListener('click', e => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
      const r = frame.getBoundingClientRect(), k = r.width / (frame.offsetWidth || r.width || 1);   // the board's zoom
      post({ hb: 'click', x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k });
      root.classList.add('live');                       // from now on the component gets the mouse directly
    });
    // when the card is no longer selected, the cover comes back (so the card can be dragged and right-clicked again)
    const c0 = card();
    if (c0 && !c0.__ccWatch) {
      c0.__ccWatch = new MutationObserver(() => { if (!c0.classList.contains('selected')) root.classList.remove('live'); });
      c0.__ccWatch.observe(c0, { attributes: true, attributeFilter: ['class'] });
    }
    grip.title = 'Drag to move';
    root.append(frame, shield, grip);
    if (st.source === 'file') watchFile();
  }
  let rendered = false, loads = 0;
  function init() {                                    // new code on a page that already shows a component: a fresh page
    if (rendered && frame) { rendered = false; stopFeeds(); frame.src = 'component.html?v=' + (++loads); return; }
    wants = new Set();
    post({ hb: 'init', code, theme: theme(), settings: st.settings, music: musicNow(pal) });
  }

  /* messages from the component (only from its own frame) */
  const onMessage = e => {
    if (!frame || e.source !== frame.contentWindow) return;
    if (!root.isConnected) { quit(); return; }
    const m = e.data || {};
    if (m.hb === 'ready') { rendered = false; init(); }
    else if (m.hb === 'want' && (m.what === 'levels' || m.what === 'music')) { wants.add(m.what); feeds(); }
    else if (m.hb === 'save' && m.settings && typeof m.settings === 'object') {
      try { if (JSON.stringify(m.settings).length <= MAX_SETTINGS) { st.settings = JSON.parse(JSON.stringify(m.settings)); keep(); } } catch { /* not plain data */ }
    } else if (m.hb === 'open' && /^https?:\/\//i.test(String(m.url || ''))) window.open(String(m.url), '_blank', 'noopener');
    else if (m.hb === 'control' && ['toggle', 'next', 'previous', 'play', 'pause'].includes(m.action) && window.HomeboardMusic) window.HomeboardMusic.send(m.action === 'play' || m.action === 'pause' ? 'toggle' : m.action);
    else if (m.hb === 'error') { lastError = String(m.message || ''); if (editor) editor.error(lastError); }
    else if (m.hb === 'rendered') { rendered = true; lastError = ''; if (editor) editor.error(''); }
  };
  addEventListener('message', onMessage);

  /* live feeds, only what the component asked for */
  function feeds() {
    if (wants.has('music') && !unMusic && window.HomeboardMusic) {
      unMusic = window.HomeboardMusic.subscribe(s => {
        if (!root.isConnected) return;
        if (s && s.art) window.HomeboardMusic.palette(s.art).then(p => { pal = p; post({ hb: 'music', music: musicNow(pal) }); });
        post({ hb: 'music', music: musicNow(pal) });
      });
    }
    if (wants.has('levels') && !wait && !raf && window.HomeboardAudio && window.HomeboardAudio.available) { window.HomeboardAudio.start(); look(); }
  }
  let sent = 0;
  function look() {                                     // nothing heard: check again soon, without sending anything
    wait = 0;
    if (!root.isConnected) { quit(); return; }
    const now = window.HomeboardAudio.now(), c = card();
    if (now && !document.hidden && !(c && c.classList.contains('offscreen'))) raf = requestAnimationFrame(stream);
    else { post({ hb: 'levels', levels: null }); wait = setTimeout(look, 250); }
  }
  function stream(t) {
    raf = 0;
    const now = window.HomeboardAudio.now();
    if (!now || !root.isConnected) { look(); return; }
    if (t - sent >= 30) { sent = t; post({ hb: 'levels', levels: Array.from(now.bands) }); }   // about 30 a second
    raf = requestAnimationFrame(stream);
  }
  function stopFeeds() {
    if (unMusic) { unMusic(); unMusic = null; }
    if (raf || wait) { cancelAnimationFrame(raf); clearTimeout(wait); raf = wait = 0; window.HomeboardAudio && window.HomeboardAudio.stop(); }
  }

  /* the theme follows the board */
  let lastTheme = '';
  const themeTimer = setInterval(() => {
    if (!root.isConnected) { if (shownOnce) quit(); return; }
    shownOnce = true;
    const t = theme(), k = JSON.stringify(t);
    if (k !== lastTheme) { lastTheme = k; post({ hb: 'theme', theme: t }); }
  }, 2000);
  let shownOnce = false;

  /* a file component reloads when its file changes (only while it is on screen and the page is visible) */
  function watchFile() {
    clearInterval(poll);
    poll = setInterval(async () => {
      const c = card();
      if (!root.isConnected) { if (shownOnce) quit(); return; }
      if (document.hidden || (c && c.classList.contains('offscreen'))) return;
      try { const next = await readFile(st.id); if (next !== code) { code = next; init(); } } catch { /* removed for now */ }
    }, 1500);
  }
  function quit() { stopFeeds(); clearInterval(poll); clearInterval(themeTimer); removeEventListener('message', onMessage); }

  /* ---------- the editor: code on the left, the card itself updates as you type ---------- */
  function openEditor() {
    if (editor) return;
    const wrap = el('div', 'cc-editor'), panel = el('div', 'cc-editor-panel');
    const head = el('div', 'cc-editor-head'), name = el('input', 'field');
    name.value = st.name || ''; name.placeholder = 'Name';
    const area = el('textarea', 'cc-code');
    area.spellcheck = false; area.value = st.source === 'file' ? code : st.code;
    area.readOnly = st.source === 'file';
    const err = el('div', 'cc-err');
    const note = el('p', 'cc-editor-note', st.source === 'file'
      ? `This component is the file components/${st.id}/index.html. Change it there (or ask an AI to): this card reloads when the file changes.`
      : 'HTML, CSS and JavaScript in one piece. The card updates as you type. The homeboard object gives you the time, the theme, the music and the sound (see docs/COMPONENTS.md).');
    let timer = 0;
    area.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.code = area.value.slice(0, MAX_CODE); code = st.code; init(); }, 450); });
    area.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); const a = area.selectionStart; area.setRangeText('  ', a, area.selectionEnd, 'end'); area.dispatchEvent(new Event('input')); }
      e.stopPropagation();                                // the board's shortcuts stay out of the editor
    });
    const close = save => {
      clearTimeout(timer);
      if (save && st.source === 'board') { st.code = area.value.slice(0, MAX_CODE); st.name = name.value.trim().slice(0, 80) || 'My component'; code = st.code; keep(); init(); }
      wrap.remove(); editor = null; document.removeEventListener('keydown', esc, true);
    };
    const esc = e => { if (e.key === 'Escape' && wrap.isConnected) { e.preventDefault(); e.stopPropagation(); close(true); } };
    document.addEventListener('keydown', esc, true);
    head.append(el('b', null, 'Edit component'), name);
    panel.append(head, note, area, err, row(
      btn('Design with AI…', '', () => aiBrief(area.value)),
      st.source === 'file' ? btn('Copy into the board (edit here)', '', () => { Object.assign(st, { source: 'board', code: area.value }); keep(); close(false); start(); openEditor(); }) : el('span'),
      btn('Done', 'primary', () => close(true))));
    wrap.append(panel);
    document.body.append(wrap);
    area.focus();
    editor = { error(t) { err.textContent = t ? 'Error: ' + t : ''; err.hidden = !t; } };
    editor.error(lastError);
  }

  /* ---------- Design with AI: a complete brief to copy into Claude Code (or any assistant) ---------- */
  async function aiBrief(current) {
    const change = el('label', 'row cc-change'), changeBox = el('input');
    changeBox.type = 'checkbox';
    change.append(el('span', null, 'Change this component (its current code goes in the brief)'), changeBox);
    change.hidden = !(current && current.trim());
    const wrap = el('div', 'cc-editor'), panel = el('div', 'cc-editor-panel');
    const want = el('textarea', 'cc-want'); want.placeholder = 'Describe it: what it shows, how it looks, how it moves. For example: “a clock that looks like a pixel-art sky: the sun and the moon cross it with the real time, the colours change at dawn and dusk”.';
    const where = el('select', 'field');
    where.append(new Option('As a file in the Homeboard folder (for an AI coding app such as Claude Code)', 'file'), new Option('As code to paste into this card', 'paste'));
    const out = el('textarea', 'cc-code'); out.readOnly = true; out.placeholder = 'The brief appears here.';
    const guide = await fetch('docs/COMPONENTS.md', { cache: 'no-store' }).then(r => (r.ok ? r.text() : ''), () => '');
    const api = (guide.split('<!-- for-ai -->')[1] || guide).slice(0, 9000);
    const make = () => {
      const id = (want.value.toLowerCase().match(/[a-z0-9]+/g) || ['my', 'component']).slice(0, 4).join('-').slice(0, 40);
      out.value = [
        'I use Homeboard, a new-tab board extension for Edge. Please make me a custom component for it.',
        '', 'What I want:', want.value.trim() || '(describe it here)', '',
        where.value === 'file'
          ? `Write it as one file: components/${id}/index.html in the Homeboard folder (this folder). Then add {"id": "${id}", "name": "<a short name>", "description": "<one line>", "w": <width>, "h": <height>} to the list in components/index.json (create the file as [ ... ] if it is missing). Homeboard shows it under Widgets → Custom component, and reloads it when the file changes.`
          : 'Reply with the whole component as one piece of HTML (with its <style> and <script>), ready to paste into the card\'s editor.',
        changeBox.checked && current && current.trim() ? '\nChange this current version (keep what works, change what I describe):\n```html\n' + current.slice(0, 20000) + '\n```' : '',
        '', 'How Homeboard components work:', api.trim(),
      ].join('\n');
    };
    want.addEventListener('input', make); where.addEventListener('change', make); changeBox.addEventListener('change', make);
    want.addEventListener('keydown', e => e.stopPropagation());
    const close = () => wrap.remove();
    panel.append(el('b', null, 'Design with AI'),
      el('p', 'cc-editor-note', 'Homeboard has no AI inside and sends nothing anywhere. It writes a complete brief: copy it into Claude Code (opened in your Homeboard folder) or any AI assistant, and it builds the component for you.'),
      want, where, change, out, row(
        btn('Copy the brief', 'primary', async () => { make(); try { await navigator.clipboard.writeText(out.value); } catch { out.select(); document.execCommand('copy'); } }),
        btn('Close', '', close)));
    wrap.append(panel);
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    document.body.append(wrap);
    make(); want.focus();
  }

  start();
  return {
    grab: e => !e.target.closest('.cc-pick button, .cc-pick input, .cc-frame'),
    menu: () => [
      { info: st.source ? (st.name || 'Custom component') + (st.source === 'file' ? ` · components/${st.id}` : ' · in this board') : 'Pick a component.' },
      st.source && { label: 'Edit…', icon: 'edit', action: openEditor },
      { label: 'Design with AI…', icon: 'widget', action: () => aiBrief(st.source ? code : '') },
      st.source && { label: 'Reload it', icon: 'refresh', action: () => { stopFeeds(); start(); } },
      { label: 'Choose another…', icon: 'layers', action: () => { Object.assign(st, { source: '', id: '', name: '', code: '' }); keep(); picker(); } },
    ],
  };
}

const STARTER = `<style>
  body { display: grid; place-items: center; }
  .big { font-size: min(30vw, 50vh); font-weight: 200; color: var(--accent); }
</style>
<div class="big" id="t"></div>
<script>
  // homeboard.on('time') runs every second; see docs/COMPONENTS.md for the music, the sound and saving settings
  homeboard.on('time', now => {
    document.getElementById('t').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
</script>
`;

REG.custom = { label: 'Custom component', menu: 'Custom component (your own)', w: 280, h: 220, bare: true, create: custom };
})();
