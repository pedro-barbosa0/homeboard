// Helper end to end: start it, then move / copy / rename / delete files and use the console from the board.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir, sandbox] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
const TM = 'tm' + Date.now().toString(36);                // a new console card each run (consoles outlive the board)
(async () => {
  // a sandbox to move things around in
  const A = path.join(sandbox, 'a'), B = path.join(sandbox, 'b');
  fs.mkdirSync(A, { recursive: true }); fs.mkdirSync(B, { recursive: true });
  for (const n of ['f1.txt', 'f2.txt', 'f3.txt', 'homeboard-helper-test.txt']) fs.writeFileSync(path.join(A, n), 'test file ' + n);

  const helperProc = spawn('node', [path.join(ext, 'helper', 'server.js')], { stdio: 'ignore', windowsHide: true });
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} try { helperProc.kill(); } catch {} process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 170000);
  let id = 0, buf = ''; const pending = new Map();
  proc.stdio[4].on('data', chunk => {
    buf += chunk.toString('utf8'); let i;
    while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const p = pending.get(m.id); if (!p) continue; pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  try {
    await sleep(1200);
    // the helper refuses anyone who is not the extension with the key
    const token = fs.readFileSync(path.join(ext, 'helper', 'token.txt'), 'utf8').trim();
    const ask = headers => fetch('http://127.0.0.1:8767/ping', { method: 'POST', headers }).then(r => r.status, () => 'down');
    const s1 = await ask({}), s2 = await ask({ Origin: 'https://example.com', Authorization: 'Bearer ' + token }), s3 = await ask({ Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', Authorization: 'Bearer wrong' });
    ok('helper refuses: no key, a website with the key, an extension with a wrong key', s1 === 403 && s2 === 403 && s3 === 403, [s1, s2, s3].join(','));

    const r = await send('Extensions.loadUnpacked', { path: ext });
    const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${r.id}/index.html` });
    const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    const key = async (k, vk) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, sid); };
    const type = text => send('Input.insertText', { text }, sid);
    await sleep(2000);
    const url = p => 'file:///' + p.replace(/\\/g, '/') + '/';
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: {}, active: 'a', lastBackup: '', boards: [{ id: 'a', name: 'Files', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
      { id: 'fa', type: 'files', title: 'Folder A', named: true, x: 90, y: 90, w: 430, h: 330, z: 1, path: ${JSON.stringify(url(A))} },
      { id: 'fb', type: 'files', title: 'Folder B', named: true, x: 550, y: 90, w: 430, h: 330, z: 2, path: ${JSON.stringify(url(B))} },
      { id: '${TM}', type: 'term', title: 'Console', x: 90, y: 450, w: 890, h: 330, z: 3, cwd: ${JSON.stringify(A)} } ] }] } })`);
    await send('Page.reload', {}, sid);
    await sleep(3000);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);
    const rows = card => ev(`[...document.querySelectorAll('[data-id="${card}"] .files-row')].map(r => r.dataset.name)`);
    const menu = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 8 })); return [...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim()); })()`);
    const pick = label => ev(`(() => { const b = [...document.querySelectorAll('#menu .menu-item')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    const has = (dir, n) => fs.existsSync(path.join(dir, n));

    ok('both folders are listed', (await rows('fa')).length === 4 && (await rows('fb')).length === 0, (await rows('fa')).join(','));

    // cut + paste
    const rowMenu = await menu('[data-id="fa"] .files-row[data-name="f1.txt"]');
    await pick('Cut');
    await menu('[data-id="fb"] .files-list'); await pick('Paste');
    await sleep(1500);
    ok('cut in one folder, paste in the other: the file moves', !has(A, 'f1.txt') && has(B, 'f1.txt') && (await rows('fb')).includes('f1.txt') && !(await rows('fa')).includes('f1.txt'), rowMenu.join(' | '));

    // drag from A to B (move), then Ctrl-drag (copy)
    const dragTo = (name, ctrl) => ev(`(() => { const dt = new DataTransfer(); document.querySelector('[data-id="fa"] .files-row[data-name="${name}"]').dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      const list = document.querySelector('[data-id="fb"] .files-list'); list.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, ctrlKey: ${ctrl} }));
      list.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, ctrlKey: ${ctrl} })); return dt.types.join(','); })()`);
    await dragTo('f2.txt', false);
    await sleep(1500);
    ok('dragging a file onto the other folder moves it', !has(A, 'f2.txt') && has(B, 'f2.txt'));
    await dragTo('f3.txt', true);
    await sleep(1500);
    const cardsNow = await ev(`[...document.querySelectorAll('.card')].map(c => c.dataset.id + ':' + c.dataset.type).join()`);
    ok('dragging with Ctrl copies it', has(A, 'f3.txt') && has(B, 'f3.txt') && cardsNow.split(',').length === 3, `A ${has(A, 'f3.txt')} B ${has(B, 'f3.txt')} cards ${cardsNow}`);

    // rename, new folder
    await menu('[data-id="fb"] .files-row[data-name="f1.txt"]'); await pick('Rename');
    await type('renamed.txt'); await key('Enter', 13);
    await sleep(1500);
    ok('rename', has(B, 'renamed.txt') && !has(B, 'f1.txt') && (await rows('fb')).includes('renamed.txt'));
    await menu('[data-id="fb"] .files-list'); await pick('New folder');
    await sleep(1500);
    ok('new folder', has(B, 'New folder') && (await rows('fb')).includes('New folder'));

    // delete goes to the Recycle Bin
    await menu('[data-id="fa"] .files-row[data-name="homeboard-helper-test.txt"]'); await pick('Delete');
    await sleep(4000);
    ok('delete sends the file to the Recycle Bin', !has(A, 'homeboard-helper-test.txt') && !(await rows('fa')).includes('homeboard-helper-test.txt'), await ev(`document.querySelector('#toast').textContent`));

    // protected places are refused
    const refused = await ev(`(async () => { const t = (await (await fetch(chrome.runtime.getURL('helper/token.txt'))).text()).trim(); const r = await fetch('http://127.0.0.1:8767/fs/trash', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: ['C:\\\\Windows'] }) }); return r.status + ' ' + (await r.json()).error; })()`);
    ok('protected folders cannot be deleted', refused.startsWith('400') && /protected/.test(refused), refused);

    // console: a real terminal (xterm.js on a pseudo-console)
    await send('Page.bringToFront', {}, sid);                 // the terminal only draws while the page is on screen
    const termRows = () => ev(`[...document.querySelectorAll('[data-id="${TM}"] .xterm-rows > div')].map(r => r.textContent.replace(/\u00a0/g, ' ').trimEnd())`);
    let screen = [];
    for (let i = 0; i < 30 && !screen.join('').includes(A + '>'); i++) { await sleep(500); screen = await termRows(); }
    ok('console: a prompt appears, in the card’s folder', screen.join('').includes(A + '>'), JSON.stringify(screen.filter(Boolean).slice(-3)));
    // the console undoes the board's zoom (the mouse lands on the right letter, the text stays crisp)
    const zoomed = await ev(`(async () => { const w = document.querySelector('#world'); const before = document.querySelector('[data-id="${TM}"] .term-in').style.transform;
      document.querySelector('#zoom-out').click(); await new Promise(r => setTimeout(r, 900));
      const z = new DOMMatrix(getComputedStyle(w).transform).a, t = document.querySelector('[data-id="${TM}"] .term-in').style.transform;
      document.querySelector('#zoom-in').click(); await new Promise(r => setTimeout(r, 700));
      return { z: +z.toFixed(3), t, inverse: +(1 / z).toFixed(3), before }; })()`);
    ok('console: it undoes the board zoom (draws at the screen size)', zoomed.z < 1 && Math.abs(parseFloat((zoomed.t.match(/scale\(([\d.]+)\)/) || [])[1]) - zoomed.inverse) < .02, JSON.stringify(zoomed));
    await ev(`document.querySelector('[data-id="${TM}"] .xterm-helper-textarea').focus()`);
    const enter = async text => {                            // as a person would: the console in front and focused, then type
      await send('Page.bringToFront', {}, sid);
      await ev(`document.querySelector('[data-id="${TM}"] .xterm-helper-textarea').focus()`);
      await type(text); await key('Enter', 13);
    };
    await enter('echo hello-from-test; [Console]::IsOutputRedirected; $Host.UI.RawUI.WindowSize.Width; $env:CLAUDECODE + "|end"');
    await sleep(2500);
    screen = await termRows();
    const cols = await ev(`Math.floor(document.querySelector('[data-id="${TM}"] .xterm-screen').getBoundingClientRect().width / (document.querySelector('[data-id="${TM}"] .xterm-screen').getBoundingClientRect().width / document.querySelector('[data-id="${TM}"] .xterm-rows > div').textContent.length || 1))`);
    const real = /hello-from-test\s*False\s*(\d+)\s*\|end/.exec(screen.map(l => l.trim()).join(' '));
    ok('console: a real terminal (not redirected, the card’s width, a clean environment)', real && +real[1] > 40, JSON.stringify(screen.filter(Boolean).slice(-6)));
    await enter('cls; Write-Host "$([char]27)[6;12HPLACED-HERE"; Start-Sleep 2');
    await sleep(1500);
    screen = await termRows();
    ok('console: programs can draw anywhere on the screen (what full-screen programs need)', (screen[5] || '').indexOf('PLACED-HERE') === 11, JSON.stringify(screen.slice(4, 7)));
    await sleep(1500);
    await enter('cd ..');
    await enter('Get-ChildItem -Name');
    await sleep(2500);
    screen = await termRows();
    ok('console: commands run and change folder', screen.join('').includes(path.basename(sandbox) + '>') && screen.some(l => /^a$/.test(l.trim())) && screen.some(l => /^b$/.test(l.trim())), JSON.stringify(screen.filter(Boolean).slice(-6)));
    // Ctrl+C stops what runs
    await enter('Start-Sleep 30; echo not-stopped');
    await sleep(1200);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 }, sid);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 }, sid);
    await sleep(1500);
    await enter('echo after-stop');
    await sleep(1500);
    screen = await termRows();
    ok('console: Ctrl+C stops what runs', screen.some(l => /^after-stop$/.test(l.trim())) && !screen.some(l => /^not-stopped$/.test(l.trim())), JSON.stringify(screen.filter(Boolean).slice(-4)));
    // Claude Code starts with its own interface (only if it is installed)
    const hasClaude = require('child_process').spawnSync('where.exe', ['claude'], { encoding: 'utf8' }).status === 0;
    if (hasClaude) {
      await enter('claude');
      let ui = '';
      for (let i = 0; i < 24 && !/trust|Claude Code|Welcome|╭/i.test(ui); i++) { await sleep(500); ui = (await termRows()).join('\n'); }
      ok('console: Claude Code opens its interface', /trust|Claude Code|Welcome|╭/i.test(ui) && !/Input must be provided/.test(ui), JSON.stringify(ui.split('\n').filter(Boolean).slice(-6)));
      for (let i = 0; i < 3; i++) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 }, sid); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 }, sid); await sleep(500); }
    } else console.log('SKIP Claude Code is not installed');
    await ev(`(async () => { const t = (await (await fetch(chrome.runtime.getURL('helper/token.txt'))).text()).trim(); await fetch('http://127.0.0.1:8767/term/stop', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ key: '${TM}' }) }); })()`);

    fs.mkdirSync(outDir, { recursive: true });
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid);
    fs.writeFileSync(path.join(outDir, 'files-console.png'), Buffer.from(data, 'base64'));

    // daily backup (runs by itself a little after the page opens)
    let backed = '';
    for (let i = 0; i < 30 && !backed; i++) { await sleep(1000); backed = (await ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'].lastBackup || '')`)); }
    const bfile = path.join(ext, 'backups', `homeboard-${backed}.json`);
    ok('a backup is written once a day', !!backed && fs.existsSync(bfile) && JSON.parse(fs.readFileSync(bfile, 'utf8')).boards.length === 1, bfile);
    await ev(`document.querySelector('#settings-btn').click()`); await sleep(600);
    ok('Customize says the helper is running', /helper is running/.test(await ev(`document.querySelector('#helper-note').textContent`)));
    const errs = await ev(`JSON.stringify(window.__errs)`);
    ok('no script errors', errs === '[]', errs);
  } catch (e) { console.log('ERROR', e.stack || e.message); results.push(false); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
