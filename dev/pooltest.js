// The pool table follows the music without being touched: the "From the album cover" table and the neon table
// (which glows in the accent, and the accent follows the cover). A second extension tab plays the YouTube Music tab.
// Run: node dev/pooltest.js <extension folder> <scratch profile folder>
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    const fake = await send('Target.createTarget', { url: `chrome-extension://${r.id}/index.html?player` });
    const { sessionId: s3 } = await send('Target.attachToTarget', { targetId: fake.targetId, flatten: true });
    const play = (col, title) => send('Runtime.evaluate', { expression: `(() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = '${col}'; g.fillRect(0, 0, 32, 32); return chrome.runtime.sendMessage({ homeboard: 'ytm', state: { title: '${title}', artist: 'Test', art: c.toDataURL(), playing: true, time: 1, duration: 100 } }).catch(() => 0); })()`, awaitPromise: true }, s3);
    const board = (settings, skin) => ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: ${JSON.stringify({ dockHide: false, ...settings })}, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [{ id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'pl', type: 'widget', widget: 'pool', title: 'Pool', x: 40, y: 80, w: 560, h: 300, z: 1, data: { skin: '${skin}' } }] }] } })`);
    const open = async () => { await send('Page.reload', {}, sid); await sleep(2600); await send('Page.bringToFront', {}, sid); };

    // 1. the cover table: the felt takes each song's colour
    await board({ theme: 'graphite' }, 'cover'); await open();
    const felt = () => ev(`(() => { const c = document.querySelector('[data-id="pl"] canvas'); return [...c.getContext('2d').getImageData(c.width / 2 | 0, c.height / 3 | 0, 1, 1).data].slice(0, 3); })()`);
    await play('#e02020', 'Red'); await sleep(2400); const red = await felt();
    await play('#2040e0', 'Blue'); await sleep(2400); const blue = await felt();
    ok('the album-cover table changes with the song, untouched', red[0] > red[2] + 40 && blue[2] > blue[0] + 40, `red=${red} blue=${blue}`);

    // 2. the neon table: its glow is the accent, which fades to the cover's colour
    await board({ theme: 'neon', musicAccent: true }, 'auto'); await open();
    const glow = () => ev(`(() => { const c = document.querySelector('[data-id="pl"] canvas'), A = getComputedStyle(document.documentElement).getPropertyValue('--accent').match(/[0-9]+/g).map(Number), D = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < D.length; i += 4) if (Math.abs(D[i] - A[0]) + Math.abs(D[i + 1] - A[1]) + Math.abs(D[i + 2] - A[2]) < 30) n++; return n; })()`);
    const g0 = await glow();
    await play('#e02020', 'Red 2'); await sleep(2400); const g1 = await glow();
    await play('#20c040', 'Green 2'); await sleep(500); const gMid = await glow(); await sleep(2000); const g2 = await glow();
    ok('the neon table glows in the accent from the start', g0 > 300, `matching pixels ${g0}`);
    ok('the neon table follows the accent as it fades to each cover', g1 > 300 && gMid > 300 && g2 > 300, `after red ${g1}, mid-fade ${gMid}, after green ${g2}`);
  } catch (e) { console.log('ERROR', e.stack || e.message); results.push(false); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
