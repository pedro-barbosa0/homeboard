// Undo / redo, and copying, pasting and duplicating boards.
//   node dev/boardstest.js C:\path\to\Homeboard <new empty profile folder>
const { spawn } = require('child_process');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 240) : '')); };
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 800, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    const ctrl = async (k, vk, shift) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: 2 | (shift ? 8 : 0) }, sid); };
    const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons: buttons || 0, clickCount: 1 }, sid);
    const stored = () => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`);
    const menuOn = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 8 })); return [...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim()); })()`);
    const pick = label => ev(`(() => { const b = [...document.querySelectorAll('#menu .menu-item')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    await sleep(2000);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [{ id: 's', from: 'n1', to: 'n2' }], views: [{ id: 'v1', name: 'Start', cx: 600, cy: 400, z: 1 }], home: 'v1', cards: [
        { id: 'n1', type: 'note', title: 'One', x: 100, y: 100, w: 260, h: 180, z: 1, markdown: true, md: 'first' },
        { id: 'n2', type: 'note', title: 'Two', x: 420, y: 100, w: 260, h: 180, z: 2, markdown: true, md: 'second' } ] },
      { id: 'k', name: 'Inside', parent: 'a', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'n3', type: 'todo', title: 'List', x: 0, y: 0, w: 260, h: 200, z: 1, items: [{ id: 'i', text: 'task', done: false }] }] },
      { id: 'w', name: 'Work', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [] } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);
    const pos = async () => { const c = (await stored()).boards[0].cards.find(k => k.id === 'n1'); return `${c.x},${c.y}`; };

    // move a card, then undo / redo
    const start = await pos();
    const hd = await ev(`(() => { const r = document.querySelector('[data-id="n1"] .card-title').getBoundingClientRect(); return { x: r.x + 30, y: r.y + 8 }; })()`);
    await mouse('mouseMoved', hd.x, hd.y); await mouse('mousePressed', hd.x, hd.y, 1);
    for (let i = 1; i <= 6; i++) await mouse('mouseMoved', hd.x + i * 30, hd.y + i * 20, 1);
    await mouse('mouseReleased', hd.x + 180, hd.y + 120);
    await sleep(900);
    const moved = await pos();
    await ev(`document.activeElement.blur()`);
    await ctrl('z', 90);
    await sleep(700);
    const undone = await pos();
    await ctrl('y', 89);
    await sleep(700);
    const redone = await pos();
    ok('Ctrl+Z puts a moved card back; Ctrl+Y moves it again', moved !== start && undone === start && redone === moved, `${start} -> ${moved} -> ${undone} -> ${redone}`);

    // deleting a card and a board are undone too
    await ev(`(() => { const t = document.querySelector('[data-id="n2"] .card-title'); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); })()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 }, sid);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 }, sid);
    await sleep(800);
    const gone = (await stored()).boards[0].cards.length;
    await ctrl('z', 90);
    await sleep(700);
    const st1 = await stored();
    ok('a deleted card comes back with its string', gone === 1 && st1.boards[0].cards.length === 2 && st1.boards[0].strings.length === 1, `after delete ${gone}`);
    await menuOn('[data-board="w"]'); await pick('Delete board');
    await sleep(800);
    const boardsGone = (await stored()).boards.length;
    await ctrl('z', 90);
    await sleep(800);
    const back = (await stored()).boards.map(b => b.id).join(',');
    ok('a deleted board comes back', boardsGone === 2 && back.split(',').includes('w'), `after delete ${boardsGone}, after undo ${back}, tabs ${await ev(`[...document.querySelectorAll('[data-board]')].map(e => e.dataset.board).join()`)}`);
    const typed = await ev(`(() => { document.querySelector('[data-id="n1"] .note-text').click(); return document.activeElement.tagName; })()`);
    await send('Input.insertText', { text: ' more' }, sid);
    await ctrl('z', 90);
    await sleep(500);
    ok('inside a note, Ctrl+Z is the note’s own undo, not the board’s', typed === 'TEXTAREA' && await ev(`document.activeElement.value`) === 'first' && (await stored()).boards[0].cards.length === 2, await ev(`document.activeElement.value`));
    await ev(`document.activeElement.blur()`);

    // copy / paste / duplicate boards
    await menuOn('[data-board="a"]');
    const items = await ev(`[...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim())`);
    await pick('Copy board');
    await sleep(300);
    await menuOn('[data-board="w"]'); await pick('Paste board inside');
    await sleep(900);
    let st = await stored();
    const copy = st.boards.find(b => b.parent === 'w');
    const copyKid = copy && st.boards.find(b => b.parent === copy.id);
    ok('copy a board and paste it inside another, with the boards inside it', items.includes('Copy board') && copy && copy.name === 'Home (copy)' && copy.id !== 'a' && copy.cards.length === 2 && copyKid && copyKid.name === 'Inside' && copyKid.cards[0].type === 'todo' && st.active === copy.id,
      copy ? `${copy.name} > ${copyKid && copyKid.name}` : 'no copy');
    const fresh = copy && copy.cards.every(c => !['n1', 'n2'].includes(c.id)) && copy.strings.length === 1 && copy.cards.some(c => c.id === copy.strings[0].from) && copy.views.length === 1 && copy.home === copy.views[0].id && copy.views[0].id !== 'v1';
    ok('the copy is independent: new ids, its string and start view follow', fresh, JSON.stringify(copy && { strings: copy.strings, home: copy.home }));
    await menuOn('[data-board="w"]'); await pick('Duplicate board');
    await sleep(900);
    st = await stored();
    ok('duplicate a board', st.boards.filter(b => b.name.startsWith('Work')).length === 2 && st.boards.find(b => b.id === st.active).name === 'Work (copy)');
    // Ctrl+V with a copied board on the clipboard (as from another Homeboard)
    const n0 = st.boards.length;
    await ev(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', JSON.stringify({ homeboard: 'boards', v: 1, root: 'x', boards: [{ id: 'x', name: 'From elsewhere', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'q', type: 'note', title: 'Hi', x: 0, y: 0, w: 200, h: 150, z: 1, markdown: true, md: 'hello <script>bad()</script>' }] }] })); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    await sleep(900);
    st = await stored();
    const pasted = st.boards.find(b => b.name === 'From elsewhere');
    ok('Ctrl+V pastes a board copied from another Homeboard', st.boards.length === n0 + 1 && pasted && pasted.cards.length === 1 && st.active === pasted.id && await ev(`!document.querySelector('.md-view script')`));
    await ctrl('z', 90);
    await sleep(800);
    ok('…and Ctrl+Z takes the pasted board away again', (await stored()).boards.length === n0);
    const errs = await ev(`JSON.stringify(window.__errs)`);
    ok('no script errors', errs === '[]', errs);
  } catch (e) { console.log('ERROR', e.stack || e.message); results.push(false); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
