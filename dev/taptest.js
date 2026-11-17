// The sound visualiser hearing what plays in another tab by itself (tap.js), with no sharing dialog,
// and bars that fit the widget's size. Run from PowerShell:
//   node dev/taptest.js C:\Users\Pedro\Homeboard <new empty profile folder> [screenshot folder]
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
// two seconds of a tone that sweeps up, as a WAV file
function wav() {
  const rate = 22050, n = rate * 2, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let ph = 0;
  for (let i = 0; i < n; i++) { const f = 200 + 1800 * (i / n); ph += 2 * Math.PI * f / rate; buf.writeInt16LE(Math.round(Math.sin(ph) * 20000), 44 + i * 2); }
  return buf;
}
const tone = wav();
const server = http.createServer((req, res) => {
  if (req.url === '/tone.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(tone); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><title>Tone player</title><audio id="a" src="/tone.wav" loop autoplay></audio><p>playing</p>');
}).listen(8793, '127.0.0.1');
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run',
    '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 800, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async (expression, s = sid) => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, s); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: {}, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [{ id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
      { id: 'small', type: 'widget', widget: 'viz', title: 'Sound', x: 40, y: 90, w: 200, h: 120, z: 1, data: { style: 'bars' } },
      { id: 'wide', type: 'widget', widget: 'viz', title: 'Sound', x: 40, y: 260, w: 1300, h: 160, z: 2, data: { source: 'screen', style: 'bars', color: 'fire' } } ] }] } })`);
    await send('Page.reload', {}, sid);
    await send('Page.bringToFront', {}, sid);
    await sleep(3000);
    await ev(`window.__shares = 0; const o = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getDisplayMedia = (...a) => { window.__shares++; return o(...a); };
      window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);
    const quiet = await ev(`[...document.querySelectorAll('.viz')].map(v => v.dataset.level + ' ' + v.querySelector('.viz-hint').textContent)`);
    ok('with nothing playing, it rests and says so', quiet.every(x => /nothing playing/.test(x) && +x.split(' ')[0] < 30), JSON.stringify(quiet) + ' ' + JSON.stringify(await ev('[...document.querySelectorAll(".viz")].map(v => v.clientWidth + "x" + v.clientHeight + " c" + v.querySelector("canvas").width + " " + v.getAttribute("aria-label")).join()')));

    // a tab that plays a sound
    const t2 = await send('Target.createTarget', { url: 'http://127.0.0.1:8793/' });
    const { sessionId: s2 } = await send('Target.attachToTarget', { targetId: t2.targetId, flatten: true });
    await sleep(1200);
    await send('Page.bringToFront', {}, s2);
    await ev(`(document.querySelector('#a').play().catch(() => {}), 1)`, s2);
    await sleep(1500);
    await sleep(800);
    const playing = await ev(`(() => { const a = document.querySelector('#a'); return { paused: a.paused, t: a.currentTime }; })()`, s2);
    await send('Page.bringToFront', {}, sid);
    let lv = [0, 0];
    for (let i = 0; i < 16; i++) { await sleep(400); const now = await ev(`[...document.querySelectorAll('.viz')].map(v => +v.dataset.level)`); lv = lv.map((x, k) => Math.max(x, now[k] || 0)); if (lv.every(x => x > 60)) break; }
    ok('both widgets move with the sound playing in the other tab, by themselves', lv.every(x => x > 60), `levels=${lv} player=${JSON.stringify(playing)}`);
    ok('the other tab keeps playing (its sound is passed on)', await ev(`(() => { const a = document.querySelector('#a'); return !a.paused && a.currentTime > 0.5; })()`, s2));
    ok('no sharing dialog was asked for', await ev('window.__shares') === 0);
    const bars = await ev(`[...document.querySelectorAll('.viz')].map(v => +v.dataset.bars)`);
    ok('bars fit the size: few in the small one, many in the wide one, each about the same width', bars[0] >= 12 && bars[0] <= 20 && bars[1] >= 90, JSON.stringify(bars));
    if (outDir) { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, 'viz-auto.png'), Buffer.from(data, 'base64')); }
    // paused in the other tab: back to resting
    await ev(`document.querySelector('#a').pause()`, s2);
    await sleep(1800);
    const after = await ev(`[...document.querySelectorAll('.viz')].map(v => v.querySelector('.viz-hint').textContent)`);
    ok('when the sound stops, it rests again', after.every(x => /nothing playing/.test(x)), JSON.stringify(after) + ' ' + JSON.stringify(await ev(`(() => { const a = document.querySelector('#a'); return [a.paused, a.currentTime]; })()`, s2)) + ' ' + JSON.stringify(await ev(`[...document.querySelectorAll('.viz')].map(v => v.dataset.level)`)));
    const saved = (await ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`)).boards[0].cards;
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
