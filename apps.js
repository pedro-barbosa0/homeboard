/* Apps and workspaces on the board.
 *
 *  Apps card       tiles for programs: Start-menu apps (with their real icons), program files, documents, folders.
 *                  Click one to start it. Starting things needs the helper (helper/server.js + winbridge.ps1).
 *  Workspace card  a named set of apps, folders and websites, each with a place on the screen
 *                  (left half, right third, a quarter...). "Open" starts whatever is not open yet and puts
 *                  every window in its place; what is already open is only moved. "Capture" takes the
 *                  windows on the screen right now, with their places, as the workspace.
 *                  Websites open as Edge windows (no helper needed for those).
 *
 *  app.js loads this first and hands it the board's tools: window.HomeboardApps(kit) -> { apps, space }.
 */
(() => {
'use strict';

window.HomeboardApps = kit => {
  const { h, icon, helper, helperHint, toast, openMenu, save, uid, api, FILES_DND } = kit;

  /* ---------- places on a screen, in fractions of its work area ---------- */
  const T = 1 / 3;
  const ZONES = [
    ['full', 'Whole screen', 0, 0, 1, 1],
    ['center', 'Middle', .15, .08, .7, .84],
    ['left', 'Left half', 0, 0, .5, 1], ['right', 'Right half', .5, 0, .5, 1],
    ['top', 'Top half', 0, 0, 1, .5], ['bottom', 'Bottom half', 0, .5, 1, .5],
    ['l3', 'Left third', 0, 0, T, 1], ['m3', 'Middle third', T, 0, T, 1], ['r3', 'Right third', 2 * T, 0, T, 1],
    ['l23', 'Left two thirds', 0, 0, 2 * T, 1], ['r23', 'Right two thirds', T, 0, 2 * T, 1],
    ['tl', 'Top-left quarter', 0, 0, .5, .5], ['tr', 'Top-right quarter', .5, 0, .5, .5],
    ['bl', 'Bottom-left quarter', 0, .5, .5, .5], ['br', 'Bottom-right quarter', .5, .5, .5, .5],
  ].map(([key, label, x, y, w, hh]) => ({ key, label, zone: { x, y, w, h: hh } }));
  const sameZone = (a, b) => ['x', 'y', 'w', 'h'].every(k => Math.abs((a[k] || 0) - (b[k] || 0)) < .01);
  const zoneName = z => (ZONES.find(p => sameZone(p.zone, z)) || { label: 'Its own place' }).label;
  const round = v => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

  /* Screens as Edge sees them (for website windows and the little map): primary first, then left to right. */
  async function displays() {
    try {
      if (api?.system?.display) {
        const list = await api.system.display.getInfo();
        return list.map(d => ({ x: d.workArea.left, y: d.workArea.top, w: d.workArea.width, h: d.workArea.height, primary: d.isPrimary, full: d.bounds }))
          .sort((a, b) => (a.primary === b.primary ? a.x - b.x : a.primary ? -1 : 1));
      }
    } catch { /* fall through */ }
    const s = window.screen;
    return [{ x: s.availLeft || 0, y: s.availTop || 0, w: s.availWidth, h: s.availHeight, primary: true }];
  }
  const rectOn = (scr, item) => {
    const s = scr[Math.min(scr.length - 1, Math.max(0, item.screen || 0))], z = item.zone || ZONES[0].zone;
    return { left: Math.round(s.x + z.x * s.w), top: Math.round(s.y + z.y * s.h), width: Math.max(300, Math.round(z.w * s.w)), height: Math.max(200, Math.round(z.h * s.h)) };
  };

  /* ---------- icons ---------- */
  const iconTarget = it => (it.appId ? 'shell:AppsFolder\\' + it.appId : it.path || '');
  async function fetchIcons(list) {                     // fills it.icon for those that have none; true if any changed
    const need = list.filter(it => !it.icon && it.kind !== 'site' && iconTarget(it));
    if (!need.length || !(await helper.ready())) return false;
    try {
      const { icons } = await helper.call('/apps/icons', { targets: need.map(iconTarget), size: 48 });
      let changed = false;
      for (const it of need) if (icons[iconTarget(it)]) { it.icon = icons[iconTarget(it)]; changed = true; }
      return changed;
    } catch { return false; }
  }
  function picture(it, size = 'big') {
    const box = h('span', { class: 'app-ico ' + size });
    const letter = () => { box.replaceChildren(it.kind === 'folder' ? icon('folder') : document.createTextNode((it.name || '?')[0].toUpperCase())); };
    let src = it.icon;
    if (!src && it.kind === 'site') try { src = new URL(it.url).origin + '/favicon.ico'; } catch { /* letter */ }
    if (src) {
      const img = h('img', { alt: '', draggable: 'false', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', letter);
      img.src = src;
      box.append(img);
    } else letter();
    return box;
  }

  /* ---------- starting things ---------- */
  async function needHelper() {
    if (await helper.ready(true)) return true;
    toast(helperHint());
    return false;
  }
  const what = it => (it.appId ? { appId: it.appId } : { path: it.path, args: it.args || '' });
  async function launch(it) {
    if (!(await needHelper())) return;
    try { await helper.call('/apps/launch', what(it)); toast(`Starting ${it.name}…`); }
    catch (e) { toast(`${it.name}: ${e.message}`); }
  }

  /* ---------- the picker: Start-menu apps, or any program, file or folder by its path ---------- */
  let appCache = null;
  function picker(host, onPick, opts = {}) {
    host.querySelector('.app-picker')?.remove();
    const search = h('input', { class: 'field', type: 'search', placeholder: 'Search apps', spellcheck: 'false', 'aria-label': 'Search apps' });
    const list = h('div', { class: 'app-pick-list', role: 'listbox' }, h('div', { class: 'app-pick-note' }, 'Asking Windows for your apps…'));
    const path = h('input', { class: 'field', type: 'text', placeholder: 'Or a program, file or folder: C:\\…', spellcheck: 'false', 'aria-label': 'Program, file or folder' });
    const args = h('input', { class: 'field', type: 'text', placeholder: 'Arguments (optional)', spellcheck: 'false', 'aria-label': 'Arguments', hidden: true });
    path.addEventListener('input', () => { args.hidden = !/\.(exe|bat|cmd|com)"?\s*$/i.test(path.value.trim()); });
    const close = () => { panel.remove(); io.disconnect(); };
    const panel = h('div', { class: 'app-picker', onkeydown(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } } },
      h('div', { class: 'app-pick-head' }, h('b', null, opts.title || 'Add an app'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Close', 'aria-label': 'Close', onclick: close }, icon('x'))),
      search, list,
      h('form', { class: 'app-pick-path', onsubmit(e) {
        e.preventDefault();
        const p = path.value.trim().replace(/^"(.*)"$/, '$1');
        if (!/^([a-z]:[\\/]|\\\\)/i.test(p)) { path.classList.add('bad'); path.focus(); return; }
        const name = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop().replace(/\.(exe|lnk|url|bat|cmd)$/i, '') || p;
        const isDir = !/\.[a-z0-9]{1,6}$/i.test(p) || /[\\/]$/.test(p);
        onPick({ name, path: p.replace(/[\\/]+$/, '') + (/^[a-z]:$/i.test(p.replace(/[\\/]+$/, '')) ? '\\' : ''), kind: isDir ? 'folder' : 'app', args: args.hidden ? '' : args.value.trim() });
        close();
      } }, path, args, h('button', { class: 'btn', type: 'submit' }, 'Add')));
    host.append(panel);
    search.focus();

    // icons are fetched for the rows that scroll into view, a few at a time
    const waiting = new Map();
    let timer = 0;
    const flush = async () => {
      timer = 0;
      const batch = [...waiting.entries()].slice(0, 24);
      for (const [k] of batch) waiting.delete(k);
      if (!batch.length) return;
      try {
        const { icons } = await helper.call('/apps/icons', { targets: batch.map(([k]) => k), size: 32 });
        for (const [k, img] of batch) if (icons[k]) img.src = icons[k];
      } catch { /* letters stay */ }
      if (waiting.size) timer = setTimeout(flush, 30);
    };
    const io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); waiting.set(en.target.dataset.target, en.target.querySelector('img')); }
      if (waiting.size && !timer) timer = setTimeout(flush, 60);
    }, { root: list });

    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const rows = (appCache || []).filter(a => !q || a.name.toLowerCase().includes(q)).slice(0, 300).map(a => {
        const img = h('img', { alt: '', draggable: 'false' });
        const row = h('button', { class: 'app-pick-row', type: 'button', role: 'option', 'data-target': 'shell:AppsFolder\\' + a.id, title: a.id,
          onclick() { onPick({ name: a.name, appId: a.id, kind: 'app' }); close(); } },
        h('span', { class: 'app-ico small' }, img), h('span', null, a.name));
        io.observe(row);
        return row;
      });
      list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'app-pick-note' }, appCache ? 'No app with that name.' : '')]));
    };
    search.addEventListener('input', draw);
    search.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); list.querySelector('.app-pick-row')?.click(); } });
    (async () => {
      if (!(await helper.ready(true))) { list.replaceChildren(h('div', { class: 'app-pick-note' }, helperHint())); return; }
      try { appCache = appCache || (await helper.call('/apps/list')).apps.sort((a, b) => a.name.localeCompare(b.name)); draw(); }
      catch (e) { list.replaceChildren(h('div', { class: 'app-pick-note' }, e.message)); }
    })();
  }

  /* Small inline rename form under a card's content. */
  function renameForm(host, current, done) {
    host.querySelector('.app-rename')?.remove();
    const input = h('input', { class: 'field', type: 'text', value: current, 'aria-label': 'Name' });
    const form = h('form', { class: 'app-rename', onsubmit(e) { e.preventDefault(); form.remove(); done(input.value.trim()); },
      onkeydown(e) { if (e.key === 'Escape') { e.stopPropagation(); form.remove(); } } },
    input, h('button', { class: 'btn', type: 'submit' }, 'Save'));
    host.append(form);
    input.focus(); input.select();
  }

  /* Files dragged from a file browser card become apps / workspace items. */
  function takesFiles(el, add) {
    el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(FILES_DND)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'link'; el.classList.add('app-drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('app-drop'));
    el.addEventListener('drop', e => {
      if (!e.dataTransfer.types.includes(FILES_DND)) return;
      e.preventDefault(); e.stopPropagation(); el.classList.remove('app-drop');
      let paths = [];
      try { paths = JSON.parse(e.dataTransfer.getData(FILES_DND)); } catch { return; }
      for (const p of [].concat(paths)) if (typeof p === 'string' && p) {
        const clean = p.replace(/[\\/]+$/, '');
        add({ name: clean.split(/[\\/]/).pop().replace(/\.(exe|lnk|url)$/i, '') || clean, path: clean, kind: /\.[a-z0-9]{1,6}$/i.test(clean) ? 'app' : 'folder' });
      }
    });
  }

  /* ================= Apps card ================= */
  function apps(c, body) {
    c.apps = Array.isArray(c.apps) ? c.apps : [];
    const grid = h('div', { class: 'links-grid apps-grid' });
    const add = it => { c.apps.push({ id: uid(), ...it }); draw(); save(); fetchIcons(c.apps).then(ch => { if (ch) { draw(); save(); } }); };
    const tile = it => {
      const b = h('button', { class: 'link-tile app-tile', type: 'button', title: it.appId ? it.name : it.path, onclick: () => launch(it) },
        picture(it), h('span', { class: 'link-name' }, it.name));
      b.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        openMenu(e.clientX, e.clientY, [
          { label: 'Open', icon: 'play', action: () => launch(it) },
          { label: 'Rename', icon: 'edit', action: () => renameForm(body, it.name, v => { if (v) { it.name = v.slice(0, 60); draw(); save(); } }) },
          it.kind !== 'folder' && it.path && /\.(exe|bat|cmd)$/i.test(it.path) && { label: it.args ? `Arguments: ${it.args}` : 'Add arguments', icon: 'edit',
            action: () => renameForm(body, it.args || '', v => { it.args = (v || '').slice(0, 500); save(); }) },
          { label: 'Move left', icon: 'arrow', action() { const i = c.apps.indexOf(it); if (i > 0) { c.apps.splice(i, 1); c.apps.splice(i - 1, 0, it); draw(); save(); } } },
          { label: 'Remove', icon: 'trash', danger: true, action() { c.apps.splice(c.apps.indexOf(it), 1); draw(); save(); } },
          { info: it.appId ? 'A Start-menu app' : it.path },
        ]);
      });
      return b;
    };
    const draw = () => grid.replaceChildren(...c.apps.map(tile),
      h('button', { class: 'link-tile link-add', type: 'button', title: 'Add an app', onclick: () => picker(body, add) },
        h('span', { class: 'link-ico' }, icon('plus')), h('span', { class: 'link-name' }, 'Add')));
    takesFiles(grid, add);
    draw();
    body.append(grid);
    fetchIcons(c.apps).then(ch => { if (ch) { draw(); save(); } });
  }

  /* ================= Workspace card ================= */
  const KINDS = { app: 'App', folder: 'Folder', site: 'Website' };
  function space(c, body) {
    c.items = Array.isArray(c.items) ? c.items : [];
    let scr = null;
    const map = h('div', { class: 'space-map' });
    const status = h('div', { class: 'space-status' });
    const say = t => { status.textContent = t || ''; };
    const run = h('button', { class: 'btn primary space-open', type: 'button', onclick: () => openAll() }, icon('play'), h('span', null, 'Open'));
    const bar = h('div', { class: 'space-bar' }, run,
      h('button', { class: 'btn', type: 'button', title: 'Add an app, folder or website', onclick: e => addMenu(e) }, icon('plus'), h('span', null, 'Add')),
      h('button', { class: 'btn', type: 'button', title: 'Use the windows on the screen now, where they are', onclick: () => capture() }, icon('layers'), h('span', null, 'Capture')),
      status);

    const nextZone = () => {                          // new items fill the screen sensibly: halves, then quarters
      const used = c.items.map(i => i.zone);
      return (ZONES.slice(2).find(p => !used.some(z => sameZone(z, p.zone))) || ZONES[0]).zone;
    };
    const add = it => {
      c.items.push({ id: uid(), screen: 0, zone: { ...nextZone() }, ...it });
      draw(); save();
      fetchIcons(c.items).then(ch => { if (ch) { draw(); save(); } });
    };
    function addMenu(e) {
      const r = e.currentTarget.getBoundingClientRect();
      openMenu(r.left, r.bottom + 4, [
        { label: 'An app', icon: 'widget', action: () => picker(body, add, { title: 'Add an app to the workspace' }) },
        { label: 'A website', icon: 'web', action: () => siteForm(null) },
        { label: 'A folder or file', icon: 'folder', action: () => picker(body, add, { title: 'Add a folder or file' }) },
      ]);
    }
    function siteForm(it) {
      body.querySelector('.app-rename')?.remove();
      const url = h('input', { class: 'field', type: 'text', placeholder: 'example.com', value: it ? it.url : '', spellcheck: 'false', 'aria-label': 'Website address' });
      const tabs = h('label', { class: 'space-check' }, h('input', { type: 'checkbox', checked: !!(it && it.tabs) }), ' with tabs and address bar');
      const form = h('form', { class: 'app-rename', onsubmit(e) {
        e.preventDefault();
        let u = url.value.trim();
        if (!/^[a-z][\w+.-]*:/i.test(u)) u = 'https://' + u;
        try { u = new URL(u).href; } catch { url.classList.add('bad'); return; }
        const next = { kind: 'site', url: u, name: new URL(u).hostname.replace(/^www\./, ''), tabs: tabs.querySelector('input').checked };
        form.remove();
        if (it) { Object.assign(it, next); draw(); save(); } else add(next);
      }, onkeydown(e) { if (e.key === 'Escape') { e.stopPropagation(); form.remove(); } } },
      url, tabs, h('button', { class: 'btn', type: 'submit' }, it ? 'Save' : 'Add'));
      body.append(form);
      url.focus();
    }

    function itemMenu(e, it) {
      e.preventDefault(); e.stopPropagation();
      const x = e.clientX, y = e.clientY;
      const zoneItems = ZONES.map(p => ({ label: p.label, checked: sameZone(p.zone, it.zone), action() { it.zone = { ...p.zone }; draw(); save(); } }));
      openMenu(x, y, [
        { label: 'Open just this', icon: 'play', action: () => openItems([it]) },
        { label: `Place · ${zoneName(it.zone)}`, icon: 'expand', items: zoneItems },
        scr && scr.length > 1 && { label: `Screen · ${(it.screen || 0) + 1}`, icon: 'web', items: scr.map((s, i) => ({ label: `Screen ${i + 1}${s.primary ? ' (main)' : ''}`, checked: (it.screen || 0) === i, action() { it.screen = i; draw(); save(); } })) },
        { label: 'Rename', icon: 'edit', action: () => renameForm(body, it.name, v => { if (v) { it.name = v.slice(0, 60); draw(); save(); } }) },
        it.kind === 'site' && { label: 'Change address', icon: 'web', action: () => siteForm(it) },
        { label: 'Bring to front', icon: 'up', action() { c.items.push(...c.items.splice(c.items.indexOf(it), 1)); draw(); save(); } },
        { label: 'Remove', icon: 'trash', danger: true, action() { c.items.splice(c.items.indexOf(it), 1); draw(); save(); } },
        { info: `${KINDS[it.kind] || 'App'} · ${it.kind === 'site' ? it.url : it.appId ? 'Start menu' : it.path}` },
      ]);
    }

    /* the screens, drawn small, with each item where it will go */
    function draw() {
      const list = scr || [{ x: 0, y: 0, w: 16, h: 9, primary: true }];
      const minX = Math.min(...list.map(s => s.x)), minY = Math.min(...list.map(s => s.y));
      const W = Math.max(...list.map(s => s.x + s.w)) - minX, H = Math.max(...list.map(s => s.y + s.h)) - minY;
      map.style.setProperty('--rw', W); map.style.setProperty('--rh', H);
      const stage = h('div', { class: 'space-stage' });
      map.replaceChildren(stage);
      stage.append(...list.map((s, i) => {
        const box = h('div', { class: 'space-screen' });
        Object.assign(box.style, { left: (s.x - minX) / W * 100 + '%', top: (s.y - minY) / H * 100 + '%', width: s.w / W * 100 + '%', height: s.h / H * 100 + '%' });
        if (list.length > 1) box.append(h('span', { class: 'space-num' }, String(i + 1)));
        for (const it of c.items.filter(k => Math.min(list.length - 1, k.screen || 0) === i)) {
          const z = it.zone || ZONES[0].zone;
          const tileEl = h('button', { class: 'space-item', type: 'button', title: `${it.name} · ${zoneName(z)} (click for options)`, onclick: e => itemMenu(e, it), oncontextmenu: e => itemMenu(e, it) },
            picture(it, 'small'), h('span', { class: 'space-name' }, it.name));
          Object.assign(tileEl.style, { left: z.x * 100 + '%', top: z.y * 100 + '%', width: z.w * 100 + '%', height: z.h * 100 + '%' });
          box.append(tileEl);
        }
        return box;
      }));
      run.disabled = !c.items.length;
      if (!c.items.length) map.append(h('div', { class: 'space-empty' }, 'Add apps, folders and websites, or press Capture to take the windows on your screen as they are.'));
    }

    /* ---- open: websites through Edge, the rest through the helper ---- */
    async function openItems(list) {
      const sites = list.filter(i => i.kind === 'site'), rest = list.filter(i => i.kind !== 'site');
      const shown = await displays();
      let failed = 0;
      if (sites.length && api?.windows) {
        const key = 'homeboard:space-windows';
        const known = (api.storage?.session ? (await api.storage.session.get(key))[key] : null) || {};
        for (const it of sites) {
          const r = rectOn(shown, it);
          try {
            let w = null;
            if (known[it.id]) w = await api.windows.update(known[it.id], { state: 'normal' }).then(() => api.windows.update(known[it.id], { ...r, focused: true }), () => null);
            if (!w) {
              try { w = await api.windows.create({ url: it.url, type: it.tabs ? 'normal' : 'popup', ...r, focused: true }); }
              catch { w = await api.windows.create({ url: it.url, type: it.tabs ? 'normal' : 'popup', focused: true }); }   // a place Edge will not use: let it choose
            }
            known[it.id] = w.id;
          } catch { failed++; }
        }
        try { await api.storage?.session?.set({ [key]: known }); } catch { /* remembered for this tab only */ }
      } else if (sites.length) for (const it of sites) window.open(it.url, '_blank', 'noopener');
      if (rest.length) {
        if (!(await needHelper())) return;
        say(rest.length > 1 ? `Opening ${rest.length} windows…` : `Opening ${rest[0].name}…`);
        try {
          const { results } = await helper.call('/win/open', { items: rest.map(it => ({ id: it.id, kind: it.kind, name: it.name, appId: it.appId, path: it.path, args: it.args, exe: it.exe, screen: it.screen || 0, zone: it.zone })) });
          for (const r of results) {
            const it = c.items.find(k => k.id === r.id);
            if (it && r.exe && it.kind !== 'folder' && !/\\explorer\.exe$/i.test(r.exe) && it.exe !== r.exe) { it.exe = r.exe; save(); }   // knows its window next time
            if (r.error || !r.placed) failed++;
          }
          const bad = results.filter(r => r.error).map(r => r.error);
          say('');
          if (bad.length) toast(bad[0]);
          else if (failed) toast(`${failed} window${failed > 1 ? 's' : ''} did not show up in time to be placed.`);
        } catch (e) { say(''); toast(e.message); }
      } else if (failed) toast('Some websites could not be opened.');
    }
    const openAll = () => (c.items.length ? openItems(c.items) : toast('Add something to the workspace first.'));

    /* ---- capture: the windows on the screen now, where they are ---- */
    async function capture() {
      const shown = await displays();
      const items = [];
      const toZone = (rect, list) => {                 // the screen holding the window's middle, and its place there
        const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
        let i = list.findIndex(s => cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.h);
        if (i < 0) i = 0;
        const s = list[i];
        let z = { x: round((rect.x - s.x) / s.w), y: round((rect.y - s.y) / s.h), w: round(rect.w / s.w), h: round(rect.h / s.h) };
        z.w = Math.min(z.w, round(1 - z.x)); z.h = Math.min(z.h, round(1 - z.y));
        const snapTo = ZONES.find(p => ['x', 'y', 'w', 'h'].every(k => Math.abs(p.zone[k] - z[k]) < .03));
        if (snapTo) z = { ...snapTo.zone };
        return { screen: i, zone: z };
      };
      // Edge windows: their website (not this board's window)
      if (api?.windows) {
        const mine = await new Promise(res => { try { api.tabs.getCurrent(t => res(t && t.windowId)); } catch { res(null); } });
        for (const w of await api.windows.getAll({ populate: true })) {
          if (w.id === mine || w.state === 'minimized' || !w.tabs) continue;
          const tab = w.tabs.find(t => t.active) || w.tabs[0];
          if (!tab || !/^https?:/i.test(tab.url || '')) continue;
          const rect = w.state === 'maximized' || w.state === 'fullscreen' ? null : { x: w.left, y: w.top, w: w.width, h: w.height };
          const where = rect ? toZone(rect, shown) : { screen: 0, zone: { ...ZONES[0].zone } };
          let name = tab.title || '';
          try { name = name.length > 2 && name.length < 30 ? name : new URL(tab.url).hostname.replace(/^www\./, ''); } catch { /* keep */ }
          items.push({ id: uid(), kind: 'site', url: tab.url, name, tabs: w.type === 'normal', ...where });
        }
      }
      // everything else, through the helper
      if (await helper.ready(true)) {
        try {
          const [{ windows }, { screens }, { apps: startApps }] = await Promise.all([helper.call('/win/list'), helper.call('/win/screens'), helper.call('/apps/list')]);
          const real = screens.map(s => ({ x: s.wx, y: s.wy, w: s.ww, h: s.wh }));
          const seen = new Set();
          for (const w of windows) {
            const exe = String(w.exe || ''), base = exe.split('\\').pop().toLowerCase();
            if (w.min || base === 'msedge.exe' || base === 'searchhost.exe' || base === 'shellexperiencehost.exe' || base === 'startmenuexperiencehost.exe') continue;
            if (w.w < 120 || w.h < 80) continue;
            const where = w.max ? (() => { const z = toZone(w, real); return { screen: z.screen, zone: { ...ZONES[0].zone } }; })() : toZone(w, real);
            let it = null;
            if (w.folder) it = { kind: 'folder', path: w.folder, name: w.folder.replace(/[\\/]+$/, '').split('\\').pop() || w.folder };
            else {
              const fam = /\\windowsapps\\([^_\\]+)_[^\\]*__([a-z0-9]+)\\/i.exec(exe);
              let app = fam && startApps.find(a => a.id.toLowerCase().startsWith(`${fam[1]}_${fam[2]}!`.toLowerCase()));
              if (!app && base === 'applicationframehost.exe') app = startApps.find(a => w.title === a.name || w.title.endsWith(' - ' + a.name) || w.title.startsWith(a.name + ' - '));
              if (!app) app = startApps.find(a => /\.exe$/i.test(a.id) && a.id.split('\\').pop().toLowerCase() === base);
              if (app) it = { kind: 'app', appId: app.id, name: app.name, exe };
              else if (exe && base !== 'applicationframehost.exe') it = { kind: 'app', path: exe, exe, name: (w.title.split(' - ').pop() || base.replace(/\.exe$/, '')).slice(0, 40) };
            }
            if (!it) continue;
            const key = it.kind === 'folder' ? 'f:' + it.path.toLowerCase() : 'a:' + (it.appId || base);
            if (seen.has(key)) continue;                // one window per program (the one in front)
            seen.add(key);
            items.push({ id: uid(), ...it, ...where });
          }
        } catch (e) { toast(e.message); }
      } else if (!items.length) { toast(helperHint()); return; }
      if (!items.length) { toast('No windows to take: everything is minimised or closed.'); return; }
      const before = c.items;
      c.items = items.reverse();                       // the window in front last, so it is drawn on top
      draw(); save();
      toast(`Took ${items.length} window${items.length > 1 ? 's' : ''} into “${c.title}”.`, 'Undo', () => { c.items = before; draw(); save(); });
      if (await fetchIcons(c.items)) { draw(); save(); }
    }

    takesFiles(map, add);
    body.append(bar, map);
    draw();
    displays().then(s => { scr = s; draw(); });
    fetchIcons(c.items).then(ch => { if (ch) { draw(); save(); } });
  }

  return { apps, space };
};
})();
