// Drives a throwaway headless Edge profile with the Homeboard extension loaded, over CDP.
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [ext, profile] = process.argv.slice(2);
const port = 9339;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass: !!pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + info : '')); };

(async () => {
  const proc = spawn(EDGE.replace(/\\/g, '/'), ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1400,900', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = code => { try { proc.kill(); } catch {} process.exit(code); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 280000);

  let id = 0, buf = ''; const pending = new Map();
  proc.stdio[4].on('data', chunk => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      const p = pending.get(m.id);
      if (!p) continue;
      pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0');
  });
  console.log('Browser:', (await send('Browser.getVersion')).product);

  let extId = null;
  try { extId = (await send('Extensions.loadUnpacked', { path: ext })).id; } catch (e) { console.log(e.message); }
  let swUp = false;
  for (let i = 0; i < 40 && extId && !swUp; i++) {
    const { targetInfos } = await send('Target.getTargets');
    swUp = targetInfos.some(t => t.url === `chrome-extension://${extId}/background.js`);
    if (!swUp) await sleep(250);
  }
  ok('extension loads (manifest accepted, background worker running)', extId && swUp, extId || 'load failed');
  if (!extId) done(1);

  const open = async url => {
    const { targetId } = await send('Target.createTarget', { url });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    return { targetId, sid: sessionId };
  };
  const ev = async (sid, expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const mouse = (sid, type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra }, sid);
  const drag = async (sid, x0, y0, x1, y1) => {
    await mouse(sid, 'mouseMoved', x0, y0, { button: 'none', buttons: 0 });
    await mouse(sid, 'mousePressed', x0, y0);
    for (let i = 1; i <= 8; i++) await mouse(sid, 'mouseMoved', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8);
    await mouse(sid, 'mouseReleased', x1, y1);
  };
  const click = async (sid, x, y) => { await mouse(sid, 'mouseMoved', x, y, { button: 'none', buttons: 0 }); await mouse(sid, 'mousePressed', x, y); await mouse(sid, 'mouseReleased', x, y); };
  const key = async (sid, k, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, sid);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, sid);
  };
  const stored = sid => ev(sid, `chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'] || null)`);
  const rect = (sid, sel) => ev(sid, `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
  const waitFor = async (sid, expr, ms = 8000) => { for (let t = 0; t < ms; t += 200) { if (await ev(sid, expr).catch(() => false)) return true; await sleep(200); } return false; };

  try {
    const base = `chrome-extension://${extId}/index.html`;
    let { sid, targetId } = await open(base);
    ok('board renders in extension page', await waitFor(sid, `document.querySelectorAll('.card').length === 3`));
    ok('default string drawn', await ev(sid, `document.querySelectorAll('.string').length`) === 1);
    ok('uses extension storage', (await ev(sid, `document.querySelector('#storage-note').textContent`)).includes('extension storage'));
    const note = await ev(sid, `document.querySelector('#unblock-note').textContent`);
    ok('embed unblocking active for this tab', note.startsWith('On for this tab'), note.slice(0, 60));
    const rules = await ev(sid, `chrome.declarativeNetRequest.getSessionRules().then(r => r.map(x => ({id:x.id, tabIds:x.condition.tabIds, types:x.condition.resourceTypes})))`);
    ok('session rule is scoped to this tab + sub-frames only', rules.length === 1 && rules[0].tabIds?.length === 1 && rules[0].types.join() === 'sub_frame', JSON.stringify(rules));

    // to-do: add + tick
    await ev(sid, `document.querySelector('.todo-add').focus()`);
    await send('Input.insertText', { text: 'Buy milk' }, sid);
    await key(sid, 'Enter', 13);
    const cb = await rect(sid, '.todo-check');
    await click(sid, cb.x + cb.w / 2, cb.y + cb.h / 2);
    await sleep(500);
    let s = await stored(sid);
    let todo = s.boards[0].cards.find(c => c.type === 'todo');
    ok('to-do: add task + tick saved', todo.items.length === 4 && todo.items[3].text === 'Buy milk' && todo.items[0].done, todo.items.map(i => i.text + (i.done ? '[x]' : '')).join(' | '));

    // note typing
    const nt = await rect(sid, '.note-text');
    await click(sid, nt.x + 30, nt.y + nt.h - 12);
    await send('Input.insertText', { text: ' HELLO-NOTE' }, sid);
    await sleep(500);
    s = await stored(sid);
    const firstNote = s.boards[0].cards.find(c => c.type === 'note');
    ok('note text saved', ((firstNote.markdown ? firstNote.md : firstNote.html) || '').includes('HELLO-NOTE'));

    // drag a card by its header; string follows
    const before = s.boards[0].cards.find(c => c.type === 'links');
    const d0 = await ev(sid, `document.querySelector('.string-wool').getAttribute('d')`);
    const hd = await rect(sid, '.card-links .card-title');
    await drag(sid, hd.x + 40, hd.y + 8, hd.x + 40 + 120, hd.y + 8 + 260);
    await sleep(500);
    s = await stored(sid);
    const after = s.boards[0].cards.find(c => c.type === 'links');
    ok('drag card moves it', Math.round(after.x - before.x) === 120 && Math.round(after.y - before.y) === 260, `dx=${after.x - before.x} dy=${after.y - before.y}`);

    // tie a string: links pin -> to-do card
    const pin = await rect(sid, '.card-links .card-pin');
    const td = await rect(sid, '.card-todo');
    await drag(sid, pin.x + pin.w / 2, pin.y + pin.h / 2, td.x + td.w / 2, td.y + td.h / 2);
    await sleep(500);
    s = await stored(sid);
    ok('pin drag ties a string', s.boards[0].strings.length === 2 && s.boards[0].strings[1].from === after.id && s.boards[0].strings[1].to === todo.id);
    const noteHd = await rect(sid, '.card-note .card-title');
    await drag(sid, noteHd.x + 60, noteHd.y + 8, noteHd.x + 60, noteHd.y + 8 + 80);
    const d1 = await ev(sid, `document.querySelector('.string-wool').getAttribute('d')`);
    ok('string follows a moved card', d0 !== d1);

    // delete with Delete key, then Undo restores card + its strings
    const th = await rect(sid, '.card-todo .card-title');
    await click(sid, th.x + 40, th.y + 8);
    await ev(sid, `document.activeElement.blur()`);
    await key(sid, 'Delete', 46);
    await sleep(300);
    const gone = await ev(sid, `({cards: document.querySelectorAll('.card').length, strings: document.querySelectorAll('.string').length})`);
    await ev(sid, `document.querySelector('#toast button').click()`);
    await sleep(500);
    s = await stored(sid);
    ok('delete removes card and its strings', gone.cards === 2 && gone.strings === 0, JSON.stringify(gone));
    ok('undo restores card and strings', s.boards[0].cards.length === 3 && s.boards[0].strings.length === 2 && await ev(sid, `document.querySelectorAll('.string').length`) === 2);

    // pan + zoom
    await drag(sid, 700, 780, 760, 740);
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 700, deltaX: 0, deltaY: -200, modifiers: 2 }, sid);
    await sleep(500);
    s = await stored(sid);
    ok('pan + ctrl-wheel zoom saved', s.boards[0].view.x !== 0 && s.boards[0].view.z > 1, JSON.stringify(s.boards[0].view));
    await ev(sid, `document.querySelector('#zoom-fit').click()`);

    // boards
    await ev(sid, `document.querySelector('.tab-add').click()`);
    await send('Input.insertText', { text: 'Work' }, sid);
    await key(sid, 'Enter', 13);
    await sleep(400);
    s = await stored(sid);
    ok('new board created and renamed', s.boards.length === 2 && s.boards[1].name === 'Work' && s.active === s.boards[1].id, s.boards.map(b => b.name).join(','));
    await ev(sid, `document.querySelector('.tab').click()`);

    // theme
    await ev(sid, `document.querySelector('.theme[data-theme="neon"]').click()`);
    await sleep(400);
    ok('neon theme applies', await ev(sid, `document.body.dataset.theme === 'neon' && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#00f0ff' && document.body.dataset.pattern === 'grid'`));

    // website window against a site that forbids embedding
    // panels restyle themselves
    await ev(sid, `(() => { const set = (k, v) => { const i = document.querySelector('[data-set="' + k + '"]'); i.value = v; i.dispatchEvent(new Event('input', {bubbles: true})); }; set('radius', 0); set('raise', '#112233'); set('chromeAlpha', 100); })()`);
    const look = await ev(sid, `({r: getComputedStyle(document.querySelector('#settings')).borderRadius, bar: getComputedStyle(document.querySelector('#dock')).borderRadius, bg: getComputedStyle(document.querySelector('#settings')).backgroundColor, btn: getComputedStyle(document.querySelector('.dock-btn')).borderRadius})`);
    ok('panels and bars follow roundness / colour / opacity', look.r === '0px' && look.bar === '0px' && look.btn === '0px' && /17,\s*34,\s*51|0\.0666/.test(look.bg), JSON.stringify(look));
    await ev(sid, `(() => { const i = document.querySelector('[data-set="radius"]'); i.value = 12; i.dispatchEvent(new Event('input', {bubbles: true})); document.querySelector('[data-reset="raise"]').click(); })()`);

    // website window against a site that forbids embedding
    const frameState = async () => {
      const src = await ev(sid, `document.querySelector('.card-web iframe')?.src || ''`);
      const { targetInfos } = await send('Target.getTargets');
      const fr = targetInfos.filter(t => t.type === 'iframe').map(t => t.url);
      let title = '';
      const hit = targetInfos.find(t => t.type === 'iframe' && /^https:\/\/github\.com\//.test(t.url));
      if (hit) {
        const { sessionId } = await send('Target.attachToTarget', { targetId: hit.targetId, flatten: true });
        title = await ev(sessionId, `location.href.slice(0, 30) + " | " + document.title`).catch(() => '');
        await send('Target.detachFromTarget', { sessionId }).catch(() => {});
      }
      return { src, frames: fr, title };
    };
    await ev(sid, `document.querySelector('[data-add="web"]').click()`);
    await send('Input.insertText', { text: 'github.com' }, sid);
    await key(sid, 'Enter', 13);
    await sleep(7000);
    let fr = await frameState();
    ok('site that forbids embedding loads in a website window', (fr.title.startsWith('https://github.com/') && fr.title.includes('| GitHub')), JSON.stringify(fr));
    const hdrs = await ev(sid, `fetch('https://github.com/', {method:'GET'}).then(r => ({xfo: r.headers.get('x-frame-options'), csp: (r.headers.get('content-security-policy')||'').includes('frame-ancestors')})).catch(e => String(e))`);
    console.log('     (github.com really sends:', JSON.stringify(hdrs) + ')');

    // control: switch unblocking off -> same site must now be refused
    await ev(sid, `document.querySelector('#unblock').click()`);
    await sleep(7000);
    fr = await frameState();
    const offRules = await ev(sid, `chrome.declarativeNetRequest.getSessionRules().then(r => r.length)`);
    ok('control: with unblocking off the same site is refused', offRules === 0 && fr.src.includes('github.com') && fr.title.startsWith('chrome-error:'), JSON.stringify(fr) + ' rules=' + offRules);
    await ev(sid, `document.querySelector('#unblock').click()`);
    await sleep(1500);

    // persistence: reload the page
    await send('Page.reload', {}, sid);
    await sleep(1500);
    ok('everything survives a reload', await waitFor(sid, `document.querySelectorAll('.card').length === 4 && document.querySelectorAll('.string').length === 2 && document.body.dataset.theme === 'neon' && document.querySelectorAll('#tabs [data-board]').length === 2`),
      await ev(sid, `JSON.stringify({cards: document.querySelectorAll('.card').length, strings: document.querySelectorAll('.string').length, theme: document.body.dataset.theme})`));

    // rule cleanup when the tab closes
    await send('Target.closeTarget', { targetId });
    await sleep(1200);
    const second = await open(base);
    await waitFor(second.sid, `document.querySelectorAll('.card').length > 0`);
    const left = await ev(second.sid, `chrome.declarativeNetRequest.getSessionRules().then(r => r.length)`);
    ok('closing a board tab removes its rule (only the new tab has one)', left === 1, 'rules=' + left);

    // two tabs: change in one shows up in the other
    const third = await open(base);
    await waitFor(third.sid, `document.querySelectorAll('.card').length > 0`);
    await ev(third.sid, `document.querySelector('[data-add="note"]').click()`);
    await sleep(1200);
    const hiddenBefore = await ev(second.sid, `document.hidden + ' cards=' + document.querySelectorAll('.card').length`);
    await send('Target.activateTarget', { targetId: second.targetId });
    ok('another open tab picks up the change when you switch to it', await waitFor(second.sid, `document.querySelectorAll('.card').length === 5`, 4000), `before switch: hidden=${hiddenBefore}; after: cards=` + await ev(second.sid, `document.querySelectorAll('.card').length`));

    // new-tab override
    try {
      const nt2 = await open('edge://newtab/');
      await sleep(1500);
      const info = await ev(nt2.sid, `({href: location.href, board: !!document.querySelector('#dock')})`);
      ok('edge://newtab shows the board', info.board, JSON.stringify(info));
    } catch (e) { ok('edge://newtab shows the board', false, 'could not check: ' + e.message); }

    // ---- media, clipboard, local files, acrylic (fresh page so earlier counts don't matter) ----
    const m = await open(base);
    await waitFor(m.sid, `document.querySelectorAll('.card').length > 0`);
    await send('Target.activateTarget', { targetId: m.targetId });
    const count = sel => ev(m.sid, `document.querySelectorAll(${JSON.stringify(sel)}).length`);

    await ev(m.sid, `(async () => { const cv = document.createElement('canvas'); cv.width = 200; cv.height = 100; cv.getContext('2d').fillRect(0, 0, 200, 100);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'pic.png', { type: 'image/png' }));
      document.querySelector('#canvas').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: 300, clientY: 700, bubbles: true, cancelable: true })); })()`);
    const imgOk = await waitFor(m.sid, `document.querySelector('.card-media img')?.naturalWidth === 200`);
    await sleep(700);   // saves are debounced
    s = await stored(m.sid);
    const mc = s.boards.find(b => b.id === s.active).cards.find(c => c.type === 'media');
    ok('dropped image becomes a picture on the board', imgOk && mc && mc.mediaId && Math.abs(mc.w / mc.h - 2) < .05 && mc.title === 'pic', JSON.stringify(mc && { w: mc.w, h: mc.h, kind: mc.kind, title: mc.title }));

    await ev(m.sid, `(async () => { const dt = new DataTransfer(); dt.items.add(new File([new Blob(['%PDF-1.4\\n%%EOF'], { type: 'application/pdf' })], 'doc.pdf', { type: 'application/pdf' }));
      document.querySelector('#canvas').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: 600, clientY: 700, bubbles: true, cancelable: true })); })()`);
    ok('dropped PDF opens in its own window card', await waitFor(m.sid, `(document.querySelector('.card-media:not(.frameless) iframe')?.src || '').startsWith('blob:')`));

    // copy / paste a card
    const mh = await rect(m.sid, '.card-todo .card-title');
    await click(m.sid, mh.x + 40, mh.y + 8);
    const copied = await ev(m.sid, `(() => { const dt = new DataTransfer(); document.body.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); window.__dt = dt; return { plain: dt.getData('text/plain'), own: dt.getData('application/x-homeboard-card+json').length }; })()`);
    const todosBefore = await count('.card-todo');
    await ev(m.sid, `document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: window.__dt, bubbles: true, cancelable: true }))`);
    ok('Ctrl+C / Ctrl+V on a selected card pastes a copy', copied.plain.includes('[') && await count('.card-todo') === todosBefore + 1, JSON.stringify(copied).slice(0, 120));
    const paste = text => ev(m.sid, `(() => { document.activeElement?.blur?.(); const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(text)}); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    const notesBefore = await count('.card-note');
    await paste('pasted line one\nline two');
    ok('pasting plain text on the board makes a note', await count('.card-note') === notesBefore + 1 && await ev(m.sid, `[...document.querySelectorAll('.note-text')].some(n => n.textContent.includes('pasted line one'))`));
    await ev(m.sid, `(() => { document.querySelector('.card-note .note-text').click(); const n = document.activeElement; const dt = new DataTransfer(); dt.setData('text/plain', 'INTO-NOTE'); n.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return n.tagName; })()`);
    await send('Input.insertText', { text: 'INTO-NOTE' }, m.sid);
    await sleep(600);
    ok('pasting while typing in a note goes into that note', await count('.card-note') === notesBefore + 1 && await ev(m.sid, `document.activeElement.value.includes('INTO-NOTE')`));

    // local folder in a website window
    const allowed = await ev(m.sid, `chrome.extension.isAllowedFileSchemeAccess()`);
    await paste(ext + '\\');
    await sleep(3500);
    const local = await ev(m.sid, `(() => { const c = [...document.querySelectorAll('.card-web')].pop(); return { field: c.querySelector('.web-url').value, src: c.querySelector('iframe')?.src || '', sandbox: c.querySelector('iframe')?.hasAttribute('sandbox'), title: c.querySelector('.card-title').textContent, msg: c.querySelector('.web-empty')?.textContent || '' }; })()`);
    let listing = '';
    {
      const { targetInfos } = await send('Target.getTargets');
      const t = targetInfos.find(x => x.type === 'iframe' && x.url.startsWith('file:'));
      if (t) { const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true }); listing = await ev(sessionId, `document.title + ' :: ' + document.body.innerText.slice(0, 1200).replace(/\\s+/g, ' ')`).catch(e => 'ERR ' + e.message); }
    }
    console.log('     file access allowed for this extension:', allowed);
    ok('typing a folder path shows that folder', local.src.startsWith('file:///') && local.sandbox === false && /app\.js/.test(listing), JSON.stringify(local) + ' listing=' + listing.slice(0, 160));

    // PDF link: frame must not be sandboxed (the built-in viewer refuses sandboxed frames)
    await paste('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
    await sleep(600);
    const pdf = await ev(m.sid, `(() => { const f = [...document.querySelectorAll('.card-web iframe')].pop(); return { src: f.src, sandbox: f.hasAttribute('sandbox') }; })()`);
    ok('PDF address is given to the browser PDF viewer (no sandbox)', pdf.src.endsWith('.pdf') && pdf.sandbox === false, JSON.stringify(pdf));

    // acrylic
    await ev(m.sid, `document.querySelector('.theme[data-theme="acrylic"]').click()`);
    await sleep(500);
    const ac = await ev(m.sid, `(async () => ({ theme: document.body.dataset.theme, blur: getComputedStyle(document.querySelector('.card-todo')).backdropFilter, bg: getComputedStyle(document.querySelector('#backdrop')).backgroundImage.includes('wallpaper.jpg'), wall: (await fetch('wallpaper.jpg')).ok, alpha: getComputedStyle(document.documentElement).getPropertyValue('--card-alpha').trim() }))()`);
    ok('acrylic theme: 30px blur, translucent cards, wallpaper backdrop', ac.theme === 'acrylic' && /blur\(30px\)/.test(ac.blur) && ac.bg && ac.wall && ac.alpha === '56%', JSON.stringify(ac));

    // media survives a reload, and travels in the backup
    await sleep(600);
    await send('Page.reload', {}, m.sid);
    await sleep(1500);
    ok('picture survives a reload', await waitFor(m.sid, `document.querySelector('.card-media img')?.naturalWidth === 200`));
    const exp = await ev(m.sid, `(async () => { const orig = URL.createObjectURL; let got = null; URL.createObjectURL = b => { got = b; return 'blob:x'; }; const a = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = () => {}; document.querySelector('#export').click(); for (let i = 0; i < 40 && !got; i++) await new Promise(r => setTimeout(r, 100)); URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = a; if (!got) return null; window.__backup = await got.text(); const j = JSON.parse(window.__backup); return { files: Object.keys(j.media).length, cards: j.boards.reduce((n, b) => n + b.cards.length, 0) }; })()`);
    ok('backup contains the media files', exp && exp.files === 2, JSON.stringify(exp));
    await ev(m.sid, `(async () => { await new Promise(r => { const q = indexedDB.open('homeboard-media'); q.onsuccess = () => { const t = q.result.transaction('files', 'readwrite'); t.objectStore('files').clear(); t.oncomplete = () => { q.result.close(); r(); }; }; }); window.confirm = () => true; const dt = new DataTransfer(); dt.items.add(new File([window.__backup], 'b.json', { type: 'application/json' })); const i = document.querySelector('#import-file'); i.files = dt.files; i.dispatchEvent(new Event('change')); })()`);
    await sleep(1500);
    await send('Page.reload', {}, m.sid);
    await sleep(1500);
    ok('importing the backup restores the pictures', await waitFor(m.sid, `document.querySelector('.card-media img')?.naturalWidth === 200`, 5000), 'cards=' + await count('.card'));

    // ---- widgets: pool table + cigarette pack, on a board of their own ----
    await ev(m.sid, `window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));`);
    await ev(m.sid, `document.querySelector('.theme[data-theme="graphite"]').click(); document.querySelector('#settings').hidden = true; document.querySelector('.tab-add').click()`);
    await send('Input.insertText', { text: 'Play' }, m.sid);
    await key(m.sid, 'Enter', 13);
    const menuPick = label => ev(m.sid, `(() => { document.querySelector('[data-add="widget"]').click(); const b = [...document.querySelectorAll('#menu .menu-item')].find(x => x.textContent.trim() === ${JSON.stringify(label)}); b && b.click(); return !!b; })()`);
    const active = async () => { const st = await stored(m.sid); return st.boards.find(b => b.id === st.active); };

    ok('widgets menu offers the pool table', await menuPick('Pool table') && await waitFor(m.sid, `!!document.querySelector('.card-widget canvas')`));
    await sleep(600);
    const map = await ev(m.sid, `(() => { const cv = document.querySelector('.card-widget canvas'), r = cv.getBoundingClientRect(); const s = Math.min(r.width / 1080, r.height / 580); const ox = (r.width - 1080 * s) / 2 + 40 * s, oy = (r.height - 580 * s) / 2 + 40 * s; const lit = (() => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i]) n++; return n; })(); return { x: r.x + ox, y: r.y + oy, s, lit }; })()`);
    const T = (x, y) => [map.x + x * map.s, map.y + y * map.s];
    ok('pool table is drawn', map.lit > 50, 'sampled opaque pixels=' + map.lit);
    {
      const [x0, y0] = T(640, 250), [x1, y1] = T(440, 250);       // aim at the rack, pull straight back for full power
      await drag(m.sid, x0, y0, x1, y1);
    }
    await sleep(400);
    const rolling = await ev(m.sid, `document.querySelector('.card-widget canvas').getAttribute('aria-label')`);
    let broke = null;
    for (let i = 0; i < 60; i++) {                                   // wait for the break to settle and be saved
      await send('Page.bringToFront', {}, m.sid);              // a hidden page pauses animation
      await sleep(500);
      const g = (await active()).cards.find(c => c.widget === 'pool');
      if (g && g.data && !g.data.breakShot) { broke = g.data; break; }
    }
    const moved = broke ? broke.balls.filter(b => b[0] > 0 && (Math.abs(b[1] - 720) > 60 || !b[3])).length : 0;
    ok('break shot: balls scatter, rules resolve, game is saved', broke && moved >= 6, broke ? `moved=${moved} turn=${broke.turn} potted=${broke.balls.filter(b => !b[3]).map(b => b[0])} status-while-rolling="${rolling}"` : 'never settled');
    let cpu = null;
    for (let i = 0; i < 80; i++) {                                   // let the computer take its turn(s) if it has one
      await send('Page.bringToFront', {}, m.sid);
      await sleep(500);
      const g = (await active()).cards.find(c => c.widget === 'pool');
      const text = await ev(m.sid, `document.querySelector('.card-widget canvas').getAttribute('aria-label')`);
      if (g.data.winner != null || (g.data.turn === 0 && !/thinking/.test(text) && text)) { cpu = { data: g.data, text }; break; }
    }
    ok('computer plays and hands the table back (or the game ends)', cpu, cpu ? cpu.text : 'still waiting');

    ok('widgets menu offers the cigarette pack', await menuPick('Cigarette pack') && await waitFor(m.sid, `!!document.querySelector('.pack')`));
    await ev(m.sid, `document.querySelector('.pack-lid').click()`);
    await sleep(700);
    await ev(m.sid, `document.querySelector('.pack-tips').click()`);
    const took = await ev(m.sid, `({ open: document.querySelector('.pack').classList.contains('open'), tips: document.querySelectorAll('.pack-tip:not([hidden])').length, cig: !!document.querySelector('.cig'), info: document.querySelector('.pack-count').textContent, bare: document.querySelector('.pack').closest('.card').classList.contains('bare') })`);
    await ev(m.sid, `document.querySelector('.cig').click()`);
    await sleep(700);
    const pk = (await active()).cards.find(c => c.widget === 'pack');
    ok('pack opens, a cigarette comes out and lights, count drops', took.open && took.bare && took.tips === 19 && took.cig && took.info === '19' && pk.data.count === 19 && pk.data.smoked === 1 && pk.data.out.lit === true && pk.data.out.at > 0 && await ev(m.sid, `!!document.querySelector('.cig.lit')`), JSON.stringify(took) + ' saved=' + JSON.stringify(pk.data));

    // looks: drop a picture next to them and photograph each theme
    await ev(m.sid, `(async () => { const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200; const x = cv.getContext('2d'); const g = x.createLinearGradient(0, 0, 320, 200); g.addColorStop(0, '#ff7a59'); g.addColorStop(1, '#5b6cff'); x.fillStyle = g; x.fillRect(0, 0, 320, 200); x.fillStyle = '#fff'; x.font = '700 40px sans-serif'; x.fillText('photo', 100, 115);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'photo.png', { type: 'image/png' }));
      document.querySelector('#canvas').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: 240, clientY: 210, bubbles: true, cancelable: true })); })()`);
    await sleep(900);
    await ev(m.sid, `document.querySelector('#zoom-fit').click()`);
    const shotsDir = process.argv[4];
    if (shotsDir) {
      require('fs').mkdirSync(shotsDir, { recursive: true });
      for (const theme of ['graphite', 'neon', 'acrylic']) {
        await ev(m.sid, `document.querySelector('.theme[data-theme="${theme}"]').click(); document.querySelector('#settings').hidden = true; document.querySelector('.card-widget canvas').dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0 }))`);
        await sleep(900);
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, m.sid);
        require('fs').writeFileSync(require('path').join(shotsDir, theme + '.png'), Buffer.from(data, 'base64'));
      }
    }
    const pageErrs = await ev(m.sid, `JSON.stringify(window.__errs || [])`).catch(() => '[]');
    ok('no script errors while playing', pageErrs === '[]', pageErrs);
    await send('Page.reload', {}, m.sid);
    await sleep(1500);
    const back = await ev(m.sid, `(() => { const b = document.querySelector('.cig.lit .cig-burn'); return { lit: !!b, delay: b ? parseFloat(b.style.animationDelay) : 0, info: document.querySelector('.pack-count')?.textContent, pool: !!document.querySelector('.card-widget canvas') }; })()`);
    ok('after a reload the cigarette is still burning from where it was, and the pool game is back', back.lit && back.delay < -1 && back.info.startsWith('19') && back.pool, JSON.stringify(back));

    // everything else lives on the right-click menu
    await send('Page.bringToFront', {}, m.sid);
    const rightClick = sel => ev(m.sid, `(() => { const e = document.querySelector(${JSON.stringify(sel)}), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); return [...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim()); })()`);
    const choose = label => ev(m.sid, `(() => { const b = [...document.querySelectorAll('#menu .menu-item')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    const packData = async () => (await active()).cards.find(c => c.widget === 'pack').data;
    const items = await rightClick('.pack-front');
    const picked = await choose('Change pack') && await ev(m.sid, `(() => { const b = document.querySelector('.vend-slot[data-skin="sgventil"]'); if (b) b.click(); return !!b && document.querySelectorAll('.vend-slot').length > 10; })()`);
    await sleep(2400);   // the pack drops into the machine's tray first
    ok('right-click menu changes the pack design', picked && items.includes('New pack of 20') && (await packData()).skin === 'sgventil' && await ev(m.sid, `document.querySelector('.pack').dataset.skin === 'sgventil' && document.querySelector('.pack-front svg').textContent.includes('VENTIL')`), items.join(' | ').slice(0, 160));

    await rightClick('.pack-front'); await choose('Burn only while I hold it');
    await sleep(500);
    const p0 = await packData();
    const cg = await rect(m.sid, '.cig-filter');
    await mouse(m.sid, 'mouseMoved', cg.x + cg.w / 2, cg.y + cg.h / 2, { button: 'none', buttons: 0 });
    await mouse(m.sid, 'mousePressed', cg.x + cg.w / 2, cg.y + cg.h / 2);
    await sleep(600);
    const burningNow = await ev(m.sid, `document.querySelector('.cig').classList.contains('puff')`);
    await sleep(1600);
    await mouse(m.sid, 'mouseReleased', cg.x + cg.w / 2, cg.y + cg.h / 2);
    await sleep(500);
    const p1 = await packData();
    await sleep(1500);
    const p2 = await packData();
    ok('hold mode: burns only while pressed', p0.hold && p0.out.at === 0 && burningNow && p1.out.p > p0.out.p + .08 && p1.out.at === 0 && p2.out.p === p1.out.p && await ev(m.sid, `!document.querySelector('.cig').classList.contains('puff')`),
      `before=${p0.out.p.toFixed(3)} after-hold=${p1.out.p.toFixed(3)} later=${p2.out.p.toFixed(3)}`);
    await ev(m.sid, `document.querySelector('.cig').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    await sleep(1500);
    const p3 = await packData();
    ok('double-click finishes the cigarette', p3.out === null && p3.count === 19 && await ev(m.sid, `!document.querySelector('.cig')`), JSON.stringify({ out: p3.out, count: p3.count, smoked: p3.smoked }));

    await rightClick('.card-widget canvas');
    const tablePicked = await choose('Change table') && await choose('Tournament blue');
    await sleep(500);
    const poolCard = (await active()).cards.find(c => c.widget === 'pool');
    ok('right-click menu changes the pool table, and the table has no frame', tablePicked && poolCard.data.skin === 'blue' && await ev(m.sid, `document.querySelector('.card-widget canvas').closest('.card').classList.contains('bare')`), 'skin=' + poolCard.data.skin);

    // ---- to-do details, folder links, file browser, board tree ----
    await ev(m.sid, `window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));`);
    await ev(m.sid, `document.querySelector('.tab').click()`);
    await sleep(600);
    const typeInto = async (sel, text) => { await ev(m.sid, `document.querySelector(${JSON.stringify(sel)}).focus()`); await send('Input.insertText', { text }, m.sid); await key(m.sid, 'Enter', 13); };
    const firstBoard = async () => (await stored(m.sid)).boards[0];

    await ev(m.sid, `document.querySelector('.card-todo .todo-more').click()`);
    await typeInto('.card-todo .todo-detail input[aria-label="Add a step"]', 'Step one');
    await ev(m.sid, `(() => { const set = (sel, v, evt) => { const e = document.querySelector('.card-todo .todo-detail ' + sel); e.value = v; e.dispatchEvent(new Event(evt, { bubbles: true })); };
      set('.todo-note', 'remember the receipt', 'input'); set('input[aria-label="Link"]', 'example.org/page', 'change'); set('input[type="date"]', '2030-01-02', 'change'); document.querySelector('.card-todo .todo-star').click(); })()`);
    await sleep(600);
    const task = (await firstBoard()).cards.find(c => c.type === 'todo').items[0];
    const chips = await ev(m.sid, `document.querySelector('.card-todo .todo-meta').textContent`);
    ok('to-do details: step, note, link, due date and star are saved and shown', task.steps.length === 1 && task.steps[0].text === 'Step one' && task.note === 'remember the receipt' && task.link === 'https://example.org/page' && task.due === '2030-01-02' && task.star && /0\/1 steps/.test(chips) && /example\.org/.test(chips), chips);

    await ev(m.sid, `(() => { document.querySelector('.card-links .link-add').click(); const f = document.querySelector('.card-links .link-form'), [url, name] = f.querySelectorAll('input'), how = f.querySelector('select');
      url.value = ${JSON.stringify(ext + '\\')}; url.dispatchEvent(new Event('input', { bubbles: true })); window.__howShown = !how.hidden; how.value = 'explorer'; name.value = 'Project folder'; f.requestSubmit(); })()`);
    await sleep(600);
    const lk = (await firstBoard()).cards.find(c => c.type === 'links').links.pop();
    ok('links: a folder can be added, with the choice of File Explorer', lk.url.startsWith('file:///') && lk.how === 'explorer' && lk.title === 'Project folder' && await ev(m.sid, `window.__howShown && !![...document.querySelectorAll('.card-links .link-tile')].find(a => a.textContent.includes('Project folder'))?.querySelector('svg')`), JSON.stringify(lk));

    await ev(m.sid, `document.querySelector('[data-add="files"]').click()`);
    await send('Input.insertText', { text: ext }, m.sid);
    await key(m.sid, 'Enter', 13);
    const listed = await waitFor(m.sid, `document.querySelectorAll('.card-files .files-row').length > 5`);
    await ev(m.sid, `[...document.querySelectorAll('.card-files .files-row')].find(r => r.dataset.name === 'wallpaper.jpg').click()`);
    const seen = await waitFor(m.sid, `document.querySelector('.card-files .files-stage img')?.naturalWidth > 100`);
    await ev(m.sid, `[...document.querySelectorAll('.card-files .files-row')].find(r => r.dataset.name === 'manifest.json').click()`);
    const read = await waitFor(m.sid, `(document.querySelector('.card-files .files-text')?.textContent || '').includes('manifest_version')`);
    await ev(m.sid, `[...document.querySelectorAll('.card-files .files-row')].find(r => r.dataset.name === 'dev').click()`);
    const inside = await waitFor(m.sid, `!!document.querySelector('.card-files .files-row[data-name="exttest.js"]')`);
    await sleep(500);
    const fcard = (await firstBoard()).cards.find(c => c.type === 'files');
    ok('file browser: lists a typed folder, previews a picture and a text file, opens subfolders', listed && seen && read && inside && /\/dev\/$/.test(fcard.path), 'path=' + fcard.path);

    const boardsBefore = (await stored(m.sid)).boards.length;
    await ev(m.sid, `document.querySelector('[data-board] .tab-plus').click()`);
    await send('Input.insertText', { text: 'Inside' }, m.sid);
    await key(m.sid, 'Enter', 13);
    await sleep(500);
    let st2 = await stored(m.sid);
    const kid = st2.boards[st2.boards.length - 1];
    ok('boards: a board can be created inside another', st2.boards.length === boardsBefore + 1 && kid.name === 'Inside' && kid.parent === st2.boards[0].id && st2.active === kid.id && await ev(m.sid, `document.querySelector('[data-board="${kid.id}"]').style.getPropertyValue('--depth') === '1'`), `parent=${kid.parent}`);
    const row = `[data-board="${kid.id}"]`;
    await rightClick(row); await choose('Notes panel on the side');
    await sleep(300);
    await ev(m.sid, `document.querySelector('#side-text').focus()`);
    await send('Input.insertText', { text: 'side note text' }, m.sid);
    await rightClick(row); await choose('Show a page');
    await sleep(400);
    await typeInto('#page .web-url', ext + '\\manifest.json');
    await sleep(900);
    st2 = await stored(m.sid);
    const kid2 = st2.boards.find(b => b.id === kid.id);
    const shown = await ev(m.sid, `({ side: !document.querySelector('#side').hidden, page: !document.querySelector('#page').hidden, text: (document.querySelector('#page .files-text')?.textContent || '').includes('manifest_version'), dock: getComputedStyle(document.querySelector('#dock')).display })`);
    ok('boards: notes panel and page-instead-of-cards both work and are saved', kid2.side && kid2.sideHtml.includes('side note text') && kid2.kind === 'file' && kid2.page.url.endsWith('/manifest.json') && shown.side && shown.page && shown.text && shown.dock === 'none', JSON.stringify(shown));
    await rightClick(row); await choose('Delete board');
    await sleep(400);
    const afterDelete = (await stored(m.sid)).boards.length;
    await ev(m.sid, `document.querySelector('#toast button').click()`);
    await sleep(400);
    ok('boards: delete and undo', afterDelete === boardsBefore && (await stored(m.sid)).boards.length === boardsBefore + 1, `after delete=${afterDelete}`);
    const errs2 = await ev(m.sid, `JSON.stringify(window.__errs || [])`).catch(() => '[]');
    ok('no script errors in the new features', errs2 === '[]', errs2);

    // ---- clock, small games, website quick starts ----
    await ev(m.sid, `window.__errs = []; document.querySelector('.tab-add').click()`);
    await send('Input.insertText', { text: 'Games' }, m.sid);
    await key(m.sid, 'Enter', 13);
    await sleep(400);
    const offered = await ev(m.sid, `(() => { document.querySelector('[data-add="widget"]').click(); const l = [...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim()); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return l; })()`);
    for (const name of ['Clock', '2048', 'Minesweeper', 'Sudoku', 'Sliding puzzle']) await menuPick(name);
    await sleep(1500);
    const wdata = async id => (await active()).cards.find(c => c.widget === id)?.data;
    ok('widgets menu lists the clock and the games', ['Clock', '2048', 'Minesweeper', 'Sudoku', 'Sliding puzzle', 'Pool table', 'Cigarette pack'].every(n => offered.includes(n)) && await ev(m.sid, `document.querySelectorAll('.card.bare').length === 5`), offered.join(', '));

    const handAt = () => ev(m.sid, `document.querySelector('.clock-widget .cs').getAttribute('transform')`);
    const h1 = await handAt(); await sleep(1300); const h2 = await handAt();
    await rightClick('.clock-widget'); await choose('Change clock'); await choose('LED');
    await sleep(400);
    ok('clock ticks and changes skin', h1 !== h2 && (await wdata('clock')).skin === 'led' && await ev(m.sid, `/^\\d\\d:\\d\\d$/.test(document.querySelector('.clock-digits.led .clock-time').textContent)`), `${h1} -> ${h2}`);

    const t0 = JSON.stringify((await wdata('g2048')).tiles);
    await ev(m.sid, `document.querySelector('.g48').focus()`);
    for (const [k, vk] of [['ArrowLeft', 37], ['ArrowUp', 38], ['ArrowRight', 39], ['ArrowDown', 40]]) { await key(m.sid, k, vk); await sleep(170); }
    await sleep(700);   // saves are debounced
    const g = await wdata('g2048');
    const total = a => a.reduce((n, t) => n + t[0], 0);
    ok('2048: arrow keys slide the tiles and new ones appear', JSON.stringify(g.tiles) !== t0 && total(g.tiles) > total(JSON.parse(t0)) && g.tiles.every(t => t[1] >= 0 && t[1] < 4 && t[2] >= 0 && t[2] < 4)
      && new Set(g.tiles.map(t => t[1] * 4 + t[2])).size === g.tiles.length, `tiles=${JSON.stringify(g.tiles)} score=${g.score}`);

    await ev(m.sid, `document.querySelectorAll('.ms-cell')[40].click()`);
    await sleep(300);
    const flagged = await ev(m.sid, `(() => { const c = [...document.querySelectorAll('.ms-cell')].find(x => !x.classList.contains('open')); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); return { flag: c.textContent, menu: !document.querySelector('#menu').hidden, open: document.querySelectorAll('.ms-cell.open').length }; })()`);
    await sleep(700);
    const md = await wdata('mines');
    ok('minesweeper: first click is safe and opens an area, right-click flags', flagged.open >= 9 && flagged.flag === '⚑' && !flagged.menu && md.started && !md.over && md.cells.filter(b => b & 1).length === 10 && md.cells.filter(b => b & 4).length === 1, JSON.stringify(flagged));

    const sd = await wdata('sudoku');
    const valid = [0, 1, 2, 3, 4, 5, 6, 7, 8].every(k => [
      sd.sol.slice(k * 9, k * 9 + 9), sd.sol.filter((_, i) => i % 9 === k), sd.sol.filter((_, i) => Math.floor(i / 27) === Math.floor(k / 3) && Math.floor(i % 9 / 3) === k % 3),
    ].every(unit => unit.slice().sort().join('') === '123456789'));
    const givens = sd.puz.filter(Boolean).length, blank = sd.puz.indexOf(0);
    await ev(m.sid, `document.querySelectorAll('.sdk-cell')[${blank}].click()`);
    await key(m.sid, String(sd.sol[blank]), 48 + sd.sol[blank]);
    await sleep(700);
    const sd2 = await wdata('sudoku');
    ok('sudoku: a valid puzzle is generated and typing fills a square', valid && givens >= 26 && givens <= 45 && sd.puz.every((v, i) => !v || v === sd.sol[i]) && sd2.val[blank] === sd.sol[blank]
      && await ev(m.sid, `!document.querySelectorAll('.sdk-cell')[${blank}].classList.contains('bad') && document.querySelectorAll('.card').length === 5`), `givens=${givens}`);

    const sl = await wdata('slider');
    const gap = sl.order.indexOf(0), nb = gap % 4 ? gap - 1 : gap + 1;
    await ev(m.sid, `document.querySelector('.sld-tile[data-id="${sl.order[nb]}"]').click()`);
    await sleep(700);
    const sl2 = await wdata('slider');
    ok('sliding puzzle: a tile next to the gap slides into it', sl.order.slice().sort((a, b) => a - b).every((v, i) => v === i) && sl2.order[gap] === sl.order[nb] && sl2.order[nb] === 0 && sl2.moves === 1, `gap ${gap} -> ${sl2.order.indexOf(0)}`);

    // website window: words are searched, chips open or search a site, and logins come along
    await ev(m.sid, `document.querySelector('[data-add="web"]').click()`);
    const chipNames = await ev(m.sid, `[...document.querySelectorAll('.card-web .web-site')].map(b => b.textContent)`);
    await ev(m.sid, `(() => { const i = document.querySelector('.card-web .web-url'); i.value = 'pool rules'; [...document.querySelectorAll('.card-web .web-site')].find(b => b.textContent === 'Wikipedia').click(); })()`);
    await sleep(400);
    const wikiSrc = await ev(m.sid, `document.querySelector('.card-web iframe')?.src || ''`);
    await ev(m.sid, `document.querySelector('.card-web .web-url').focus(); document.querySelector('.card-web .web-url').value = ''`);
    await send('Input.insertText', { text: 'second search' }, m.sid);
    await key(m.sid, 'Enter', 13);
    await sleep(400);
    const again = await ev(m.sid, `document.querySelector('.card-web iframe')?.src || ''`);
    ok('website window: quick starts and plain-word searches', chipNames.includes('YouTube Music') && /wikipedia\.org\/w\/index\.php\?search=pool%20rules$/.test(wikiSrc) && /wikipedia\.org\/w\/index\.php\?search=second%20search$/.test(again), wikiSrc + ' | ' + again);
    const errs3 = await ev(m.sid, `JSON.stringify(window.__errs || [])`).catch(() => '[]');
    ok('no script errors in the clock and games', errs3 === '[]', errs3);

    // ---- looks, hidden cards, locked notes, cue rack ----
    await send('Page.bringToFront', {}, m.sid);
    await ev(m.sid, `window.__errs = []; document.querySelector('.tab').click()`);
    await sleep(600);
    await ev(m.sid, `document.querySelector('[data-add="note"]').click()`);
    await send('Input.insertText', { text: 'secret words here' }, m.sid);
    await sleep(700);
    const noteId = (await firstBoard()).cards.filter(c => c.type === 'note').pop().id;
    const card = `.card[data-id="${noteId}"]`;
    const noteData = async () => (await firstBoard()).cards.find(c => c.id === noteId);
    await rightClick(card + ' .card-head'); await choose('Hide the contents'); await choose('Until I point at it');
    await mouse(m.sid, 'mouseMoved', 5, 300, { button: 'none', buttons: 0 });   // the pointer must not rest on the card, or it shows
    await sleep(500);
    ok('a card can hide its contents until pointed at', (await noteData()).veil === 'hover' && await ev(m.sid, `document.querySelector(${JSON.stringify(card)}).classList.contains('veil-hover') && getComputedStyle(document.querySelector(${JSON.stringify(card + ' .card-body')})).filter.startsWith('blur')`));

    const submitLock = pw => ev(m.sid, `(() => { const f = document.querySelector(${JSON.stringify(card + ' .lock-form')}); f.querySelectorAll('input').forEach(i => { i.value = ${JSON.stringify(pw)}; }); f.requestSubmit(); })()`);
    await rightClick(card + ' .card-head'); await choose('Lock with a password');
    await submitLock('test-pass-123');
    await sleep(1800);
    const lockedNote = await noteData(), allSaved = JSON.stringify(await stored(m.sid));
    ok('locked note: only encrypted text is saved', !!lockedNote.lock && lockedNote.html === '' && !allSaved.includes('secret words here') && await ev(m.sid, `!!document.querySelector(${JSON.stringify(card + ' .lock-form')}) && !document.querySelector(${JSON.stringify(card + ' .note-text')})`), `lock=${!!lockedNote.lock}`);
    await submitLock('not-the-password');
    await sleep(1200);
    const refused = await ev(m.sid, `document.querySelector(${JSON.stringify(card + ' .hint')})?.textContent || ''`);
    await submitLock('test-pass-123');
    await sleep(1500);
    ok('locked note: wrong password refused, right one opens it', /does not open/.test(refused) && await ev(m.sid, `(document.querySelector(${JSON.stringify(card + ' .note-text')})?.textContent || '').includes('secret words here')`), refused);

    await ev(m.sid, `document.querySelector('#settings-btn').click(); document.querySelector('.theme[data-theme="acrylic"]').click(); document.querySelector('#look-save').click()`);
    await send('Input.insertText', { text: 'Chill' }, m.sid);
    await key(m.sid, 'Enter', 13);
    await ev(m.sid, `document.querySelector('.theme[data-theme="graphite"]').click()`);
    await sleep(600);
    let lk2 = await stored(m.sid);
    const savedLook = lk2.looks.length === 1 && lk2.looks[0].name === 'Chill' && lk2.looks[0].s.theme === 'acrylic' && lk2.settings.theme === 'graphite';
    await ev(m.sid, `document.querySelector('.look-row .icon-btn').click()`);          // pin it to this board
    await sleep(400);
    const worn = await ev(m.sid, `document.body.dataset.theme`);
    await ev(m.sid, `document.querySelectorAll('#tabs [data-board]')[1].click()`);
    await sleep(500);
    const elsewhere = await ev(m.sid, `document.body.dataset.theme`);
    await ev(m.sid, `document.querySelector('.tab').click()`);
    await sleep(500);
    lk2 = await stored(m.sid);
    ok('looks: save one, keep the general look, pin the saved one to a board', savedLook && worn === 'acrylic' && elsewhere === 'graphite' && await ev(m.sid, `document.body.dataset.theme`) === 'acrylic' && lk2.boards[0].look === lk2.looks[0].id,
      `saved=${savedLook} board=${worn} other=${elsewhere}`);
    await ev(m.sid, `document.querySelector('.look-row .icon-btn').click(); document.querySelector('#settings').hidden = true`);

    await ev(m.sid, `[...document.querySelectorAll('#tabs [data-board]')].find(t => t.querySelector('.tab-name').textContent === 'Play').click()`);
    await sleep(700);
    await rightClick('.card-widget canvas');
    const rack = await choose('Choose a cue') && await ev(m.sid, `(() => { const n = document.querySelectorAll('.rack-slot').length; document.querySelector('.rack-slot[data-cue="carbon"]').click(); return n; })()`);
    await sleep(600);
    ok('pool: a cue is chosen from the rack', rack >= 9 && (await active()).cards.find(c => c.widget === 'pool').data.stick === 'carbon' && await ev(m.sid, `!document.querySelector('.hb-modal')`), 'cues=' + rack);
    const errs4 = await ev(m.sid, `JSON.stringify(window.__errs || [])`).catch(() => '[]');
    ok('no script errors in looks, locks and pickers', errs4 === '[]', errs4);

    // ---- offline ----
    await send('Page.bringToFront', {}, m.sid);
    await ev(m.sid, `window.__errs = []; document.querySelector('.tab').click()`);
    await sleep(800);
    const favKeys = () => ev(m.sid, `new Promise(res => { const q = indexedDB.open('homeboard-media'); q.onsuccess = () => { const r = q.result.transaction('files').objectStore('files').getAllKeys(); r.onsuccess = () => { q.result.close(); res(r.result.filter(k => String(k).startsWith('fav:'))); }; }; q.onerror = () => res([]); })`);
    let icons = [];
    for (let i = 0; i < 16 && !icons.length; i++) { await sleep(500); icons = await favKeys(); }
    // a picture that lives on the web gets a local copy
    await ev(m.sid, `(() => { const dt = new DataTransfer(); dt.setData('text/uri-list', 'https://www.wikipedia.org/static/apple-touch/wikipedia.png'); document.querySelector('#canvas').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: 420, clientY: 760, bubbles: true, cancelable: true })); })()`);
    let webPic = null;
    for (let i = 0; i < 20; i++) { await sleep(500); webPic = (await firstBoard()).cards.find(c => c.type === 'media' && c.title === 'wikipedia.org'); if (webPic && webPic.mediaId) break; }
    if (!webPic) console.log('     (skipped: the test picture on wikipedia.org could not be reached)');
    else ok('a picture dropped from the web is copied to this computer', !!webPic.mediaId && !webPic.src, JSON.stringify({ mediaId: !!webPic.mediaId, src: webPic.src }));

    await send('Network.enable', {}, m.sid);
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, m.sid);
    await sleep(500);
    await ev(m.sid, `document.querySelectorAll('#tabs [data-board]')[1].click()`);
    await sleep(400);
    await ev(m.sid, `document.querySelector('.tab').click()`);
    await sleep(1500);
    const off = await ev(m.sid, `(() => { const s = document.querySelector('#search-input'); s.value = 'cats'; document.querySelector('#search').requestSubmit(); return {
      online: navigator.onLine, chip: !document.querySelector('#offline').hidden,
      waiting: [...document.querySelectorAll('.card-web .web-empty')].filter(e => e.textContent.includes('offline')).length,
      icons: [...document.querySelectorAll('.card-links .link-ico img')].filter(i => i.src.startsWith('blob:') && i.naturalWidth > 0).length,
      picture: [...document.querySelectorAll('.card-media img')].filter(i => i.src.startsWith('blob:') && i.naturalWidth > 0).length,
      stayed: location.href.startsWith('chrome-extension://'), toast: document.querySelector('#toast').textContent }; })()`);
    ok('offline: marker shown, website windows wait, search stays on the board', off.online === false && off.chip && off.waiting >= 1 && off.stayed && /offline/.test(off.toast), JSON.stringify(off).slice(0, 300));
    ok('offline: link icons and pictures come from the copies on this computer', icons.length >= 1 && off.icons >= 1 && off.picture >= 1, `icons kept=${icons.length} shown=${off.icons} pictures=${off.picture}`);
    await ev(m.sid, `document.querySelector('[data-add="note"]').click()`);
    await send('Input.insertText', { text: 'written offline' }, m.sid);
    await sleep(700);
    ok('offline: notes still save', JSON.stringify(await stored(m.sid)).includes('written offline'));
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, m.sid);
    await sleep(1500);
    const on = await ev(m.sid, `({ chip: !document.querySelector('#offline').hidden, frames: document.querySelectorAll('.card-web iframe').length, waiting: [...document.querySelectorAll('.card-web .web-empty')].filter(e => e.textContent.includes('offline')).length })`);
    ok('back online: the marker goes and website windows reload by themselves', !on.chip && on.frames >= 1 && on.waiting === 0, JSON.stringify(on));
    const errs5 = await ev(m.sid, `JSON.stringify(window.__errs || [])`).catch(() => '[]');
    ok('no script errors offline', errs5 === '[]', errs5);

    const errs = await ev(second.sid, `chrome.runtime.lastError ? String(chrome.runtime.lastError.message) : ''`);
    if (errs) console.log('runtime.lastError:', errs);
  } catch (e) {
    console.log('ERROR', e.stack || e.message);
    done(1);
  }
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  done(failed ? 1 : 0);
})();
