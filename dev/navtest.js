// Moving around the board (real wheel events), expanding cards, card text size, the Apps and Workspace cards,
// and a site's own window shown live in its card. Run from PowerShell:
//   node dev/navtest.js C:\Users\Pedro\Homeboard <new empty profile folder> [screenshot folder]
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run',
    '--auto-select-tab-capture-source-by-title=Example Domain', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 170000);
  let id = 0, buf = ''; const pending = new Map();
  proc.stdio[4].on('data', chunk => {
    buf += chunk.toString('utf8'); let i;
    while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const p = pending.get(m.id); if (!p) continue; pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  try {
    const r = await send('Extensions.loadUnpacked', { path: ext });
    const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${r.id}/index.html` });
    const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    const key = async (k, vk, extra = {}) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: extra.code || k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...extra }, sid); };
    const wheel = (x, y, dy, extra = {}) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: extra.dx || 0, deltaY: dy, modifiers: extra.mod || 0 }, sid);
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: extra.button || 'left', buttons: extra.buttons ?? 1, clickCount: 1, ...extra }, sid);
    const view = () => ev(`(() => { const m = /translate\\(([-\\d.e]+)px, ([-\\d.e]+)px\\) scale\\(([-\\d.e]+)\\)/.exec(document.querySelector('#world').style.transform); return m ? { x: +m[1], y: +m[2], z: +m[3] } : null; })()`);
    const stored = () => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`);
    const shot = async name => { if (!outDir) return; const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64')); };
    await sleep(2200);
    const long = Array.from({ length: 60 }, (_, i) => `- line ${i + 1} of a long note`).join('\\n');
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
        { id: 'n1', type: 'note', title: 'Short', x: 60, y: 80, w: 300, h: 200, z: 1, markdown: true, md: 'Just a few words.' },
        { id: 'n2', type: 'note', title: 'Long', x: 400, y: 80, w: 330, h: 300, z: 2, markdown: true, md: '${long}' },
        { id: 'ap', type: 'apps', title: 'Apps', x: 780, y: 80, w: 360, h: 220, z: 3, apps: [{ id: 'x1', kind: 'app', name: 'Character Map', path: 'C:\\\\Windows\\\\System32\\\\charmap.exe' }] },
        { id: 'sp', type: 'space', title: 'Study', x: 780, y: 330, w: 440, h: 330, z: 4, items: [
          { id: 'i1', kind: 'site', name: 'example', url: 'https://example.com/', screen: 0, zone: { x: 0, y: 0, w: .5, h: 1 } },
          { id: 'i2', kind: 'folder', name: 'Windows', path: 'C:\\\\Windows', screen: 0, zone: { x: .5, y: 0, w: .5, h: 1 } } ] },
        { id: 'w1', type: 'web', title: 'Example', x: 60, y: 420, w: 420, h: 280, z: 5, url: 'https://example.com/', own: true } ] } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);

    // --- wheel: a touchpad-like pan that starts on the background keeps panning over a card ---
    let v0 = await view();
    for (let i = 0; i < 6; i++) { await wheel(30 + i * 90, 400, 8); await sleep(16); }   // moving right across the short note and beyond
    let v1 = await view();
    ok('a touchpad pan keeps moving the board when the pointer passes over cards', v0.y - v1.y >= 47, `${v0.y} -> ${v1.y}`);
    await sleep(400);
    // a mouse notch: eased, ends where one notch goes
    v0 = await view();
    await wheel(30, 400, 100);
    await sleep(40);
    const mid = await view();
    await sleep(500);
    v1 = await view();
    ok('a mouse notch is eased over a few frames', mid.y > v1.y && Math.abs((v0.y - v1.y) - 100) < 1.5, `${v0.y} -> ${mid.y} -> ${v1.y}`);
    // over a note that can scroll, the note scrolls (not the board)
    await sleep(400);
    v0 = await view();
    const n2 = await ev(`(() => { const r = document.querySelector('[data-id="n2"] .card-body').getBoundingClientRect(); return { x: r.x + 60, y: r.y + 120 }; })()`);
    await wheel(n2.x, n2.y, 100);
    await sleep(500);
    v1 = await view();
    const scrolled = await ev(`Math.max(...[...document.querySelectorAll('[data-id="n2"] *')].map(e => e.scrollTop))`);
    ok('over a long note its text scrolls, the board stays', scrolled > 0 && v1.y === v0.y, `scrollTop ${scrolled}, board ${v0.y} -> ${v1.y}`);
    // over the short note (nothing to scroll) a new gesture pans the board
    await sleep(400);
    v0 = await view();
    const n1 = await ev(`(() => { const r = document.querySelector('[data-id="n1"] .card-body').getBoundingClientRect(); return { x: r.x + 40, y: r.y + 40 }; })()`);
    await wheel(n1.x, n1.y, 100); await sleep(500);
    v1 = await view();
    ok('over a card with nothing to scroll, the board moves', Math.abs((v0.y - v1.y) - 100) < 1.5, `${v0.y} -> ${v1.y}`);
    // pinch (Ctrl + small deltas) zooms at a sensible speed; Ctrl + mouse notch zooms one step
    await sleep(400);
    v0 = await view();
    for (let i = 0; i < 10; i++) { await wheel(300, 300, -5, { mod: 2 }); await sleep(16); }
    v1 = await view();
    ok('a touchpad pinch zooms in noticeably', v1.z / v0.z > 1.6 && v1.z / v0.z < 2.2, `${v0.z} -> ${v1.z}`);
    await sleep(400);
    v0 = await view();
    await wheel(300, 300, 100, { mod: 2 }); await sleep(500);
    v1 = await view();
    ok('Ctrl + a mouse notch zooms out one step, eased', v1.z / v0.z > .8 && v1.z / v0.z < .88, `${v0.z} -> ${v1.z}`);
    await sleep(600);
    const st = await stored();
    ok('moving around is saved', Math.abs(st.boards[0].view.z - v1.z) < .01);
    // a flick of the background glides on
    await ev(`(() => { const b = document.querySelector('#canvas'); return true; })()`);
    v0 = await view();
    await mouse('mousePressed', 700, 760);
    for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', 700 - i * 25, 760); await sleep(10); }
    await mouse('mouseReleased', 550, 760, { buttons: 0 });
    const afterDrag = await view();
    await sleep(700);
    v1 = await view();
    ok('a flick glides on after letting go', v1.x < afterDrag.x - 20, `${v0.x} -> ${afterDrag.x} -> ${v1.x}`);
    // Space + drag over a card pans
    await sleep(200);
    v0 = await view();
    const ap = await ev(`(() => { const r = document.querySelector('[data-id="ap"] .card-body').getBoundingClientRect(); return { x: r.x + 100, y: r.y + 60 }; })()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }, sid);
    await mouse('mousePressed', ap.x, ap.y);
    await mouse('mouseMoved', ap.x, ap.y + 30); await sleep(150);
    await mouse('mouseMoved', ap.x, ap.y + 60); await sleep(150);
    await mouse('mouseReleased', ap.x, ap.y + 60, { buttons: 0 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }, sid);
    v1 = await view();
    const cardMoved = await ev(`(async () => (await chrome.storage.local.get('homeboard:v1'))['homeboard:v1'].boards[0].cards.find(c => c.id === 'ap').y)()`);
    ok('Space + drag over a card moves the board, not the card', Math.abs(v1.y - v0.y - 60) < 2 && cardMoved === 80, `${v0.y} -> ${v1.y}, card y ${cardMoved}`);

    // --- expanding a card (first, everything back on screen) ---
    await key('Home', 36); await sleep(600);
    await ev(`document.querySelector('[data-id="n2"] .card-expand').click()`);
    await sleep(350);
    const ex = await ev(`(() => { const c = document.querySelector('[data-id="n2"]'), r = c.getBoundingClientRect(); return { layer: c.parentElement.id, w: Math.round(r.width), h: Math.round(r.height) }; })()`);
    ok('Expand shows the note big in the middle', ex.layer === 'focus-layer' && ex.w >= 1000 && ex.h >= 760, JSON.stringify(ex));
    await shot('nav-expanded.png');
    await key('Escape', 27);
    await sleep(300);
    const back = await ev(`(() => { const c = document.querySelector('[data-id="n2"]'); return { parent: c.parentElement.id, w: c.style.width, layer: document.querySelector('#focus-layer').hidden }; })()`);
    ok('Esc puts it back where it was', back.parent === 'world' && back.w === '330px' && back.layer, JSON.stringify(back));
    // double-click the top edge of the short note: same thing
    const head = await ev(`(() => { const r = document.querySelector('[data-id="n1"] .card-head').getBoundingClientRect(); return { x: r.x + r.width - 90, y: r.y + r.height / 2 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: head.x, y: head.y, button: 'left', buttons: 1, clickCount: 1 }, sid);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: head.x, y: head.y, button: 'left', buttons: 0, clickCount: 1 }, sid);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: head.x, y: head.y, button: 'left', buttons: 1, clickCount: 2 }, sid);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: head.x, y: head.y, button: 'left', buttons: 0, clickCount: 2 }, sid);
    await sleep(350);
    ok('double-clicking the top edge expands it too', await ev(`document.querySelector('[data-id="n1"]').parentElement.id === 'focus-layer'`));
    await mouse('mousePressed', 10, 430); await mouse('mouseReleased', 10, 430, { buttons: 0 });   // the dimmed board
    await sleep(300);
    ok('clicking the dimmed board closes it', await ev(`document.querySelector('[data-id="n1"]').parentElement.id === 'world'`));

    // --- text size of a card ---
    await ev(`document.querySelector('[data-id="n1"] .card-body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    const fs0 = await ev(`parseFloat(getComputedStyle(document.querySelector('[data-id="n1"] .md-view, [data-id="n1"] .note-text, [data-id="n1"] .card-body')).fontSize)`);
    const p1 = await ev(`(() => { const r = document.querySelector('[data-id="n1"] .card-body').getBoundingClientRect(); return { x: r.x + 40, y: r.y + 40 }; })()`);
    for (let i = 0; i < 3; i++) { await wheel(p1.x, p1.y, -100, { mod: 2 }); await sleep(30); }
    await sleep(300);
    const fs1 = await ev(`parseFloat(getComputedStyle(document.querySelector('[data-id="n1"] .md-view, [data-id="n1"] .note-text, [data-id="n1"] .card-body')).fontSize)`);
    ok('Ctrl + wheel over the selected card makes its text bigger', fs1 > fs0 * 1.3, `${fs0} -> ${fs1} ` + await ev(`JSON.stringify([document.querySelector('[data-id="n1"]').className, document.querySelector('[data-id="n1"]').getAttribute('style')])`));
    await ev(`(() => { const s = window.__st; })()`);

    // --- Apps and Workspace cards draw ---
    const apps = await ev(`[...document.querySelectorAll('[data-id="ap"] .app-tile .link-name')].map(e => e.textContent)`);
    ok('the Apps card shows its apps and an Add tile', apps[0] === 'Character Map' && !!(await ev(`!!document.querySelector('[data-id="ap"] .link-add')`)), JSON.stringify(apps));
    const zones = await ev(`[...document.querySelectorAll('[data-id="sp"] .space-item')].map(e => [e.textContent, Math.round(e.getBoundingClientRect().width)])`);
    ok('the Workspace card draws its screen with each item in its place', zones.length === 2 && Math.abs(zones[0][1] - zones[1][1]) < 3 && zones[0][1] > 60, JSON.stringify(zones));
    await ev(`document.querySelector('[data-id="sp"] .space-item').click()`);
    const menu = await ev(`[...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim())`);
    ok('an item has a menu with its place', menu.some(t => t.startsWith('Place · Left half')), JSON.stringify(menu));
    await key('Escape', 27);

    // --- a site's own window, live in the card ---
    await ev(`[...document.querySelectorAll('[data-id="w1"] button')].find(b => b.textContent === 'Open').click()`);
    await sleep(2500);
    const liveBtn = await ev(`!![...document.querySelectorAll('[data-id="w1"] button')].find(b => b.textContent === 'Show it live here')`);
    ok('once its window is open, the card offers to show it live', liveBtn);
    await send('Page.bringToFront', {}, sid);
    await ev(`[...document.querySelectorAll('[data-id="w1"] button')].find(b => b.textContent === 'Show it live here').click()`);
    await sleep(3000);
    const live = await ev(`(() => { const v = document.querySelector('[data-id="w1"] video.web-live'); return v ? { w: v.videoWidth, h: v.videoHeight, state: v.readyState } : null; })()`);
    ok('the window shows live in the card', live && live.w > 100 && live.h > 100, JSON.stringify(live));
    await sleep(2000);
    const fit = await ev(`(() => { const v = document.querySelector('[data-id="w1"] video.web-live'), r = v.getBoundingClientRect(); return { video: v.videoWidth / v.videoHeight, card: r.width / r.height }; })()`);
    ok('its window is sized to the card, so the picture fills it', Math.abs(fit.video / fit.card - 1) < .05, JSON.stringify(fit));
    await shot('nav-live.png');

    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
