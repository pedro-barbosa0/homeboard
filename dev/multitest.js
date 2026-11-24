// Several cards at once: Ctrl+click, a Shift+drag box, moving them together, copy / paste on another board (layout kept),
// duplicate, delete with one Undo. Run from PowerShell:
//   node dev/multitest.js C:\path\to\Homeboard <new empty profile folder>
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
    const mouse = (type, x, y, mod = 0, buttons = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, modifiers: mod }, sid);
    const click = async (x, y, mod = 0) => { await mouse('mousePressed', x, y, mod); await mouse('mouseReleased', x, y, mod, 0); };
    const key = async (k, code, vk, mod = 0) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod }, sid); };
    const stored = async () => { await sleep(600); return ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`); };
    const headOf = idc => ev(`(() => { const r = document.querySelector('[data-id="${idc}"] .card-head').getBoundingClientRect(); return { x: Math.round(r.x + 60), y: Math.round(r.y + r.height / 2) }; })()`);
    const sel = () => ev(`[...document.querySelectorAll('#world > .card.selected')].map(n => n.dataset.id).sort().join()`);
    await sleep(2200);
    const note = (nid, x, y) => ({ id: nid, type: 'note', title: 'Note ' + nid, x, y, w: 220, h: 150, z: 1, markdown: true, md: 'text ' + nid });
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [{ id: 's1', from: 'n1', to: 'n2' }], cards: ${JSON.stringify([note('n1', 60, 100), note('n2', 320, 100), note('n3', 580, 100), note('n4', 60, 400)])} },
      { id: 'b', name: 'Other', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [] } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);

    let p = await headOf('n1'); await click(p.x, p.y);
    p = await headOf('n2'); await click(p.x, p.y, 2);            // Ctrl + click
    ok('Ctrl+click adds a card to the selection', await sel() === 'n1,n2', await sel());
    p = await headOf('n1'); await click(p.x, p.y, 8);            // Shift + click takes it out again
    ok('Shift+click takes it out again', await sel() === 'n2', await sel());
    p = await headOf('n1'); await click(p.x, p.y, 2);
    // drag one of the two: both move
    p = await headOf('n2');
    await mouse('mousePressed', p.x, p.y);
    for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', p.x + i * 10, p.y + i * 5); await sleep(16); }
    await mouse('mouseReleased', p.x + 60, p.y + 30, 0, 0);
    let st = await stored();
    const pos = Object.fromEntries(st.boards[0].cards.map(c => [c.id, [c.x, c.y]]));
    ok('dragging one moves the whole group', pos.n1[0] - 60 === pos.n2[0] - 320 && pos.n1[0] > 60 && pos.n3[0] === 580, JSON.stringify(pos));
    // a box with Shift + drag on empty board
    await click(1000, 700);                                       // clear
    await mouse('mousePressed', 90, 75, 8);
    for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', 90 + i * 92.5, 75 + i * 40.6, 8); await sleep(16); }
    await mouse('mouseReleased', 830, 400, 8, 0);
    ok('Shift+drag on the board selects every card the box touches', await sel() === 'n1,n2,n3', await sel());
    // copy, then paste on the other board: same layout, the string between them too
    await key('c', 'KeyC', 67, 2);
    await ev(`document.querySelector('.tab[data-board="b"]').click()`); await sleep(400);
    await mouse('mouseMoved', 300, 300, 0, 0);
    await key('v', 'KeyV', 86, 2);
    st = await stored();
    const other = st.boards.find(b => b.id === 'b');
    const xs = other.cards.map(c => c.x).sort((a, b) => a - b);
    ok('Ctrl+C / Ctrl+V copies the group to another board, keeping the layout and its string', other.cards.length === 3 && xs[1] - xs[0] === 260 && xs[2] - xs[1] === 200 && other.strings.length === 1, JSON.stringify({ xs, strings: other.strings.length }));
    ok('…and the pasted cards are the selection', (await sel()).split(',').length === 3);
    await key('d', 'KeyD', 68, 2);
    st = await stored();
    ok('Ctrl+D duplicates the whole group', st.boards.find(b => b.id === 'b').cards.length === 6);
    await key('Delete', 'Delete', 46);
    st = await stored();
    ok('Delete removes the whole group', st.boards.find(b => b.id === 'b').cards.length === 3);
    await ev(`[...document.querySelectorAll('#toast button')].find(b => b.textContent === 'Undo').click()`);
    st = await stored();
    ok('…and one Undo brings them all back', st.boards.find(b => b.id === 'b').cards.length === 6);
    await key('a', 'KeyA', 65, 2);
    ok('Ctrl+A selects every card on the board', (await sel()).split(',').length === 6);
    await key('Escape', 'Escape', 27);
    ok('Esc clears the selection', await sel() === '');
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
