/* Homeboard · Website windows, media cards, widgets.
   Part 7 of 9 of the board page: classic scripts that share one scope, loaded in order by index.html
   (app/00-core.js … app/08-main.js). See docs/ARCHITECTURE.md. */
'use strict';

/* ---- website window ---- */
const whenOnline = new Set();                        // website windows waiting for the connection to return
const EMBED_HINT = 'If this window stays blank, the site refuses to be shown inside other pages. The window button opens it in its own window beside the board. (The installed Homeboard shows most of these sites right here.)';
/* Scroll bars of the site itself (noscroll.js does it inside the frame); frameless windows hide them unless told not to. */
const hidesBars = c => (typeof c.noScroll === 'boolean' ? c.noScroll : !!c.plain);
/* A site that will not sit inside the board: give it a real browser window, placed where the card is.
   A real window always works (sign-ins, mail, video), because the site is not inside another page. */
/* Where an element of the board is on the screen, as a window box (kept on the screen, or Edge refuses it). */
function screenBox(el, small) {
  const r = el.getBoundingClientRect(), chromeTop = Math.max(0, outerHeight - innerHeight), side = Math.max(0, (outerWidth - innerWidth) / 2);
  const box = { left: Math.round(screenX + side + r.left), top: Math.round(screenY + chromeTop + r.top), width: Math.max(small ? 200 : 420, Math.round(r.width)), height: Math.max(small ? 120 : 320, Math.round(r.height)) };
  const sx = screen.availLeft || 0, sy = screen.availTop || 0, sw = screen.availWidth || 1280, sh = screen.availHeight || 800;
  box.width = Math.min(box.width, sw); box.height = Math.min(box.height, sh);
  box.left = clamp(box.left, sx, sx + sw - box.width); box.top = clamp(box.top, sy, sy + sh - box.height);
  return box;
}
async function openBeside(url, el) {
  if (!url) return null;
  const box = screenBox(el);
  if (api?.windows?.create) {
    for (const where of [box, { width: box.width, height: box.height }]) {
      try { return (await api.windows.create({ url, type: 'popup', ...where })).id; } catch { /* try the next placement */ }
    }
    openExternal(url);
    return null;
  }
  if (!window.open(url, 'hb-' + hostOf(url), `popup,left=${box.left},top=${box.top},width=${box.width},height=${box.height}`)) openExternal(url);
  return null;
}
const ownWindows = new Map();                        // card id -> its own window
const windowGone = new Map();                        // window id -> what to do when it closes
api?.windows?.onRemoved?.addListener(id => { const f = windowGone.get(id); windowGone.delete(id); if (f) f(); });
/* Size (and, to use it, place) a card's own window so its page matches the card's picture exactly. */
async function fitOwnWindow(c, el, front) {
  const wid = ownWindows.get(c.id);
  if (wid == null || !el.isConnected) return false;
  try {
    const w = await api.windows.get(wid, { populate: true }), tab = w.tabs?.[0];
    const dw = tab?.width ? Math.max(0, w.width - tab.width) : 0, dh = tab?.height ? Math.max(0, w.height - tab.height) : 0;
    const box = screenBox(el, true);
    const want = { width: box.width + dw, height: box.height + dh };
    if (front) Object.assign(want, { left: box.left - Math.round(dw / 2), top: Math.max(screen.availTop || 0, box.top - dh + Math.round(dw / 2)), focused: true });
    if (w.state !== 'normal') await api.windows.update(wid, { state: 'normal' });
    if (front || Math.abs(w.width - want.width) > 2 || Math.abs(w.height - want.height) > 2) await api.windows.update(wid, want);
    return true;
  } catch { return false; }
}
async function openOwnWindow(c, el, onClose) {
  const known = ownWindows.get(c.id);
  if (known != null) {                                // already open: bring it over the card, the same size
    if (await fitOwnWindow(c, el, true)) return;
    ownWindows.delete(c.id);
  }
  const id = await openBeside(c.url, el);
  if (id == null) return;
  ownWindows.set(c.id, id);
  windowGone.set(id, () => { ownWindows.delete(c.id); stopLive(c.id); onClose?.(); });
  onClose?.();
}
/* The site's own window, shown live in its card: Edge's tab sharing (asks once which tab; Edge marks it as shared).
   The window keeps drawing while shared even when it is behind the board. */
const liveStreams = new Map();                       // card id -> MediaStream
function stopLive(id) { const st = liveStreams.get(id); liveStreams.delete(id); st?.getTracks().forEach(t => t.stop()); }
async function startLive(c, onChange) {
  const wid = ownWindows.get(c.id);
  let name = titleOf(c.url);
  try { if (wid != null) name = (await api.tabs.query({ windowId: wid }))[0]?.title || name; } catch { /* the address will do */ }
  toast(`In the list, pick the tab “${name}”.`);
  try {
    const controller = window.CaptureController ? new CaptureController() : undefined;
    const p = navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: { ideal: 30 } }, audio: false, controller,
      preferCurrentTab: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'exclude',
    });
    try { controller?.setFocusBehavior?.('no-focus-change'); } catch { /* older Edge: it may jump to that tab */ }
    const stream = await p;
    stopLive(c.id);
    liveStreams.set(c.id, stream);
    stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (liveStreams.get(c.id) === stream) { liveStreams.delete(c.id); onChange(); } });
    toastEl.hidden = true;
  } catch { toast('Nothing is shown live: no tab was picked.'); }
  onChange();
}
/* The board hears from each website window (frame.js): it loaded, or it went to a sign-in page. */
const frameWatch = new Map();
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
    delete c.last;                                      // a new address starts at its top
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
    if ((c.own || ownWindows.has(c.id)) && !isLocal(c.url)) {   // this site lives in its own window
      frame.classList.add('empty');
      const open = ownWindows.has(c.id), live = open && liveStreams.get(c.id);
      if (live) {                                     // its live picture; a click puts the real window over it to use it
        const video = h('video', { class: 'web-live', autoplay: true, muted: true, playsinline: true, title: 'Click to use it (the real window comes over the card)' });
        video.srcObject = live;
        let fitTimer = 0;
        const ro = new ResizeObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(() => { if (!video.isConnected) ro.disconnect(); else fitOwnWindow(c, frame, false); }, 350); });
        ro.observe(frame);
        video.addEventListener('click', () => openOwnWindow(c, frame, load));
        const stop = h('button', { class: 'icon-btn web-live-stop', type: 'button', title: 'Stop showing it live', 'aria-label': 'Stop showing it live', onclick(e) { e.stopPropagation(); stopLive(c.id); load(); } }, icon('x'));
        frame.classList.remove('empty');
        frame.replaceChildren(video, stop);
        return;
      }
      const fav = h('img', { class: 'web-own-icon', alt: '', referrerpolicy: 'no-referrer', src: (() => { try { return new URL(c.url).origin + '/favicon.ico'; } catch { return ''; } })() });
      fav.addEventListener('error', () => fav.remove());
      frame.replaceChildren(h('div', { class: 'web-empty web-own' }, fav, h('b', null, titleOf(c.url)),
        h('p', { class: 'hint' }, open ? 'Open in its own window.' : 'Opens in its own window, so everything on the site works.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => openOwnWindow(c, frame, load) }, open ? 'Bring it over the card' : 'Open'),
          open && navigator.mediaDevices?.getDisplayMedia && h('button', { class: 'btn', type: 'button', title: 'Show the window live in this card, like sharing a screen in a call', onclick: () => startLive(c, load) }, 'Show it live here'))));
      return;
    }
    // PDFs and local files need the browser's own viewer, which a sandboxed frame is not given.
    let pdf = false;
    try { pdf = /\.pdf$/i.test(new URL(c.url).pathname); } catch { /* not a URL */ }
    const trusted = isLocal(c.url) || pdf;
    frame.replaceChildren(
      h('iframe', {
        src: embedUrl(!c.forget && c.last && c.last.url ? c.last.url : c.url), title: c.title, loading: 'lazy', name: `hb:${c.id}${hidesBars(c) ? ':noscroll' : ''}`,
        // Everything a tab may do, except replace this page.
        sandbox: !trusted && 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation allow-pointer-lock allow-orientation-lock allow-storage-access-by-user-activation',
        allow: 'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-read; clipboard-write; camera; microphone; display-capture; geolocation; web-share; storage-access; screen-wake-lock',
        referrerpolicy: 'strict-origin-when-cross-origin',
      }),
      shield());
    if (!trusted && api?.runtime?.id) watchFrame();
  };
  /* Whether the site really showed: frame.js reports from inside it. No word = refused or broken. */
  let slow = 0;
  const notice = (text, ...buttons) => {
    frame.querySelector('.web-notice')?.remove();
    const close = h('button', { class: 'icon-btn', type: 'button', title: 'Hide', 'aria-label': 'Hide', onclick: () => box.remove() }, icon('x'));
    const box = h('div', { class: 'web-notice', role: 'status' }, h('span', null, text), ...buttons, close);
    frame.append(box);
  };
  const ownBtn = (label = 'Open it in its own window') => h('button', { class: 'btn primary', type: 'button', onclick: () => openOwnWindow(c, frame, load) }, label);
  const alwaysBtn = () => h('button', { class: 'btn', type: 'button', title: 'From now on this window opens the site in its own window', onclick() { c.own = true; save(); load(); } }, 'Always');
  function watchFrame() {
    clearTimeout(slow);
    let heard = false;
    frameWatch.set(c.id, msg => {
      if (!frame.isConnected) { frameWatch.delete(c.id); return; }
      heard = true;
      clearTimeout(slow);
      if (msg.kind === 'signin') {
        let host = '';
        try { host = new URL(msg.url).hostname.replace(/^www\./, ''); } catch { /* keep it plain */ }
        notice(`${host || 'This site'} asks you to sign in, and only allows that in a real window. Sign in there once; this window reloads when you close it.`,
          h('button', { class: 'btn primary', type: 'button', async onclick() {
            const id = await openBeside(msg.url, frame);
            if (id != null) windowGone.set(id, () => load());
          } }, 'Sign in'), ownBtn('Use its own window'));
      } else frame.querySelector('.web-notice')?.remove();
    });
    slow = setTimeout(() => {
      if (!heard && frame.isConnected && navigator.onLine) notice('Not showing? Some sites refuse to be inside other pages.', ownBtn(), alwaysBtn());
    }, 12000);
  }
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
    h('button', { class: 'icon-btn', type: 'button', title: 'Back to this address, at its top (the window otherwise comes back where you left it)', 'aria-label': 'Back to this address', onclick() { delete c.last; saveQuiet(); load(); } }, icon('reload')),
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
        if (rec && Date.now() - (rec.added || 0) > (String(key).startsWith('pic-') ? 30 * 864e5 : 3600e3)) await this.tx('readwrite', s => s.delete(key));
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

