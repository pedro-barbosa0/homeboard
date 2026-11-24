// The README's screenshots (docs/screenshots/): a showcase board and the clocks, with made-up content and a local
// "song" (a tone with a beat) so the music parts move. Run from PowerShell (needs the internet for the website card):
//   node dev/shots.js C:\path\to\Homeboard <new empty profile folder>
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile] = process.argv.slice(2);
const out = path.join(ext, 'docs', 'screenshots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function wav(seconds) {
  const rate = 22050, n = rate * seconds, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / rate, ph = t % .5, v = .3 * Math.exp(-ph * 18) * Math.sin(2 * Math.PI * 70 * t) + .1 * Math.sin(2 * Math.PI * 440 * t); b.writeInt16LE(Math.round(v * 32767), 44 + i * 2); }
  return b;
}
const TONE = wav(240);
// a made-up cover: a sunset over a road, drawn on a canvas
const PAGE = `<!doctype html><title>Night Drive</title><ytmusic-player-bar><span class="title">Night Drive</span></ytmusic-player-bar>
<video id="v" src="/tone.wav" loop autoplay></video><script>
const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d');
const sky = g.createLinearGradient(0, 0, 0, 400); sky.addColorStop(0, '#2b1055'); sky.addColorStop(.55, '#d53369'); sky.addColorStop(1, '#ff9a5a');
g.fillStyle = sky; g.fillRect(0, 0, 400, 400);
g.fillStyle = '#ffd36e'; g.beginPath(); g.arc(200, 230, 80, 0, Math.PI * 2); g.fill();
g.fillStyle = '#2b1055'; for (let y = 200; y < 320; y += 14) g.fillRect(100, y, 200, 5);
g.fillStyle = '#16052e'; g.beginPath(); g.moveTo(0, 300); g.lineTo(400, 300); g.lineTo(400, 400); g.lineTo(0, 400); g.fill();
g.strokeStyle = '#ff6ec7'; g.lineWidth = 3; for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(200, 300); g.lineTo(200 + i * 70, 400); g.stroke(); }
navigator.mediaSession.metadata = new MediaMetadata({ title: 'Night Drive', artist: 'Homeboard Radio', album: 'Demo', artwork: [{ src: c.toDataURL(), sizes: '400x400', type: 'image/png' }] });
document.getElementById('v').play().catch(() => {});
</script>`;
const server = http.createServer((q, s) => {
  if (q.url === '/tone.wav') { s.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': TONE.length }); s.end(TONE); return; }
  s.writeHead(200, { 'Content-Type': 'text/html' }); s.end(PAGE);
});
(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const proc = spawn(EDGE, ['--headless=new', '--lang=en-GB', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} server.close(); process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 150000);
  let id = 0, buf = ''; const pending = new Map();
  proc.stdio[4].on('data', chunk => { buf += chunk.toString('utf8'); let i; while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const p = pending.get(m.id); if (!p) continue; pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  try {
    await send('Target.createTarget', { url: `http://127.0.0.1:${port}/` });
    await sleep(1500);
    const r = await send('Extensions.loadUnpacked', { path: ext });
    const t = await send('Target.createTarget', { url: `chrome-extension://${r.id}/index.html` });
    const { sessionId: sid } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 960, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async e => { const v = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    const hero = [
      { id: 'n1', type: 'note', title: 'This week', x: 40, y: 80, w: 330, h: 300, z: 1, markdown: true, md: '# Plans\n- Finish the **portfolio** draft\n- Book the train for Friday\n- Call the plumber\n\n> Small steps, every day.' },
      { id: 't1', type: 'todo', title: 'Today', x: 40, y: 400, w: 330, h: 300, z: 2, items: [
        { id: 'a', text: 'Morning run', done: true, steps: [], note: '', link: '', due: '', star: false },
        { id: 'b', text: 'Reply to the design feedback', done: false, steps: [], note: '', link: '', due: '', star: true },
        { id: 'c', text: 'Groceries: oranges, coffee, bread', done: false, steps: [], note: '', link: '', due: '', star: false },
        { id: 'd', text: 'Read 20 pages', done: false, steps: [], note: '', link: '', due: '', star: false } ] },
      { id: 'w1', type: 'web', title: 'Wikipedia', x: 400, y: 80, w: 560, h: 620, z: 3, url: 'https://en.wikipedia.org/wiki/Aurora', plain: false },
      { id: 'y1', type: 'widget', widget: 'ytm', title: 'YouTube Music', x: 990, y: 80, w: 560, h: 200, z: 4, data: { look: 'ambient', bar: 'wave', halo: true } },
      { id: 'k1', type: 'widget', widget: 'clock', title: 'Clock', x: 990, y: 310, w: 270, h: 170, z: 5, surface: 'glass', data: { skin: 'flip', seconds: false, date: true, h24: true } },
      { id: 'c1', type: 'widget', widget: 'custom', title: 'Sky', x: 1280, y: 310, w: 270, h: 170, z: 6, data: { source: 'file', id: 'daynight-clock', name: 'Day & night sky' } },
      { id: 'v1', type: 'widget', widget: 'viz', title: 'Visualiser', x: 990, y: 510, w: 560, h: 190, z: 7, data: { style: 'wave', bg: 'glow', color: 'cover' } },
    ];
    const clocks = ['minimal', 'roman', 'neon', 'flip', 'nixie', 'lcd', 'matrix', 'tube'].map((f, i) => ({ id: 'k' + i, type: 'widget', widget: 'clock', title: f, x: 40 + (i % 4) * 380, y: 80 + Math.floor(i / 4) * 260, w: 350, h: 230, z: i + 1, data: { skin: f, seconds: true, date: true, h24: true, music: f === 'neon' || f === 'nixie' } }));
    clocks.push({ id: 'v2', type: 'widget', widget: 'viz', title: 'Bars', x: 40, y: 620, w: 730, h: 250, z: 20, data: { style: 'mirror', bg: 'dark', color: 'rainbow' } });
    clocks.push({ id: 'v3', type: 'widget', widget: 'viz', title: 'Ring', x: 800, y: 600, w: 300, h: 300, z: 21, data: { style: 'ring', bg: 'none', color: 'accent' } });
    clocks.push({ id: 'c2', type: 'widget', widget: 'custom', title: 'Words', x: 1130, y: 600, w: 420, h: 300, z: 22, data: { source: 'file', id: 'word-clock', name: 'Word clock' } });
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false, theme: 'midnight', material: 'frosted', scene: 'aurora', overlay: 'off' }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version,
      boards: [{ id: 'a', name: 'Home', view: { x: 28, y: 0, z: 1 }, strings: [], cards: ${JSON.stringify(hero)} },
               { id: 'b', name: 'Clocks', view: { x: 0, y: 0, z: 1 }, strings: [], cards: ${JSON.stringify(clocks)} }] } })`);
    await send('Page.reload', {}, sid); await sleep(3500); await send('Page.bringToFront', {}, sid);
    await ev(`chrome.tabs.query({ url: 'http://127.0.0.1:${port}/*' }).then(ts => Promise.all(ts.map(t => chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['ytm.js'] }))))`);
    await ev(`(() => { const t0 = performance.now(); window.HomeboardAudio.now = () => { const ph = ((performance.now() - t0) / 500) % 1, kick = Math.max(0, 1 - ph * 3); return { title: 'Night Drive', bands: Uint8Array.from({ length: 96 }, (_, i) => Math.min(255, Math.round((i < 10 ? 70 + 185 * kick : 100 + 70 * Math.sin(i * .35 + performance.now() / 260)) * (i < 72 ? 1 : .55)))) }; }; })()`);
    for (let i = 0; i < 16; i++) { await send('Page.bringToFront', {}, sid); await sleep(500); }
    const shot = async name => { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(out, name), Buffer.from(data, 'base64')); console.log('saved', name); };
    await shot('hero.png');
    await ev(`[...document.querySelectorAll('#tabs .tab, #tabs [data-board]')].find(b => /Clocks|CL/.test(b.textContent))?.click()`);
    for (let i = 0; i < 10; i++) { await send('Page.bringToFront', {}, sid); await sleep(400); }
    await shot('clocks.png');
  } catch (e) { console.log('ERROR', e.stack); done(1); }
  done(0);
})();
