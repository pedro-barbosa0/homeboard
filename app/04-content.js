/* Homeboard · Notes, Markdown export, to-do lists, quick links, peek, the finder.
   Part 5 of 9 of the board page: classic scripts that share one scope, loaded in order by index.html
   (app/00-core.js … app/08-main.js). See docs/ARCHITECTURE.md. */
'use strict';

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

/* ---- peek: a link shown big over the board without leaving it (like Arc's Peek or Quick Look).
   One click on a link tile peeks, two clicks open it for real. Esc, a click beside it, or ✕ closes it. ---- */
const WEB_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation allow-pointer-lock allow-orientation-lock allow-storage-access-by-user-activation';
const WEB_ALLOW = 'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-read; clipboard-write; camera; microphone; display-capture; geolocation; web-share; storage-access; screen-wake-lock';
let peekEl = null;
function closePeek() {
  if (!peekEl) return false;
  const el = peekEl;
  peekEl = null;
  frameWatch.delete('peek');
  el.classList.remove('open');
  setTimeout(() => el.remove(), 160);
  return true;
}
function peek(url, title, open) {
  closePeek();
  if (isLocal(url) && !fileAccess) { toast(localHint()); return; }
  let pdf = false;
  try { pdf = /\.pdf$/i.test(new URL(url).pathname); } catch { /* not a URL */ }
  const trusted = isLocal(url) || pdf;
  const frame = h('div', { class: 'peek-frame' }, h('iframe', {
    src: embedUrl(url), name: 'hb:peek', title: title || titleOf(url), sandbox: !trusted && WEB_SANDBOX, allow: WEB_ALLOW, referrerpolicy: 'strict-origin-when-cross-origin',
  }));
  const go = () => { closePeek(); open(); };
  const panel = h('div', { class: 'peek-panel', role: 'dialog', 'aria-label': 'Preview of ' + (title || titleOf(url)) },
    h('div', { class: 'peek-head' },
      h('div', { class: 'peek-name' }, h('b', null, title || titleOf(url)), h('span', null, addressLabel(url))),
      h('button', { class: 'btn primary', type: 'button', title: 'Open it (or double-click the link)', onclick: go }, isLocal(url) ? 'Open' : 'Open here'),
      !isLocal(url) && h('button', { class: 'btn', type: 'button', title: 'Open it in a new tab', onclick() { closePeek(); window.open(url, '_blank', 'noopener'); } }, 'New tab'),
      !isLocal(url) && h('button', { class: 'btn', type: 'button', title: 'Open it in a real Edge window over the board', async onclick() { const r = frame; await openBeside(url, r); closePeek(); } }, 'Own window'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', onclick: closePeek }, icon('x'))),
    frame);
  peekEl = h('div', { class: 'peek' }, panel);
  peekEl.addEventListener('pointerdown', e => { if (e.target === peekEl) closePeek(); });
  document.body.append(peekEl);
  requestAnimationFrame(() => peekEl?.classList.add('open'));
  if (trusted || !api?.runtime?.id) return;
  // the site says from inside whether it showed (frame.js); a silent one offers the real thing
  let heard = false;
  const note = (text, ...buttons) => { frame.querySelector('.web-notice')?.remove(); frame.append(h('div', { class: 'web-notice', role: 'status' }, h('span', null, text), ...buttons)); };
  frameWatch.set('peek', msg => {
    heard = true;
    if (msg.kind === 'signin') note('This site wants you to sign in, which it only allows in a real window.', h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Open here'));
    else frame.querySelector('.web-notice')?.remove();
  });
  const me = peekEl;
  setTimeout(() => { if (!heard && peekEl === me && navigator.onLine) note('Not showing? Some sites refuse to be shown inside other pages.', h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Open here'), h('button', { class: 'btn', type: 'button', onclick() { closePeek(); window.open(url, '_blank', 'noopener'); } }, 'New tab')); }, 9000);
}

/* ---- the finder: typing in the search box also lists what matches on Homeboard (boards, views, cards and
   what is in them, links, apps), like a command palette (VS Code, Raycast, Spotlight). The first row stays
   "search the web", so Enter works as before; ↓ / ↑ pick a result, Enter or a click goes there. Ctrl+K opens it. ---- */
const fold = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const plain = html => String(html || '').replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
let finderCache = null;                               // built once, thrown away whenever the boards change (save, another tab)
function finderIndex() { return finderCache || (finderCache = buildFinderIndex()); }
function buildFinderIndex() {
  const out = [];
  const path = b => { const parts = []; for (let p = boardById(b.parent), n = 0; p && n < 20; p = boardById(p.parent), n++) parts.unshift(p.name); return parts.concat(b.name).join(' › '); };
  for (const b of state.boards) {
    const where = path(b);
    out.push({ kind: 'board', icon: 'home', label: b.name, sub: b.parent ? where : 'Board', text: '', go: () => followBoardLink(`homeboard:board/${b.id}`), chip: b.icon || initials(b.name) });
    for (const p of b.views || []) out.push({ kind: 'view', icon: 'views', label: p.name, sub: 'View on ' + where, text: '', go: () => followBoardLink(`homeboard:board/${b.id}/view/${p.id}`) });
    for (const c of b.cards) {
      const go = () => followBoardLink(`homeboard:board/${b.id}/card/${c.id}`);
      let text = '';
      if (c.type === 'note' && !c.lock) text = c.markdown ? c.md : plain(c.html);
      else if (c.type === 'todo') text = c.items.map(i => [i.text, ...i.steps.map(x => x.text), i.note].join('\n')).join('\n');
      else if (c.type === 'web') text = addressLabel(c.url);
      else if (c.type === 'files') text = addressLabel(c.path);
      else if (c.type === 'term') text = c.cwd;
      else if (c.type === 'space') text = (c.items || []).map(i => i.name).join(' · ');
      out.push({ kind: c.type, icon: c.type === 'widget' ? 'widget' : c.type, label: c.title, sub: where, text, go });
      if (c.type === 'links') for (const l of c.links) {
        const name = l.title || (BOARD_LINK.test(l.url) ? boardLinkName(l.url) : titleOf(l.url));
        out.push({ kind: 'link', icon: 'links', label: name, sub: `${addressLabel(l.url)} · ${c.title}, ${b.name}`, text: l.url,
          go: () => (BOARD_LINK.test(l.url) ? followBoardLink(l.url) : isLocal(l.url) ? openLink(l) : peek(l.url, name, () => { location.href = l.url; })) });
      }
      if (c.type === 'apps') for (const it of c.apps || []) out.push({ kind: 'app', icon: 'apps', label: it.name, sub: `App · ${c.title}, ${b.name}`, text: '', go });
    }
  }
  return out;
}
/* How well a query fits: whole words at the start of the name first, then inside it, then in the text; every word must be found. */
function finderScore(q, it) {
  const words = fold(q).split(/\s+/).filter(Boolean), name = fold(it.label), body = fold(it.text) + ' ' + fold(it.sub);
  let score = 0;
  for (const w of words) {
    const i = name.indexOf(w);
    if (i === 0) score += 100; else if (i > 0) score += /[\s\-_.›]/.test(name[i - 1]) ? 80 : 55;
    else if (body.includes(w)) score += 25;
    else return 0;
  }
  if (name === fold(q)) score += 60;
  return score + (it.kind === 'board' ? 8 : it.kind === 'view' ? 6 : 0) - Math.min(20, name.length / 8);
}
function snippet(text, q) {                             // the words around the first match in the text
  const t = String(text || '').replace(/\s+/g, ' '), f = fold(t), w = fold(q).split(/\s+/).filter(Boolean)[0] || '';
  const i = w ? f.indexOf(w) : -1;
  if (i < 0) return '';
  const a = Math.max(0, i - 36), b = Math.min(t.length, i + w.length + 60);
  return (a ? '…' : '') + t.slice(a, b) + (b < t.length ? '…' : '');
}
function marked(text, q) {                              // the text with the query's words highlighted
  const words = fold(q).split(/\s+/).filter(w => w.length > 0);
  const f = fold(text), hits = [];
  for (const w of words) { let i = f.indexOf(w); while (i >= 0 && hits.length < 20) { hits.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } }
  hits.sort((x, y) => x[0] - y[0]);
  const frag = document.createDocumentFragment();
  let at = 0;
  for (const [a, b] of hits) { if (a < at) continue; frag.append(text.slice(at, a), h('mark', null, text.slice(a, b))); at = b; }
  frag.append(text.slice(at));
  return frag;
}
let finder = null;                                      // { box, rows, pick }
function setupFinder() {
  const box = h('div', { id: 'finder', role: 'listbox', hidden: true });
  $('#search').append(box);
  searchInput.setAttribute('placeholder', 'Search Homeboard and the web  ·  > for commands');
  searchInput.setAttribute('aria-label', 'Search Homeboard and the web');
  finder = { box, rows: [], pick: 0 };
  let timer = 0;
  const draw = () => {
    const q = searchInput.value.trim();
    if (!q || document.activeElement !== searchInput) { box.hidden = true; finder.rows = []; return; }
    finder.cmd = /^[>\/]/.test(q);
    if (finder.cmd) {                                   // ">": commands only, the first one ready for Enter
      const cq = fold(q.slice(1).trim());
      finder.rows = commandOrder(cq).slice(0, 12).map(c => ({ kind: 'command', icon: 'chev', label: c.label, sub: '', go: c.run }));
      finder.pick = 0;
      box.replaceChildren(...finder.rows.map((it, i) => {
        const row = h('div', { class: 'finder-row' + (i === 0 ? ' on' : ''), role: 'option' }, h('span', { class: 'finder-ico' }, icon('chev')), h('div', { class: 'finder-text' }, h('div', { class: 'finder-label' }, it.label)), h('span', { class: 'finder-kind' }, 'command'));
        row.addEventListener('pointerdown', e => { e.preventDefault(); run(it); });
        row.addEventListener('pointermove', () => mark(i));
        return row;
      }));
      if (!finder.rows.length) box.append(h('div', { class: 'finder-none' }, 'No command matches.'));
      box.hidden = false;
      return;
    }
    const looksLikeAddress = /^https?:\/\//i.test(q) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(q);
    const cmds = q.length >= 3 ? commandList().map(c => ({ kind: 'command', icon: 'chev', label: c.label, sub: 'Command', text: c.words, go: c.run })) : [];
    const hits = [...finderIndex(), ...cmds].map(it => [finderScore(q, it), it]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([, it]) => it);
    const web = { kind: 'web', icon: looksLikeAddress ? 'external' : 'web', label: looksLikeAddress ? `Go to ${q}` : `Search the web for “${q}”`, sub: looksLikeAddress ? '' : (state.settings.engine || 'bing').replace(/^./, m => m.toUpperCase()), web: true };
    finder.rows = [web, ...hits];
    finder.pick = 0;
    box.replaceChildren(...finder.rows.map((it, i) => {
      const extra = !it.web && it.text && !fold(it.label).includes(fold(q).split(/\s+/)[0]) ? snippet(it.text, q) : '';
      const row = h('div', { class: 'finder-row' + (i === 0 ? ' on' : ''), role: 'option', 'aria-selected': String(i === 0) },
        it.chip ? h('span', { class: 'finder-chip' }, it.chip) : h('span', { class: 'finder-ico' }, icon(it.icon)),
        h('div', { class: 'finder-text' }, h('div', { class: 'finder-label' }, it.web ? it.label : marked(it.label, q)),
          (extra || it.sub) && h('div', { class: 'finder-sub' }, extra ? marked(extra, q) : it.sub)),
        !it.web && i > 0 && h('span', { class: 'finder-kind' }, { command: 'command', board: 'board', view: 'view', link: 'link', app: 'app', note: 'note', todo: 'to-do', web: 'website', files: 'files', term: 'console', media: 'media', widget: 'widget', apps: 'apps', space: 'workspace' }[it.kind] || ''));
      row.addEventListener('pointerdown', e => { e.preventDefault(); finder.pick = i; if (it.web) $('#search').requestSubmit(); else run(it); });
      row.addEventListener('pointermove', () => { if (finder.pick !== i) mark(i); });
      return row;
    }));
    if (hits.length === 0) box.append(h('div', { class: 'finder-none' }, 'Nothing on Homeboard matches.'));
    box.hidden = false;
  };
  const mark = i => { finder.pick = i; [...box.querySelectorAll('.finder-row')].forEach((r, k) => { r.classList.toggle('on', k === i); r.setAttribute('aria-selected', String(k === i)); if (k === i) r.scrollIntoView({ block: 'nearest' }); }); };
  const run = it => { box.hidden = true; searchInput.value = ''; searchInput.blur(); it.go(); };
  finder.run = run;
  searchInput.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 40); });
  searchInput.addEventListener('focus', draw);
  searchInput.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== searchInput) box.hidden = true; }, 120));   // not if it came back meanwhile
  searchInput.addEventListener('keydown', e => {
    if (box.hidden || !finder.rows.length) return;
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); mark((finder.pick + 1) % finder.rows.length); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); mark((finder.pick - 1 + finder.rows.length) % finder.rows.length); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (searchInput.value) { searchInput.value = ''; draw(); } else searchInput.blur(); }
    else if (e.key === 'Enter' && (finder.pick > 0 || finder.cmd)) { e.preventDefault(); finderPick(); }
  });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.target.closest?.('.xterm')) { e.preventDefault(); searchInput.focus(); searchInput.select(); } }, true);
}
function finderPick() {                                 // Enter: the row picked with the arrows (the first row is the web search)
  if (finder && !finder.box.hidden && finder.cmd && finder.rows[finder.pick]) { finder.run(finder.rows[finder.pick]); return true; }
  if (!finder || finder.box.hidden || !finder.pick) return false;
  const it = finder.rows[finder.pick];
  if (!it || it.web) return false;
  finder.run(it);
  return true;
}

function buildLinks(c, body) {
  const grid = h('div', { class: 'links-grid' });
  let form = null;

  const tile = l => {
    const inner = BOARD_LINK.test(l.url), local = isLocal(l.url), name = l.title || (inner ? boardLinkName(l.url) : titleOf(l.url));
    const ico = h('span', { class: 'link-ico' });
    if (inner) {
      const b = boardById(BOARD_LINK.exec(l.url)[1]);
      ico.classList.add('link-board');
      ico.textContent = b ? b.icon || initials(b.name) : '?';
      if (b?.color) ico.style.setProperty('--tint', COLORS[b.color]);
    } else if (local) ico.append(icon(/[\\/]$/.test(addressLabel(l.url)) || !/\.[a-z0-9]{1,5}$/i.test(l.url) ? 'folder' : 'file'));
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
    const a = h('a', { class: 'link-tile', href: local ? '#' : l.url, title: inner ? 'Go to ' + boardLinkName(l.url) : addressLabel(l.url), draggable: 'false', rel: 'noopener' },
      ico, h('span', { class: 'link-name' }, name));
    // one click: a preview (peek); two clicks: open it. Ctrl / Shift / middle click keep the browser's own behaviour.
    const open = () => { if (local) openLink(l); else location.href = l.url; };
    let wait = 0;
    if (!inner) a.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) { if (local) e.preventDefault(); return; }
      e.preventDefault();
      clearTimeout(wait);
      if (c.direct || e.detail >= 2) { closePeek(); open(); return; }
      wait = setTimeout(() => peek(l.url, name, open), 230);
    });
    a.addEventListener('contextmenu', e => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, [
        ...(inner ? [{ label: 'Go there', icon: 'arrow', action: () => followBoardLink(l.url) }] : local ? [{ label: 'Open in File Explorer', icon: 'folder', action: () => openLink(l, 'explorer') },
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
    const place = h('select', { class: 'field', 'aria-label': 'A board or view' },
      h('option', { value: '' }, 'Or pick a board or view of Homeboard…'),
      state.boards.flatMap(b => [h('option', { value: `homeboard:board/${b.id}` }, b.name),
        ...(b.views || []).map(p => h('option', { value: `homeboard:board/${b.id}/view/${p.id}` }, `${b.name} › ${p.name}`))]));
    place.addEventListener('change', () => { if (place.value) { url.value = place.value; url.classList.remove('bad'); syncHow(); } });
    url.addEventListener('paste', () => setTimeout(() => {   // a copied board link brings its name along
      const m = /^\[([^\]]*)\]\((homeboard:[^)\s]+)\)$/.exec(url.value.trim());
      if (m) { url.value = m[2]; if (!name.value) name.value = m[1]; }
    }));
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
        const next = { url: u, title: name.value.trim() || (BOARD_LINK.test(u) ? '' : ''), how: isLocal(u) ? how.value : 'tab' };
        if (l) Object.assign(l, next); else c.links.push({ id: uid(), ...next });
        close(); draw(); save();
      },
      onkeydown(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } },
    }, url, place, name, how, h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'submit' }, l ? 'Save' : 'Add')));
    body.append(form);
    url.focus();
  };

  draw();
  body.append(grid);
}

