// Every card type and every widget builds on a fresh board without a single error, from the first moment of the page
// (errors while the board loads are caught too: the page's own error log starts after load, this one before).
// Found a console card that never appeared (a variable read before it was set). Run:
//   node dev/typestest.js <extension folder> <scratch profile folder>
const { spawn } = require('child_process');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 600) : '')); };
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 90000);
  let id = 0, buf = ''; const pending = new Map(), errors = [];
  proc.stdio[4].on('data', chunk => {
    buf += chunk.toString('utf8'); let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n').slice(0, 2).join(' '));
      const p = pending.get(m.id); if (!p) continue; pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  try {
    const r = await send('Extensions.loadUnpacked', { path: ext });
    const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${r.id}/index.html` });
    const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    const { types, widgets } = await ev(`({ types: Object.keys(TYPES), widgets: Object.keys(WIDGETS) })`);
    const extra = { note: { md: 'hello', markdown: true }, todo: { items: [{ id: 'i', text: 'task', done: false }] }, web: { url: '' }, links: { links: [] }, media: { kind: 'image', src: null },
      files: { path: '' }, term: { cwd: '' }, apps: { apps: [] }, space: { items: [] } };
    const cards = [];
    let n = 0;
    const place = (o, w = 320, h = 260) => { const col = n % 8, row = Math.floor(n / 8); cards.push({ x: 40 + col * 360, y: 40 + row * 300, w, h, z: ++n, title: o.id, ...o }); };
    for (const t of types) if (t !== 'widget') place({ id: 't-' + t, type: t, ...(extra[t] || {}) });
    for (const w of widgets) place({ id: 'w-' + w, type: 'widget', widget: w, data: {} });
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version,
      boards: [{ id: 'a', name: 'Everything', view: { x: 0, y: 0, z: .4 }, strings: [], cards: ${JSON.stringify(cards)} }] } })`);
    await send('Runtime.enable', {}, sid);
    errors.length = 0;
    await send('Page.reload', {}, sid);
    await sleep(4500);
    await send('Page.bringToFront', {}, sid);
    await sleep(1500);
    const shown = await ev(`Object.fromEntries([...document.querySelectorAll('.card')].map(c => [c.dataset.id, (c.querySelector('.card-body') || c).childElementCount]))`);
    const missing = cards.filter(c => !(c.id in shown)).map(c => c.id), empty = cards.filter(c => shown[c.id] === 0).map(c => c.id);
    ok(`all ${types.length} card types and ${widgets.length} widgets are on the board`, !missing.length, 'missing: ' + missing.join(', '));
    ok('…and each one has something in it', !empty.length, 'empty: ' + empty.join(', '));
    ok('no errors while the board loads and runs', !errors.length, errors.join(' || '));
  } catch (e) { console.log('ERROR', e.stack || e.message); results.push(false); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
