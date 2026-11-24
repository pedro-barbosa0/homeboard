// .md files opened in Edge (formatted / text / edit, local pictures, Obsidian embeds, saving, a file changed
// meanwhile), the file browser's text view and editing, and hidden scroll bars in frameless website windows.
// Needs the helper from this folder running (tools\start-helper.ps1).
//   node dev/filestest.js C:\path\to\Homeboard <new empty profile folder> <empty temp folder>
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, work] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 240) : '')); };
const fileUrl = p => 'file:///' + p.replace(/\\/g, '/').split('/').map((s, i) => (i ? encodeURIComponent(s) : s)).join('/');
// a tiny valid PNG (2x2, red)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const book = path.join(work, 'Biblioteca', 'Livro de teste');
  fs.mkdirSync(path.join(book, 'imagens'), { recursive: true });
  fs.writeFileSync(path.join(book, 'imagens', 'capa 1.png'), PNG);
  fs.writeFileSync(path.join(book, 'foto.png'), PNG);
  const mdPath = path.join(book, 'Livro de teste.md');
  fs.writeFileSync(mdPath, '# Capítulo 1\r\n\r\nA situação é **única**.\r\n\r\n![capa](imagens/capa 1.png)\r\n\r\n![[foto.png]]\r\n\r\nVer [[Notas]].\r\n');
  fs.writeFileSync(path.join(book, 'notas.css'), 'body { color: red; }\n');
  fs.writeFileSync(path.join(work, 'long.html'), '<!doctype html><title>long</title>' + '<p>line</p>'.repeat(300));

  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 150000);
  let id = 0, buf = ''; const pending = new Map(); let dialogs = 0;
  proc.stdio[4].on('data', chunk => {
    buf += chunk.toString('utf8'); let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (m.method === 'Page.javascriptDialogOpening') { dialogs++; send('Page.handleJavaScriptDialog', { accept: true }, m.sessionId).catch(() => {}); continue; }
      const p = pending.get(m.id); if (!p) continue; pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  const open = async url => { const { targetId } = await send('Target.createTarget', { url }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }); await send('Page.enable', {}, sessionId); await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 820, deviceScaleFactor: 1, mobile: false }, sessionId); return sessionId; };
  const evIn = async (sid, expression, contextId) => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
  const key = async (sid, k, vk, mods = 0) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods }, sid); };
  try {
    const r = await send('Extensions.loadUnpacked', { path: ext });

    // ---- a .md file opened straight in Edge ----
    const ms = await open(fileUrl(mdPath));
    await sleep(2500);
    const v1 = await evIn(ms, `({ bar: !!document.querySelector('.hbfv-bar'), h1: document.querySelector('.hbfv-md h1')?.textContent, strong: document.querySelector('.hbfv-md strong')?.textContent,
      imgs: [...document.querySelectorAll('.hbfv-md img')].map(i => i.naturalWidth + ':' + decodeURIComponent(i.src.split('/').slice(-2).join('/'))), wiki: document.querySelector('.hbfv-md a.wikilink')?.getAttribute('href')?.split('/').pop(), title: document.title })`);
    ok('a .md opened in Edge shows formatted, with its local pictures (path with spaces and ![[ ]])', v1.bar && v1.h1 === 'Capítulo 1' && v1.strong === 'única' && v1.imgs.length === 2 && v1.imgs.every(x => x.startsWith('2:')), JSON.stringify(v1));
    ok('[[links]] point to the note beside it', v1.wiki === 'Notas.md' && v1.title === 'Livro de teste.md', v1.wiki);
    await evIn(ms, `[...document.querySelectorAll('.hbfv-btn')].find(b => b.textContent === 'Text').click()`);
    await sleep(300);
    ok('switch to the plain text', (await evIn(ms, `document.querySelector('.hbfv-text')?.textContent || ''`)).startsWith('# Capítulo 1'));
    await evIn(ms, `[...document.querySelectorAll('.hbfv-btn')].find(b => b.textContent === 'Edit').click()`);
    await sleep(1200);
    const editing = await evIn(ms, `({ ta: !!document.querySelector('.hbfv-edit'), status: document.querySelector('.hbfv-status').textContent })`);
    ok('Edit opens the file for editing (through the helper)', editing.ta, JSON.stringify(editing));
    await evIn(ms, `(() => { const t = document.querySelector('.hbfv-edit'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); })()`);
    await send('Input.insertText', { text: '\nLinha nova.' }, ms);
    await key(ms, 's', 83, 2);
    await sleep(1500);
    const disk = fs.readFileSync(mdPath, 'utf8');
    ok('Ctrl+S saves it, keeping the file’s Windows line endings', disk.endsWith('Ver [[Notas]].\r\n\r\nLinha nova.') && !/[^\r]\n/.test(disk) && await evIn(ms, `document.querySelector('.hbfv-status').textContent`) === 'Saved', JSON.stringify(disk.slice(-40)));
    // the file changes somewhere else, then we save again
    await sleep(50);
    fs.writeFileSync(mdPath, disk + '\r\nOutra pessoa escreveu isto.');
    await send('Input.insertText', { text: ' E mais.' }, ms);
    await key(ms, 's', 83, 2);
    await sleep(2000);
    const disk2 = fs.readFileSync(mdPath, 'utf8');
    ok('if the file changed meanwhile, it asks before replacing it', dialogs === 1 && disk2.endsWith('Linha nova. E mais.') && !disk2.includes('Outra pessoa'), `dialogs=${dialogs}`);
    await evIn(ms, `[...document.querySelectorAll('.hbfv-btn')].find(b => b.textContent === 'Formatted').click()`);
    await sleep(300);
    ok('back to formatted, showing the edits', /E mais\./.test(await evIn(ms, `document.querySelector('.hbfv-md').textContent`)));

    // ---- the board: file browser and frameless website windows ----
    const bs = await open(`chrome-extension://${r.id}/index.html`);
    await sleep(2000);
    await evIn(bs, `chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [{ id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
      { id: 'f', type: 'files', title: 'Book', named: true, x: 40, y: 80, w: 720, h: 420, z: 1, path: ${JSON.stringify(fileUrl(book) + '/')} },
      { id: 'w1', type: 'web', title: 'Plain', x: 800, y: 80, w: 380, h: 300, z: 2, url: ${JSON.stringify(fileUrl(path.join(work, 'long.html')))}, plain: true },
      { id: 'w2', type: 'web', title: 'Framed', x: 800, y: 420, w: 380, h: 300, z: 3, url: ${JSON.stringify(fileUrl(path.join(work, 'long.html')) + '?framed')} } ] }] } })`);
    await send('Page.reload', {}, bs);
    await sleep(3000);
    await send('Page.bringToFront', {}, bs);
    await evIn(bs, `window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);
    await evIn(bs, `[...document.querySelectorAll('.files-row')].find(x => x.dataset.name === 'Livro de teste.md').click()`);
    await sleep(1500);
    const pv = await evIn(bs, `({ h1: document.querySelector('.files-preview .hbfv-md h1')?.textContent, imgs: [...document.querySelectorAll('.files-preview .hbfv-md img')].map(i => i.naturalWidth), btns: [...document.querySelectorAll('.files-preview .hbfv-btn')].map(b => b.textContent).join('|') })`);
    ok('file browser: a .md previews formatted, with its pictures', pv.h1 === 'Capítulo 1' && pv.imgs.length === 2 && pv.imgs.every(w => w === 2) && pv.btns === 'Formatted|Text|Edit|Save', JSON.stringify(pv));
    await evIn(bs, `[...document.querySelectorAll('.files-row')].find(x => x.dataset.name === 'notas.css').click()`);
    await sleep(1000);
    await evIn(bs, `[...document.querySelectorAll('.files-preview .hbfv-btn')].find(b => b.textContent === 'Edit').click()`);
    await sleep(1200);
    await evIn(bs, `(() => { const t = document.querySelector('.files-preview .hbfv-edit'); t.value = 'body { color: blue; }\\n'; t.dispatchEvent(new Event('input')); })()`);
    await evIn(bs, `[...document.querySelectorAll('.files-preview .hbfv-btn')].find(b => b.textContent === 'Save').click()`);
    await sleep(1500);
    ok('file browser: a .css file is edited and saved', fs.readFileSync(path.join(book, 'notas.css'), 'utf8') === 'body { color: blue; }\n' && await evIn(bs, `document.querySelector('.files-preview .hbfv-status').textContent`) === 'Saved');

    const { targetInfos } = await send('Target.getTargets');
    const frames = targetInfos.filter(t => t.type === 'iframe' && t.url.includes('long.html'));
    const bars = {};
    for (const f of frames) {
      const { sessionId } = await send('Target.attachToTarget', { targetId: f.targetId, flatten: true });
      bars[f.url.includes('framed') ? 'framed' : 'plain'] = await evIn(sessionId, `({ cls: document.documentElement.classList.contains('hb-noscroll'), sw: getComputedStyle(document.documentElement).scrollbarWidth })`);
    }
    if (!frames.length) {                            // same-process frames: look from the board instead
      const same = await evIn(bs, `[...document.querySelectorAll('.card-web iframe')].map(f => { try { const d = f.contentDocument; return { name: f.name, cls: d.documentElement.classList.contains('hb-noscroll'), sw: getComputedStyle(d.documentElement).scrollbarWidth }; } catch { return { name: f.name, err: 1 }; } })`);
      same.forEach(x => { bars[x.name === 'hb-noscroll' ? 'plain' : 'framed'] = x; });
    }
    ok('a frameless website window hides the site’s scroll bars; a framed one keeps them', bars.plain && bars.plain.cls && bars.plain.sw === 'none' && bars.framed && !bars.framed.cls, JSON.stringify(bars));
    const menu = await evIn(bs, `(() => { const e = document.querySelector('[data-id="w2"] .card-head'), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 8 })); return [...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim()); })()`);
    ok('any website window can choose to hide them', menu.includes('Hide the scroll bars'));
    const errs = await evIn(bs, `JSON.stringify(window.__errs)`);
    ok('no script errors', errs === '[]', errs);
  } catch (e) { console.log('ERROR', e.stack || e.message); results.push(false); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
