/* YouTube Music on the board: what is playing (artwork, title, artist, progress) and the controls
   (previous, play/pause, next, seek, volume, like). It drives YouTube Music wherever it is open in
   Edge — a normal or pinned tab, or a website window on a board — through ytm.js, which Homeboard
   runs inside YouTube Music pages. Only works in the installed extension. */
(() => {
'use strict';

const REG = window.HomeboardWidgets = window.HomeboardWidgets || {};
const api = globalThis.browser ?? globalThis.chrome;
const YTM = 'https://music.youtube.com/';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  prev: svg('<path d="M7 6v12M18 6l-9 6 9 6z" fill="currentColor"/>'),
  next: svg('<path d="M17 6v12M6 6l9 6-9 6z" fill="currentColor"/>'),
  play: svg('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  pause: svg('<path d="M7 5h3.500v14H7zM13.500 5H17v14h-3.500z" fill="currentColor"/>'),
  like: svg('<path d="M7 10v10H4V10zM7 10l4-7c1.500 0 2.500 1.100 2.200 2.600L12.700 9H19a2 2 0 0 1 2 2.300l-1.200 7A2 2 0 0 1 17.800 20H7" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"/>'),
  liked: svg('<path d="M7 10v10H4V10zM7 10l4-7c1.500 0 2.500 1.100 2.200 2.600L12.700 9H19a2 2 0 0 1 2 2.300l-1.200 7A2 2 0 0 1 17.800 20H7z" fill="currentColor"/>'),
  vol: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.500 8.500a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="m17 9.500 4 5M21 9.500l-4 5" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"/>'),
  note: svg('<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.600"/><circle cx="7" cy="18" r="2.500" fill="currentColor"/><circle cx="17" cy="16" r="2.500" fill="currentColor"/>'),
};
const LOOKS = { glass: 'Glass panel', liquid: 'Liquid glass', art: 'Artwork behind', ambient: 'Ambient (big cover glow)', vinyl: 'Vinyl record', frame: 'Framed cover', pill: 'Compact pill', minimal: 'No panel' };

/* ---- the music hub: what YouTube Music plays, for every widget and for the board's colours ----
   Listens to ytm.js (in any tab or website window) like the widget does, and offers:
   subscribe(fn) -> fn(state or null) whenever the song, cover or play state changes; palette(url) -> colours of a cover. */
const hub = window.HomeboardMusic = window.HomeboardMusic || (() => {
  const players = new Map(), subs = new Set();
  let started = false, last = null;
  const alive = () => [...players.entries()].filter(([, p]) => Date.now() - p.seen < 15000 && p.state && p.state.title);
  const current = () => { const list = alive(); return (list.filter(([, p]) => p.state.playing).sort((a, b) => b[1].seen - a[1].seen)[0] || list.sort((a, b) => b[1].seen - a[1].seen)[0] || [])[1] || null; };
  const state = () => current()?.state || null;
  function emit() {
    const st = state(), key = st ? [st.title, st.artist, st.art, st.playing].join('|') : '';
    if (key === last) return;
    last = key;
    for (const f of subs) { try { f(st); } catch { /* that widget is gone */ } }
  }
  async function find() {
    if (!api?.tabs?.query) return;
    let tabs = [];
    try { tabs = await api.tabs.query({ url: YTM + '*' }); } catch { return; }
    for (const t of tabs) { try { const st = await api.tabs.sendMessage(t.id, { homeboard: 'ytm-get' }, { frameId: 0 }); if (st) { players.set(t.id + ':0', { tabId: t.id, frameId: 0, state: st, seen: Date.now() }); } } catch { /* not there */ } }
    emit();
  }
  function start() {
    if (started || !api?.runtime?.onMessage) return;
    started = true;
    api.runtime.onMessage.addListener((msg, sender) => {
      if (!msg || msg.homeboard !== 'ytm' || !sender.tab) return;
      players.set(sender.tab.id + ':' + (sender.frameId || 0), { tabId: sender.tab.id, frameId: sender.frameId || 0, state: msg.state, seen: Date.now() });
      emit();
    });
    find();
    setInterval(emit, 3000);
  }
  async function send(action, value) {
    const p = current();
    if (!p) return;
    try { const st = await api.tabs.sendMessage(p.tabId, { homeboard: 'ytm-do', action, value }, { frameId: p.frameId }); if (st) { p.state = st; p.seen = Date.now(); emit(); } } catch { /* closed */ }
  }
  /* the cover, bigger (YouTube Music hands small ones to the page) */
  const big = url => String(url || '').replace(/=w\d+-h\d+[^/]*$/, '=w1200-h1200-l90-rj').replace(/\/(?:mq|hq|sd)default\.jpg/, '/maxresdefault.jpg');
  /* the colours of a cover: one vivid, one dark, one light (the extension may read any picture's pixels) */
  const colours = new Map();
  async function palette(url) {
    if (!url) return null;
    if (colours.has(url)) return colours.get(url);
    const job = (async () => {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data;
      let best = null, bestScore = -1, sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) {
        const [r, gg, b] = [d[i], d[i + 1], d[i + 2]], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0, val = mx / 255;
        sum[0] += r; sum[1] += gg; sum[2] += b;
        const score = sat * (val > .25 ? 1 : val * 3) * (val < .97 ? 1 : .5);
        if (score > bestScore) { bestScore = score; best = [r, gg, b]; }
      }
      const n = d.length / 4, avg = sum.map(v => Math.round(v / n));
      const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
      const vivid = bestScore > .25 ? best : avg;
      const lift = vivid.map(v => v + (255 - v) * .25);   // a little lighter, so it reads on dark boards
      return { vivid: hex(lift), dark: hex(avg.map(v => v * .35)), light: hex(avg.map(v => v + (255 - v) * .8)), average: hex(avg) };
    })().catch(() => null);
    colours.set(url, job);
    if (colours.size > 60) colours.delete(colours.keys().next().value);
    return job;
  }
  return { subscribe(fn) { start(); subs.add(fn); try { fn(state()); } catch { /* ignore */ } return () => subs.delete(fn); }, state, send, palette, big };
})();
const clock = s => (isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

function ytmusic(host, saved, onChange) {
  const st = { look: 'glass', pick: '' };
  if (saved && typeof saved === 'object') { if (LOOKS[saved.look]) st.look = saved.look; if (typeof saved.pick === 'string') st.pick = saved.pick; }
  const keep = () => { try { onChange({ ...st }); } catch { /* host gone */ } };

  const root = el('div', 'ytm');
  const back = el('div', 'ytm-back'), art = el('div', 'ytm-art'), img = el('img');
  img.alt = ''; img.referrerPolicy = 'no-referrer'; img.draggable = false;
  art.append(img);
  const info = el('div', 'ytm-info'), title = el('div', 'ytm-title'), who = el('div', 'ytm-who');
  const bar = el('div', 'ytm-bar'), fill = el('i'); bar.append(fill);
  bar.title = 'Click to jump';
  const times = el('div', 'ytm-times'), t1 = el('span'), t2 = el('span'); times.append(t1, t2);
  const button = (cls, label, html) => { const b = el('button', 'ytm-btn ' + cls); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = html; return b; };
  const prev = button('prev', 'Previous', ICON.prev), play = button('play', 'Play or pause', ICON.play), next = button('next', 'Next', ICON.next);
  const like = button('like', 'Like', ICON.like), mute = button('mute', 'Sound on or off', ICON.vol);
  const vol = el('input', 'ytm-vol'); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.title = 'Volume'; vol.setAttribute('aria-label', 'Volume');
  const controls = el('div', 'ytm-controls'); controls.append(like, prev, play, next, mute, vol);
  info.append(title, who, bar, times, controls);
  const empty = el('div', 'ytm-empty');
  root.append(back, art, info, empty);
  host.append(root);

  /* players heard from: "tabId:frameId" -> { tabId, frameId, state, seen } */
  const players = new Map();
  let at = 0;                                         // when the current state arrived (for a smooth progress bar)
  const alive = () => [...players.entries()].filter(([, p]) => Date.now() - p.seen < 15000);
  function current() {
    const list = alive();
    if (!list.length) return null;
    const picked = list.find(([k]) => k === st.pick);
    const playing = list.filter(([, p]) => p.state.playing).sort((a, b) => b[1].seen - a[1].seen)[0];
    return (picked && (picked[1].state.playing || !playing) ? picked : playing || picked || list.sort((a, b) => b[1].seen - a[1].seen)[0]) || null;
  }

  function paint() {
    const cur = current();
    root.dataset.look = st.look;
    root.classList.toggle('none', !cur || !cur[1].state.title);
    if (!api?.tabs) {
      empty.replaceChildren(el('span', 'ytm-note', 'YouTube Music can be controlled from the installed Homeboard.'));
      return;
    }
    if (!cur || !cur[1].state.title) {
      const open = el('button', 'ytm-open', cur ? 'Go to YouTube Music' : 'Open YouTube Music');
      open.type = 'button';
      open.addEventListener('click', () => (cur ? focusPlayer(cur[1]) : openPlayer()));
      empty.replaceChildren(el('span', 'ytm-icon'), el('span', 'ytm-note', cur ? 'Nothing is playing yet.' : 'YouTube Music is not open.'), open);
      empty.firstChild.innerHTML = ICON.note;
      return;
    }
    const s = cur[1].state;
    root.dataset.playing = s.playing ? '1' : '0';
    if (img.dataset.src !== s.art) {
      img.dataset.src = s.art;
      img.src = s.art || '';
      if (s.art && (st.look === 'frame' || st.look === 'ambient' || st.look === 'vinyl')) { const want = s.art, big = new Image(); big.referrerPolicy = 'no-referrer'; big.onload = () => { if (img.dataset.src === want) img.src = big.src; }; big.src = hub.big(s.art); }
      back.style.backgroundImage = s.art ? `url("${hub.big(s.art).replace(/"/g, '%22')}")` : '';
      hub.palette(s.art).then(p => { if (p) { root.style.setProperty('--ytm-tint', p.vivid); root.style.setProperty('--ytm-dark', p.dark); } });
    }
    title.textContent = s.title; title.title = s.title;
    who.textContent = [s.artist, s.album].filter(Boolean).join(' · ');
    play.innerHTML = s.playing ? ICON.pause : ICON.play;
    play.title = s.playing ? 'Pause' : 'Play';
    like.innerHTML = s.like === 'LIKE' ? ICON.liked : ICON.like;
    like.classList.toggle('on', s.like === 'LIKE');
    mute.innerHTML = s.muted || !s.volume ? ICON.mute : ICON.vol;
    if (document.activeElement !== vol) vol.value = s.muted ? 0 : s.volume;
    tick();
  }
  function tick() {
    const cur = current();
    if (!cur) return;
    const s = cur[1].state, t = Math.min(s.duration || 0, s.time + (s.playing ? (Date.now() - at) / 1000 : 0));
    fill.style.width = s.duration ? `${(t / s.duration) * 100}%` : '0%';
    t1.textContent = clock(t); t2.textContent = clock(s.duration);
  }

  function heard(key, tabId, frameId, state) {
    players.set(key, { tabId, frameId, state, seen: Date.now() });
    if (current()?.[0] === key) at = Date.now();
    paint();
  }
  const onMessage = (msg, sender) => {
    if (!root.isConnected) { if (started) api.runtime.onMessage.removeListener(onMessage); return; }
    if (!msg || msg.homeboard !== 'ytm' || !sender.tab) return;
    heard(`${sender.tab.id}:${sender.frameId || 0}`, sender.tab.id, sender.frameId || 0, msg.state);
  };
  let started = false;
  async function find() {                              // players already open; start the helper script in tabs opened before Homeboard was
    if (!api?.tabs?.query) return;
    let tabs = [];
    try { tabs = await api.tabs.query({ url: YTM + '*' }); } catch { return; }
    for (const t of tabs) {
      try { heard(`${t.id}:0`, t.id, 0, await api.tabs.sendMessage(t.id, { homeboard: 'ytm-get' }, { frameId: 0 })); }
      catch {
        try { await api.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['ytm.js'] }); } catch { /* not allowed on that page */ }
      }
    }
  }
  async function send(action, value) {
    const cur = current();
    if (!cur) return;
    const [key, p] = cur;
    try {
      const s = await api.tabs.sendMessage(p.tabId, { homeboard: 'ytm-do', action, value }, { frameId: p.frameId });
      if (s) heard(key, p.tabId, p.frameId, s);
    } catch { players.delete(key); paint(); }
  }
  function openPlayer() { api.tabs.create({ url: YTM, pinned: true, active: true }).catch(() => window.open(YTM, '_blank')); }
  async function focusPlayer(p) {
    try { const t = await api.tabs.update(p.tabId, { active: true }); if (api.windows?.update) await api.windows.update(t.windowId, { focused: true }); } catch { /* it closed */ }
  }

  play.addEventListener('click', () => send('toggle'));
  next.addEventListener('click', () => send('next'));
  prev.addEventListener('click', () => send('previous'));
  like.addEventListener('click', () => send('like'));
  mute.addEventListener('click', () => send('mute'));
  let volTimer = 0;
  vol.addEventListener('input', () => { clearTimeout(volTimer); volTimer = setTimeout(() => send('volume', +vol.value), 120); });
  bar.addEventListener('click', e => {
    const cur = current(), r = bar.getBoundingClientRect();
    if (cur && cur[1].state.duration) send('seek', ((e.clientX - r.left) / r.width) * cur[1].state.duration);
  });
  root.addEventListener('wheel', e => {                // scroll over the widget: volume
    if (!e.target.closest('.ytm-controls, .ytm-art')) return;
    const cur = current();
    if (!cur) return;
    e.preventDefault(); e.stopPropagation();
    send('volume', Math.max(0, Math.min(100, (cur[1].state.volume || 0) + (e.deltaY < 0 ? 5 : -5))));
  }, { passive: false });

  if (api?.runtime?.onMessage) { api.runtime.onMessage.addListener(onMessage); started = true; find(); }
  const timer = setInterval(() => {
    if (!root.isConnected) { if (root.dataset.was) { clearInterval(timer); if (started) api.runtime.onMessage.removeListener(onMessage); } return; }
    root.dataset.was = '1';
    tick();
  }, 250);
  const recheck = setInterval(() => { if (!root.isConnected && root.dataset.was) clearInterval(recheck); else paint(); }, 5000);
  paint();

  return {
    grab: e => !e.target.closest('button, input, .ytm-bar'),
    menu: () => {
      const list = alive();
      return [
        { info: current()?.[1].state.title ? 'Scroll over the controls to change the volume.' : 'Play something in YouTube Music and it shows up here.' },
        current() && { label: 'Go to the player', icon: 'external', action: () => focusPlayer(current()[1]) },
        { label: 'Open YouTube Music (pinned tab)', icon: 'web', action: openPlayer },
        list.length > 1 && { label: 'Which player', icon: 'layers', items: list.map(([k, p]) => ({ label: p.state.title || 'YouTube Music (nothing playing)', checked: current()?.[0] === k, action() { st.pick = k; keep(); paint(); } })) },
        { label: 'Look', icon: 'layers', items: Object.entries(LOOKS).map(([id, name]) => ({ label: name, checked: st.look === id, action() { st.look = id; img.dataset.src = ''; keep(); paint(); } })) },
      ];
    },
  };
}

/* ================= Picture frame: your picture, or the cover of what plays (it changes with the song) ================= */
const FRAMES = { gilded: 'Gilded', gallery: 'Gallery black', wood: 'Wood', polaroid: 'Polaroid', white: 'Thin white', none: 'No frame' };
const SOURCES = { music: 'What’s playing', both: 'What’s playing, else my picture', picture: 'My picture' };
function pictureFrame(host, saved, onChange) {
  const st = { style: 'gilded', source: 'music', pic: '', mat: true, caption: true };
  if (saved && typeof saved === 'object') {
    if (FRAMES[saved.style]) st.style = saved.style;
    if (SOURCES[saved.source]) st.source = saved.source;
    if (typeof saved.pic === 'string' && saved.pic.startsWith('data:image/')) st.pic = saved.pic;
    st.mat = saved.mat !== false; st.caption = saved.caption !== false;
  }
  const keep = () => { try { onChange({ ...st }); } catch { /* host gone */ } };
  const root = el('div', 'pf'), frame = el('div', 'pf-frame'), mat = el('div', 'pf-mat'), img = el('img', 'pf-img'), empty = el('div', 'pf-empty'), cap = el('div', 'pf-cap');
  img.alt = ''; img.draggable = false; img.referrerPolicy = 'no-referrer';
  mat.append(img, empty); frame.append(mat, cap); root.append(frame);
  host.append(root);
  let song = null;
  function paint() {
    root.dataset.style = st.style;
    root.classList.toggle('no-mat', !st.mat || st.style === 'none' || st.style === 'polaroid');
    const music = st.source !== 'picture' && song && song.art;
    const src = music ? hub.big(song.art) : st.source !== 'music' ? st.pic : '';
    if (img.dataset.src !== src) {
      img.dataset.src = src;
      if (music) img.src = song.art;                    // the small cover at once, the big one when it has loaded
      if (src) { const big = new Image(); big.referrerPolicy = 'no-referrer'; big.onload = () => { if (img.dataset.src === src) img.src = src; }; big.onerror = () => { if (img.dataset.src === src && music) img.src = song.art; }; big.src = src; }
      else img.removeAttribute('src');
    }
    img.hidden = !src;
    empty.textContent = src ? '' : st.source === 'picture' ? 'Right-click → Choose a picture…' : '♪ Nothing playing';
    cap.textContent = st.caption && music ? [song.title, song.artist].filter(Boolean).join(' — ') : '';
    root.classList.toggle('playing', !!(music && song.playing));
    if (music) hub.palette(song.art).then(p => { if (p) root.style.setProperty('--pf-tint', p.vivid); });
  }
  const stop = hub.subscribe(sg => { if (!root.isConnected && root.dataset.was) { stop(); return; } song = sg; paint(); });
  const watch = setInterval(() => { if (root.isConnected) root.dataset.was = '1'; else if (root.dataset.was) { clearInterval(watch); stop(); } }, 2000);
  function choose() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      try {                                             // kept smaller than the original, so the board stays light
        const bmp = await createImageBitmap(f), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        st.pic = c.toDataURL('image/jpeg', .86);
        if (st.source === 'music') st.source = 'both';
        keep(); paint();
      } catch { /* not a picture */ }
    });
    inp.click();
  }
  root.addEventListener('dblclick', () => { if (st.source !== 'picture' && song) hub.send('toggle'); });   // double-click: play / pause
  paint();
  return {
    grab: () => true,
    menu: () => [
      { info: st.source === 'picture' ? 'Shows your picture.' : 'Shows the cover of what plays in YouTube Music (double-click to pause or play).' },
      { label: 'Show', icon: 'media', items: Object.entries(SOURCES).map(([id, name]) => ({ label: name, checked: st.source === id, action() { st.source = id; keep(); paint(); if (id !== 'music' && !st.pic) choose(); } })) },
      { label: st.pic ? 'Change my picture…' : 'Choose a picture…', icon: 'media', action: choose },
      { label: 'Frame', icon: 'layers', items: Object.entries(FRAMES).map(([id, name]) => ({ label: name, checked: st.style === id, action() { st.style = id; keep(); paint(); } })) },
      { label: 'White mount around the picture', checked: st.mat, action() { st.mat = !st.mat; keep(); paint(); } },
      { label: 'Song name under it', checked: st.caption, action() { st.caption = !st.caption; keep(); paint(); } },
    ],
  };
}
REG.frame = { label: 'Picture frame', menu: 'Picture frame', w: 250, h: 310, bare: true, create: pictureFrame };

REG.ytm = { label: 'YouTube Music', menu: 'YouTube Music', w: 420, h: 150, bare: true, create: ytmusic };
})();
