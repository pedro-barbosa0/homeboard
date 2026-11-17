// Keyboard: Ctrl+←/→ through this board's views, Ctrl+↑/↓ through the list of views across boards,
// and Tab + arrows through the board tree. Run from PowerShell:
//   node dev/keystest.js C:\Users\Pedro\Homeboard <new empty profile folder>
const { spawn } = require('child_process');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile] = process.argv.slice(2);
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
    const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Tab: 9, Enter: 13, Escape: 27 };
    const key = async (k, mod = 0) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: VK[k], nativeVirtualKeyCode: VK[k], modifiers: mod }, sid); await sleep(450); };
    const where = () => ev(`(() => { const m = /translate\\(([-\\d.e]+)px, ([-\\d.e]+)px\\) scale\\(([-\\d.e]+)\\)/.exec(document.querySelector('#world').style.transform); const v = { x: +m[1], y: +m[2], z: +m[3] };
      return { board: document.querySelector('.tab.active')?.dataset.board, cx: Math.round((innerWidth / 2 - v.x) / v.z), cy: Math.round((innerHeight / 2 - v.y) / v.z), hud: document.querySelector('#hud')?.textContent || '' }; })()`);
    const stored = () => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`);
    await sleep(2200);
    const view = (id, name, cx) => ({ id, name, cx, cy: 0, z: 1 });
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [], views: ${JSON.stringify([view('a1', 'Desk', 1000), view('a2', 'Wall', 2000), view('a3', 'Shelf', 3000)])} },
      { id: 'b', name: 'Study', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [], views: ${JSON.stringify([view('b1', 'Reading', 5000)])} },
      { id: 'b2', name: 'Maths', parent: 'b', collapsed: true, view: { x: 0, y: 0, z: 1 }, strings: [], cards: [], views: [] },
      { id: 'b3', name: 'Physics', parent: 'b', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [], views: [] },
      { id: 'c', name: 'Play', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [], views: ${JSON.stringify([view('c1', 'Games', 9000)])} } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);

    // --- Ctrl+← / →: this board's views ---
    await key('ArrowRight', 2);
    let w = await where();
    ok('Ctrl+→ goes to the first view of this board, and says which', w.cx === 1000 && /Desk/.test(w.hud) && /1\/3/.test(w.hud), JSON.stringify(w));
    await key('ArrowRight', 2); await key('ArrowRight', 2);
    w = await where();
    ok('…then the next ones', w.cx === 3000 && /Shelf/.test(w.hud), JSON.stringify(w));
    await key('ArrowRight', 2);
    ok('…and round again', (await where()).cx === 1000);
    await key('ArrowLeft', 2);
    ok('Ctrl+← goes back', (await where()).cx === 3000);

    // --- Ctrl+↑ / ↓: every view of every board, until a list is made ---
    await key('ArrowDown', 2);
    w = await where();
    ok('Ctrl+↓ goes on to the next view of all boards (here: the next board)', w.board === 'b' && w.cx === 5000 && /Study › Reading/.test(w.hud), JSON.stringify(w));
    await key('ArrowDown', 2);
    w = await where();
    ok('…across boards', w.board === 'c' && w.cx === 9000, JSON.stringify(w));
    // make a list: Games, then Desk
    await ev(`(() => { const r = document.querySelector('#zoom-views').getBoundingClientRect(); document.querySelector('#zoom-views').click(); })()`);
    const items = await ev(`[...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim())`);
    ok('the views menu has the list', items.some(t => /Ctrl\+↑ \/ ↓ list · every view/.test(t)), JSON.stringify(items));
    await ev(`[...document.querySelectorAll('#menu .menu-item')].find(b => /Ctrl\\+↑/.test(b.textContent)).click()`);
    await ev(`[...document.querySelectorAll('#menu .menu-item')].find(b => /Add “Games”/.test(b.textContent)).click()`);
    await ev(`document.querySelector('.tab[data-board="a"]').click()`); await sleep(300);
    await ev(`document.querySelector('#zoom-views').click()`);
    await ev(`[...document.querySelectorAll('#menu .menu-item')].find(b => /Ctrl\\+↑/.test(b.textContent)).click()`);
    await ev(`[...document.querySelectorAll('#menu .menu-item')].find(b => /Add “Desk”/.test(b.textContent)).click()`);
    await sleep(500);
    const st = await stored();
    ok('views from two boards are in the list, in order', JSON.stringify(st.tour) === JSON.stringify([{ board: 'c', view: 'c1' }, { board: 'a', view: 'a1' }]), JSON.stringify(st.tour));
    await key('ArrowDown', 2);
    w = await where();
    const first = w;
    await key('ArrowDown', 2);
    w = await where();
    ok('Ctrl+↓ now goes only through the list', [first.cx, w.cx].sort().join() === '1000,9000' && /\d\/2/.test(w.hud), JSON.stringify([first, w]));

    // --- Tab + arrows: the board tree ---
    await ev(`document.querySelector('.tab[data-board="a"]').click()`); await sleep(300);
    await ev(`document.activeElement?.blur()`);
    await key('Tab');
    ok('Tab puts the keyboard in the board tree', await ev(`document.activeElement?.dataset.board === 'a' && document.querySelector('#tabs').classList.contains('keys')`));
    await key('ArrowDown');
    ok('↓ opens the next board on the same level', (await where()).board === 'b');
    await key('ArrowRight');
    let s2 = await where();
    ok('→ goes inside it (opening it), to its first board', s2.board === 'b2' && (await stored()).boards.find(b => b.id === 'b').collapsed === false, JSON.stringify(s2));
    await key('ArrowDown');
    ok('↓ moves between the boards inside', (await where()).board === 'b3');
    await key('ArrowDown');
    ok('…and stops at the last one', (await where()).board === 'b3');
    await key('ArrowLeft');
    ok('← goes back out to the parent', (await where()).board === 'b');
    await key('ArrowDown');
    ok('↓ again: the next top-level board', (await where()).board === 'c');
    await key('Escape');
    ok('Esc leaves the tree and stays on that board', await ev(`document.activeElement === document.body && !document.querySelector('#tabs').classList.contains('keys') && document.querySelector('.tab.active').dataset.board === 'c'`));
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
