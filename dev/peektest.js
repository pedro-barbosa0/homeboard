// One click on a link peeks, two clicks open it; files dragged from a file browser onto the board; the finder
// under the search box. Run from PowerShell:
//   node dev/peektest.js C:\path\to\Homeboard <new empty profile folder> <empty temp folder>
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, work] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><title>Feed ${req.url}</title><h1>Feed page ${req.url}</h1>`); }).listen(8794, '127.0.0.1');
fs.mkdirSync(work, { recursive: true });
const txt = path.join(work, 'vault.txt'), js = path.join(work, 'tool.js'), png = path.join(work, 'dot.png');
fs.writeFileSync(txt, 'secret plans\nline two');
fs.writeFileSync(js, 'console.log(1);\n');
fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} server.close(); process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 150000);
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
    const key = async (k, vk, mod = 0, code = k) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod }, sid); };
    const click = async (x, y, count = 1) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: count }, sid); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: count }, sid); };
    const stored = () => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`);
    const pick = label => ev(`(() => { const b = [...document.querySelectorAll('#menu .menu-item')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    await sleep(2200);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
        { id: 'l1', type: 'links', title: 'Social', x: 60, y: 90, w: 330, h: 200, z: 1, links: [{ id: 'k1', title: 'Feed', url: 'http://127.0.0.1:8794/feed' }] },
        { id: 'n1', type: 'note', title: 'Groceries', x: 440, y: 90, w: 280, h: 200, z: 2, markdown: true, md: 'buy açúcar and milk' } ] },
      { id: 'b', name: 'Estudo', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
        { id: 'n2', type: 'note', title: 'Compilers', x: 2000, y: 1400, w: 300, h: 200, z: 1, markdown: true, md: '# GCC\\nGNU Compiler Collection' } ],
        views: [{ id: 'v1', name: 'Reading corner', cx: 100, cy: 100, z: 1 }] } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);

    // --- the finder ---
    await key('k', 75, 2, 'KeyK');
    ok('Ctrl+K puts the cursor in the search box', await ev(`document.activeElement.id === 'search-input'`));
    await send('Input.insertText', { text: 'gnu' }, sid);
    await sleep(250);
    let rows = await ev(`[...document.querySelectorAll('#finder .finder-row')].map(r => r.textContent)`);
    ok('typing lists what matches on Homeboard, under "search the web"', /Search the web for “gnu”/.test(rows[0]) && rows.some(t => /Compilers/.test(t) && /GNU Compiler/.test(t)), JSON.stringify(rows));
    await key('ArrowDown', 40);
    await key('Enter', 13);
    await sleep(700);
    const went = await ev(`({ board: document.querySelector('.tab.active')?.dataset.board, sel: document.querySelector('[data-id="n2"]')?.classList.contains('selected'), q: document.querySelector('#search-input').value })`);
    ok('↓ and Enter go to that card, on its board', went.board === 'b' && went.sel && went.q === '', JSON.stringify(went));
    await key('k', 75, 2, 'KeyK');
    await send('Input.insertText', { text: 'acucar' }, sid);
    await sleep(250);
    rows = await ev(`[...document.querySelectorAll('#finder .finder-row')].map(r => r.textContent)`);
    ok('it ignores accents and finds words inside notes', rows.some(t => /Groceries/.test(t) && /açúcar/.test(t)), JSON.stringify(rows));
    await key('Escape', 27); await key('Escape', 27);
    await key('k', 75, 2, 'KeyK');
    await send('Input.insertText', { text: 'reading' }, sid);
    await sleep(250);
    rows = await ev(`[...document.querySelectorAll('#finder .finder-row')].map(r => r.textContent)`);
    ok('views and boards are found too', rows.some(t => /Reading corner/.test(t) && /view/i.test(t)), JSON.stringify(rows));
    await ev(`document.querySelectorAll('#finder .finder-row')[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    await sleep(500);
    await ev(`document.querySelector('.tab[data-board="a"]').click()`);
    await sleep(500);

    // --- peek ---
    const tile = await ev(`(() => { const r = document.querySelector('[data-id="l1"] .link-tile').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 20 }; })()`);
    await click(tile.x, tile.y);
    await sleep(600);
    const pk = await ev(`(() => { const p = document.querySelector('.peek'); if (!p) return null; const f = p.querySelector('iframe'), r = p.querySelector('.peek-panel').getBoundingClientRect(); return { src: f.src, w: Math.round(r.width), h: Math.round(r.height), url: location.href.slice(0, 20) }; })()`);
    ok('one click shows the site big over the board', pk && /8794\/feed/.test(pk.src) && pk.w > 1100 && pk.h > 700 && pk.url.startsWith('chrome-extension'), JSON.stringify(pk));
    await sleep(1500);
    const shown = await ev(`!document.querySelector('.peek .web-notice')`);
    ok('the site showed (no "not showing" note)', shown);
    await key('Escape', 27);
    await sleep(300);
    ok('Esc closes it', await ev(`!document.querySelector('.peek')`));

    // --- files dropped on the board ---
    const drop = (paths, x, y) => ev(`(() => { const dt = new DataTransfer(); dt.setData('application/x-homeboard-files', JSON.stringify(${JSON.stringify(paths)}));
      const t = document.elementFromPoint(${x}, ${y});
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y}, dataTransfer: dt }); t.dispatchEvent(over);
      t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y}, dataTransfer: dt }));
      return [over.defaultPrevented, [...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim())]; })()`);
    let [accepted, items] = await drop([txt], 500, 500);
    ok('the board takes a file from a file browser and asks what to make of it', accepted && items[0] === 'A note with its text', JSON.stringify(items));
    await pick('A note with its text');
    await sleep(600);
    let st = await stored();
    const note = st.boards[0].cards.find(c => c.title === 'vault.txt');
    ok('a text file becomes a note with its text', note && note.md === 'secret plans\nline two', JSON.stringify(note && note.md));
    [, items] = await drop([js], 700, 600);
    await pick('A note with its text');
    await sleep(600);
    st = await stored();
    const code = st.boards[0].cards.find(c => c.title === 'tool.js');
    ok('code becomes a note with a code block', code && code.md.startsWith('```js\nconsole.log(1);'), JSON.stringify(code && code.md));
    [, items] = await drop([png], 900, 500);
    ok('a picture offers to go on the board', items.includes('The picture on the board'), JSON.stringify(items));
    await pick('The picture on the board');
    await sleep(900);
    st = await stored();
    ok('…and does', st.boards[0].cards.some(c => c.type === 'media' && c.mediaId), JSON.stringify(st.boards[0].cards.map(c => c.type)));
    [, items] = await drop([work], 300, 650);
    ok('a folder offers a file browser', items.includes('A file browser of this folder'), JSON.stringify(items));
    await key('Escape', 27);

    // --- two clicks open the link (leaves the board, so last) ---
    const t2 = await ev(`(() => { const r = document.querySelector('[data-id="l1"] .link-tile').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 20 }; })()`);
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
    await click(t2.x, t2.y, 1); await click(t2.x, t2.y, 2);
    await sleep(1200);
    const url = (await send('Target.getTargetInfo', { targetId })).targetInfo.url;
    ok('two clicks open the link', /8794\/feed/.test(url), url);
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
