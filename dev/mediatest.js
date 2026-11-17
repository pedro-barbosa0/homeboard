// Media: a website window keeps playing when another board opens; the Now playing button and panel list what plays
// (on the boards and in another Edge tab), pause it, go there, and find media on the boards. Run from PowerShell:
//   node dev/mediatest.js C:\Users\Pedro\Homeboard <new empty profile folder>
const { spawn } = require('child_process');
const http = require('http');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
function wav() {
  const rate = 22050, n = rate * 3, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 8000), 44 + i * 2);
  return buf;
}
const tone = wav(), heard = {};
const page = name => `<!doctype html><title>${name} page</title><audio id="a" src="/tone.wav" loop autoplay></audio><p>${name}</p>
  <script>navigator.mediaSession.metadata = new MediaMetadata({ title: '${name} Song', artist: 'Tester' });
  setInterval(() => { const a = document.getElementById('a'); fetch('/t?n=${name}&p=' + (a.paused ? 1 : 0) + '&t=' + a.currentTime.toFixed(2)); }, 300);</script>`;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/tone.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(tone); return; }
  if (u.pathname === '/t') { const n = u.searchParams.get('n'), was = heard[n] || { count: 0 }; heard[n] = { paused: u.searchParams.get('p') === '1', t: +u.searchParams.get('t'), count: was.count + (u.searchParams.get('p') === '1' ? 0 : 1) }; res.end(); return; }
  if (u.pathname === '/pic.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page(u.pathname === '/other' ? 'Other' : 'Board'));
}).listen(8796, '127.0.0.1');
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
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
    await sleep(2200);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Music', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'w1', type: 'web', title: 'Player', x: 60, y: 90, w: 500, h: 300, z: 1, url: 'http://127.0.0.1:8796/board' }] },
      { id: 'b', name: 'Study', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'p1', type: 'media', kind: 'image', title: 'Diagram picture', x: 60, y: 90, w: 200, h: 200, z: 1, src: 'http://127.0.0.1:8796/pic.png' }] } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(3500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);
    await sleep(3000);
    const btn = await ev(`(() => { const b = document.querySelector('#now-playing'); return b && { hidden: b.hidden, on: b.classList.contains('on'), text: b.textContent }; })()`);
    ok('a Now playing button shows what plays', btn && !btn.hidden && btn.on && /Board Song/.test(btn.text), JSON.stringify(btn));
    ok('the board list marks the board that plays', await ev(`!!document.querySelector('.tab[data-board="a"] .tab-playing') && !document.querySelector('.tab[data-board="b"] .tab-playing')`));
    await ev(`document.querySelector('[data-id="w1"]').__mark = 'same'`);

    // switch boards: it keeps playing
    await ev(`document.querySelector('.tab[data-board="b"]').click()`);
    const c0 = heard.Board?.count || 0;
    await sleep(3000);
    ok('it keeps playing on another board', heard.Board && !heard.Board.paused && heard.Board.count >= c0 + 7, `${c0} -> ${JSON.stringify(heard.Board)}`);
    ok('…hidden, not shown on this board', await ev(`(() => { const e = document.querySelector('[data-id="w1"]'); return !!e && e.classList.contains('away') && getComputedStyle(e).display === 'none'; })()`));

    // the panel: pause, find media, go there
    await ev(`document.querySelector('#now-playing').click()`);
    await sleep(500);
    let rows = await ev(`[...document.querySelectorAll('#np-panel .np-row')].map(r => r.textContent)`);
    ok('the panel lists it, with its board', rows.some(t => /Board Song/.test(t) && /Music › Player/.test(t)), JSON.stringify(rows));
    ok('…and the media on the boards', rows.some(t => /Diagram picture/.test(t) && /Picture · Study/.test(t)), JSON.stringify(rows));
    await ev(`[...document.querySelectorAll('#np-panel .np-row')].find(r => /Board Song/.test(r.textContent)).querySelector('.np-toggle').click()`);
    await sleep(1200);
    ok('the play / pause button pauses it', heard.Board.paused, JSON.stringify(heard.Board));
    await ev(`[...document.querySelectorAll('#np-panel .np-row')].find(r => /Board Song/.test(r.textContent)).querySelector('.np-toggle').click()`);
    await sleep(1200);
    ok('…and plays it again', !heard.Board.paused, JSON.stringify(heard.Board));
    await ev(`(() => { const s = document.querySelector('#np-panel input'); s.value = 'diagram'; s.dispatchEvent(new Event('input')); })()`);
    rows = await ev(`[...document.querySelectorAll('#np-panel .np-row')].map(r => r.textContent)`);
    ok('searching finds media by name', rows.length === 1 && /Diagram picture/.test(rows[0]), JSON.stringify(rows));
    await ev(`(() => { const s = document.querySelector('#np-panel input'); s.value = ''; s.dispatchEvent(new Event('input')); })()`);
    await ev(`[...document.querySelectorAll('#np-panel .np-row')].find(r => /Board Song/.test(r.textContent)).click()`);
    await sleep(700);
    const back = await ev(`(() => { const e = document.querySelector('[data-id="w1"]'); return { board: document.querySelector('.tab.active').dataset.board, same: e.__mark === 'same', away: e.classList.contains('away'), sel: e.classList.contains('selected') }; })()`);
    ok('Go there opens its board with the same window (not reloaded)', back.board === 'a' && back.same && !back.away && back.sel, JSON.stringify(back));

    // another Edge tab that plays
    const t2 = await send('Target.createTarget', { url: 'http://127.0.0.1:8796/other' });
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`document.querySelector('#now-playing').click()`);
    await sleep(800);
    await ev(`document.querySelector('#now-playing').click()`);
    await sleep(2500);
    rows = await ev(`[...document.querySelectorAll('#np-panel .np-row')].map(r => r.textContent)`);
    const tabRow = rows.find(t => /Other Song/.test(t));
    ok('a sound in another Edge tab is listed', !!tabRow && /Edge tab/.test(tabRow), JSON.stringify(rows));
    if (tabRow) {
      await ev(`[...document.querySelectorAll('#np-panel .np-row')].find(r => /Other Song/.test(r.textContent)).querySelector('.np-toggle').click()`);
      await sleep(1500);
      ok('…and can be paused from the board', heard.Other && heard.Other.paused, JSON.stringify(heard.Other));
    }
    const castBtn = await ev(`!!document.querySelector('#np-panel .np-row .np-cast')`);
    ok('rows that play have a cast button', castBtn);
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
