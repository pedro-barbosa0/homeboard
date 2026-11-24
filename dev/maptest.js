// The view map: tiles of saved views from several boards, arranged in 2D; Ctrl+arrows go to the tile in that
// direction; tiles can be dragged. Run from PowerShell:
//   node dev/maptest.js C:\path\to\Homeboard <new empty profile folder> [screenshot folder]
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 120000);
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
    const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, m: 77 };
    const key = async (k, mod = 2) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, windowsVirtualKeyCode: VK[k], nativeVirtualKeyCode: VK[k], modifiers: mod }, sid); await sleep(500); };
    const where = () => ev(`(() => { const m = /translate\\(([-\\d.e]+)px, ([-\\d.e]+)px\\) scale\\(([-\\d.e]+)\\)/.exec(document.querySelector('#world').style.transform); const v = { x: +m[1], y: +m[2], z: +m[3] };
      return { board: document.querySelector('.tab.active')?.dataset.board, cx: Math.round((innerWidth / 2 - v.x) / v.z), hud: document.querySelector('#hud')?.textContent || '' }; })()`);
    const stored = () => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`);
    await sleep(2200);
    const view = (vid, name, cx) => ({ id: vid, name, cx, cy: 0, z: 1 });
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'n1', type: 'note', title: 'N', x: 900, y: -100, w: 200, h: 150, z: 1, markdown: true, md: 'x' }], views: ${JSON.stringify([view('a1', 'Desk', 1000), view('a2', 'Wall', 2000)])} },
      { id: 'b', name: 'Study', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [], views: ${JSON.stringify([view('b1', 'Reading', 5000), view('b2', 'Notes', 6000)])} },
      { id: 'c', name: 'Play', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [], views: ${JSON.stringify([view('c1', 'Games', 9000)])} } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);

    await key('m');
    ok('Ctrl+M opens the view map, with every view to add', await ev(`!document.querySelector('#viewmap').hidden && document.querySelectorAll('#viewmap .vm-spare').length === 5`));
    await ev(`[...document.querySelectorAll('#viewmap button')].find(b => b.textContent === 'One row per board').click()`);
    await sleep(300);
    let st = await stored();
    ok('"One row per board" lays them out: a row per board, its views left to right', JSON.stringify(st.viewMap.map(t => [t.view, t.x, t.y])) === JSON.stringify([['a1', 0, 0], ['a2', 1, 0], ['b1', 0, 1], ['b2', 1, 1], ['c1', 0, 2]]), JSON.stringify(st.viewMap));
    ok('tiles show a sketch of the cards in the view', await ev(`document.querySelectorAll('#viewmap .vm-tile').length === 5 && document.querySelectorAll('#viewmap .vm-tile')[0].querySelectorAll('rect').length === 1`));
    if (outDir) { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, 'viewmap.png'), Buffer.from(data, 'base64')); }
    // drag "Games" to the right of "Reading"'s row end (cell 2,1)
    const pos = await ev(`(() => { const t = [...document.querySelectorAll('#viewmap .vm-tile')].find(x => /Games/.test(x.textContent)).getBoundingClientRect(); const a = document.querySelector('#viewmap .vm-area').getBoundingClientRect(); return { x: t.x + t.width / 2, y: t.y + t.height / 2, ax: a.x, ay: a.y }; })()`);
    const to = { x: pos.ax + (2 - -1) * 178 + 84, y: pos.ay + (1 - -1) * 122 + 56 };   // cells start one before 0 (an empty border)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', buttons: 1, clickCount: 1 }, sid);
    for (let i = 1; i <= 8; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + (to.x - pos.x) * i / 8, y: pos.y + (to.y - pos.y) * i / 8, button: 'left', buttons: 1 }, sid); await sleep(20); }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 }, sid);
    await sleep(400);
    st = await stored();
    const games = st.viewMap.find(t => t.view === 'c1');
    ok('a tile can be dragged to another place', games.x === 2 && games.y === 1, JSON.stringify(games));
    await ev(`document.querySelector('#viewmap').hidden = true`);

    // moving by direction, starting on Home (Desk): right Wall, down Notes, right Games, left Notes, up Wall, left Desk
    await ev(`document.querySelector('.tab[data-board="a"]').click()`);
    await sleep(300);
    const seq = [];
    for (const k of ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowLeft']) { await key(k); const w = await where(); seq.push(w.hud.replace(/\s+/g, ' ')); }
    ok('Ctrl+arrows go to the view in that direction, across boards', JSON.stringify(seq) === JSON.stringify(['Home › Wall', 'Study › Notes', 'Play › Games', 'Study › Notes', 'Home › Wall', 'Home › Desk']), JSON.stringify(seq));
    await key('ArrowLeft');
    ok('…and says so when there is nothing further', /Nothing further/.test((await where()).hud));
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
