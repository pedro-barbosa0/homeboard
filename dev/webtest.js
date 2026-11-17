// Website windows: tab-like permissions, the "loaded" report from frame.js, the notice when a site does not
// show, the sign-in hand-off for Google (no account involved), and sites that live in their own window.
//   node dev/webtest.js C:\Users\Pedro\Homeboard <new empty profile folder>
const { spawn } = require('child_process');
const http = require('http');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 240) : '')); };
(async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' });   // refuses embedding; the extension lifts it
    res.end('<!doctype html><title>Fine</title><p>' + 'hello '.repeat(50) + '</p>');
  }).listen(8792, '127.0.0.1');
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} server.close(); process.exit(c); };
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [{ id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
      { id: 'fine', type: 'web', title: 'Fine', x: 20, y: 70, w: 460, h: 340, z: 1, url: 'http://127.0.0.1:8792/' },
      { id: 'dead', type: 'web', title: 'Dead', x: 500, y: 70, w: 460, h: 340, z: 2, url: 'http://127.0.0.1:9/' },
      { id: 'goog', type: 'web', title: 'Gmail', x: 980, y: 70, w: 480, h: 380, z: 3, url: 'https://mail.google.com/' },
      { id: 'own', type: 'web', title: 'Own', x: 20, y: 440, w: 460, h: 300, z: 4, url: 'http://127.0.0.1:8792/own', own: true } ] }] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);
    const attrs = await ev(`(() => { const f = document.querySelector('[data-id="fine"] iframe'); return { name: f.name, sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow') }; })()`);
    ok('website windows get what a tab gets (downloads, dialogs, casting, camera on request), but cannot replace the board', ['allow-downloads', 'allow-modals', 'allow-presentation', 'allow-popups'].every(x => attrs.sandbox.includes(x)) && !attrs.sandbox.includes('allow-top-navigation') && /microphone/.test(attrs.allow) && attrs.name === 'hb:fine', JSON.stringify(attrs));

    const notices = () => ev(`Object.fromEntries([...document.querySelectorAll('.card-web')].map(c => [c.dataset.id, c.querySelector('.web-notice')?.textContent || '']))`);
    await sleep(9000);
    const early = await notices();
    ok('a site that sign-in protects says so: Google sign-in only works in a real window', /asks you to sign in/.test(early.goog) && /Sign in/.test(early.goog), early.goog);
    await sleep(5000);
    const late = await notices();
    ok('a site that shows says nothing; one that does not show offers its own window', late.fine === '' && /Not showing\?/.test(late.dead) && /Open it in its own window/.test(late.dead), JSON.stringify(late).slice(0, 220));

    // its own window
    const ownBefore = await ev(`document.querySelector('[data-id="own"] .web-own')?.textContent || ''`);
    await ev(`document.querySelector('[data-id="own"] .web-own .btn').click()`);
    await sleep(1500);
    const wins = await ev(`chrome.windows.getAll({ populate: true }).then(ws => ws.filter(w => w.type === 'popup').map(w => ({ id: w.id, url: w.tabs[0].url || w.tabs[0].pendingUrl })))`);
    const ownAfter = await ev(`document.querySelector('[data-id="own"] .web-own .btn').textContent`);
    ok('“always in its own window”: the card opens the site in a real window and can bring it back to the front', /Opens in its own window/.test(ownBefore) && wins.some(w => /8792\/own/.test(w.url)) && ownAfter === 'Bring it to the front', JSON.stringify(wins));
    const win = wins.find(w => /8792\/own/.test(w.url));
    await ev(`chrome.windows.remove(${win.id})`);
    await sleep(800);
    ok('closing that window resets the card', await ev(`document.querySelector('[data-id="own"] .web-own .btn').textContent`) === 'Open');

    // "Always" from the notice turns a window into one that opens on its own
    await ev(`[...document.querySelectorAll('[data-id="dead"] .web-notice .btn')].find(b => b.textContent === 'Always').click()`);
    await send('Page.bringToFront', {}, sid);
    await sleep(1500);                                  // the board was behind the window it opened; saving waits a moment
    const st = await ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'].boards[0].cards.find(c => c.id === 'dead').own)`);
    ok('“Always” remembers it for that window', st === true && await ev(`!!document.querySelector('[data-id="dead"] .web-own')`), JSON.stringify({ st, html: await ev(`document.querySelector('[data-id="dead"] .web-frame').className + ' :: ' + document.querySelector('[data-id="dead"] .web-frame').textContent.slice(0, 120)`) }));
    const menu = await ev(`(() => { const e = document.querySelector('[data-id="fine"] .card-head'), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 8 })); return [...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim()); })()`);
    ok('and it is in the window’s menu', menu.includes('Always open in its own window'));
    const errs = await ev(`JSON.stringify(window.__errs)`);
    ok('no script errors', errs === '[]', errs);
  } catch (e) { console.log('ERROR', e.stack || e.message); results.push(false); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
