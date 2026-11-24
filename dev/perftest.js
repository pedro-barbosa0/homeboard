// What a busy board costs while music plays: messages handled, timer callbacks, main-thread time (script, style,
// layout), what is written while panning, memory. Run it on two copies of Homeboard to compare before and after:
//   node dev/perftest.js <Homeboard folder> <new empty profile folder> [seconds=30]
// A local page plays a tone with a beat and gets Homeboard's YouTube Music script, so every version sees the same
// "song" with its time really moving and real sound levels (the test browser cannot play YouTube Music itself).
const { spawn } = require('child_process');
const http = require('http');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, secs = '30'] = process.argv.slice(2);
const SECS = +secs;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* a 3-minute tone with a kick every half second (16-bit mono WAV) */
function wav(seconds) {
  const rate = 22050, n = rate * seconds, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate, ph = t % .5, kick = Math.exp(-ph * 18) * Math.sin(2 * Math.PI * (60 + 40 * Math.exp(-ph * 30)) * t);
    const v = .35 * kick + .12 * Math.sin(2 * Math.PI * 440 * t) + .06 * Math.sin(2 * Math.PI * 1320 * t);
    b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
  }
  return b;
}
const TONE = wav(180);
const PAGE = `<!doctype html><title>Perf song</title><ytmusic-player-bar><span class="title">Perf song</span></ytmusic-player-bar>
<video id="v" src="/tone.wav" loop autoplay></video>
<script>
const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
g.fillStyle = '#3a7bd5'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#ffd166'; g.fillRect(16, 16, 32, 32);
navigator.mediaSession.metadata = new MediaMetadata({ title: 'Perf song', artist: 'Test band', album: 'Bench', artwork: [{ src: c.toDataURL(), sizes: '64x64', type: 'image/png' }] });
document.getElementById('v').play().catch(() => {});
</script>`;
const server = http.createServer((q, s) => {
  if (q.url === '/tone.wav') { s.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': TONE.length }); s.end(TONE); return; }
  s.writeHead(200, { 'Content-Type': 'text/html' }); s.end(PAGE);
});

/* counting, from the moment the page starts (before Homeboard's own scripts) */
const COUNT = `(() => {
  const c = window.__hb = { msg: 0, port: 0, timers: 0, raf: 0, sets: 0, setBytes: 0 };
  const rt = globalThis.chrome && chrome.runtime;
  if (rt && rt.onMessage) { const add = rt.onMessage.addListener.bind(rt.onMessage); rt.onMessage.addListener = fn => add((...a) => { c.msg++; return fn(...a); }); }
  if (rt && rt.onConnect) { const add = rt.onConnect.addListener.bind(rt.onConnect);
    rt.onConnect.addListener = fn => add(port => { const pa = port.onMessage.addListener.bind(port.onMessage); port.onMessage.addListener = f => pa((...a) => { c.port++; return f(...a); }); return fn(port); }); }
  const si = setInterval, st = setTimeout, ra = requestAnimationFrame;
  window.setInterval = (f, ...a) => si(typeof f === 'function' ? (...x) => { c.timers++; return f(...x); } : f, ...a);
  window.setTimeout = (f, ...a) => st(typeof f === 'function' ? (...x) => { c.timers++; return f(...x); } : f, ...a);
  const who = c.who = {};
  window.requestAnimationFrame = f => { const k = (f.name || String(f).slice(0, 50)).replace(/s+/g, ' '); return ra(t => { c.raf++; who[k] = (who[k] || 0) + 1; return f(t); }); };
  if (globalThis.chrome && chrome.storage && chrome.storage.local) { const set = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = (o, ...a) => { c.sets++; try { c.setBytes += JSON.stringify(o).length; } catch {} return set(o, ...a); }; }
})();`;

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const proc = spawn(EDGE, ['--headless=new', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} server.close(); process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, (SECS * 2 + 120) * 1000);
  let id = 0, buf = ''; const pending = new Map();
  proc.stdio[4].on('data', chunk => {
    buf += chunk.toString('utf8'); let i;
    while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const p = pending.get(m.id); if (!p) continue; pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  try {
    // the "song"
    await send('Target.createTarget', { url: `http://127.0.0.1:${port}/` });
    await sleep(1500);
    // Homeboard, counted from its first line
    const r = await send('Extensions.loadUnpacked', { path: ext });
    const t = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: sid } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    const ev = async e => { const v = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await send('Page.enable', {}, sid);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: COUNT }, sid);
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sid);
    await send('Page.navigate', { url: `chrome-extension://${r.id}/index.html` }, sid);
    await sleep(2500);
    // a busy board: 16 YouTube Music widgets in every look and bar, 4 frames (two devices, one with your picture), notes, a clock
    const looks = ['minimal', 'glass', 'liquid', 'ambient', 'art', 'vinyl', 'frame', 'pill'], bars = ['classic', 'wave', 'rainbow', 'fuse', 'cigarette', 'snail', 'beads', 'rocket'];
    const cards = [];
    for (let i = 0; i < 16; i++) cards.push({ id: 'y' + i, type: 'widget', widget: 'ytm', title: 'YTM', x: 40 + (i % 4) * 380, y: 80 + Math.floor(i / 4) * 170, w: 360, h: 150, z: i + 1, data: { look: looks[i % 8], bar: bars[(i * 3) % 8], halo: !!process.env.HB_HALO } });
    cards.push({ id: 'f1', type: 'widget', widget: 'frame', title: 'Frame', x: 40, y: 780, w: 240, h: 300, z: 30, data: { style: 'player', source: 'music' } });
    cards.push({ id: 'f2', type: 'widget', widget: 'frame', title: 'Frame', x: 300, y: 780, w: 300, h: 300, z: 31, data: { style: 'tv', source: 'music' } });
    cards.push({ id: 'f3', type: 'widget', widget: 'frame', title: 'Frame', x: 620, y: 780, w: 240, h: 300, z: 32, data: { style: 'gilded', source: 'picture', pic: '__PIC__' } });
    cards.push({ id: 'n1', type: 'note', title: 'Notes', x: 880, y: 780, w: 300, h: 220, z: 33, markdown: true, md: '# Today\n- music\n- a walk' });
    cards.push({ id: 'c1', type: 'widget', widget: 'clock', title: 'Clock', x: 1200, y: 780, w: 220, h: 220, z: 34, data: {} });
    // the picture: a 900x700 photo-like JPEG made here (so both versions store the same bytes)
    await ev(`(async () => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 700; const g = c.getContext('2d');
      for (let i = 0; i < 4000; i++) { g.fillStyle = 'hsl(' + (i * 37 % 360) + ' 60% ' + (30 + i % 40) + '%)'; g.fillRect((i * 97) % 900, (i * 53) % 700, 30 + i % 50, 20 + i % 40); }
      const pic = c.toDataURL('image/jpeg', .86);
      const cards = ${JSON.stringify(cards)}; cards.find(k => k.id === 'f3').data.pic = pic;
      await chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false, overlay: 'bottom', material: 'frosted', scene: 'cover' }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version,
        boards: [{ id: 'a', name: 'Busy', view: { x: 0, y: 0, z: .78 }, strings: [], cards }] } });
    })()`);
    await send('Page.reload', {}, sid);
    await sleep(3000);
    await send('Page.bringToFront', {}, sid);
    // give the player Homeboard's YouTube Music script (a real tab would have it already)
    await ev(`chrome.tabs.query({ url: 'http://127.0.0.1:${port}/*' }).then(ts => Promise.all(ts.map(t => chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['ytm.js'] }))))`);
    let shown = '';
    for (let i = 0; i < 20 && !shown; i++) { await sleep(500); shown = await ev(`document.querySelector('.ytm:not(.none) .ytm-title')?.textContent || ''`); }
    await sleep(6000);                                   // settled: everything found, levels flowing
    const playing = await ev(`({ widgets: document.querySelectorAll('.ytm:not(.none)').length, song: document.querySelector('.ytm-title')?.textContent || '', levels: !!(window.HomeboardAudio && window.HomeboardAudio.now()) })`);

    if (process.env.HB_DEBUG) console.log('running animations', JSON.stringify(await ev(`(() => { const t = {}; for (const an of document.getAnimations()) { if (an.playState !== 'running') continue; const el = an.effect && an.effect.target; const k = (an.animationName || an.transitionProperty || 'js') + ' @ ' + (el ? (el.className && el.className.baseVal != null ? el.className.baseVal : el.className) || el.tagName : '?') + (an.effect && an.effect.pseudoElement ? an.effect.pseudoElement : ''); t[k] = (t[k] || 0) + 1; } return t; })()`)));
    if (process.env.HB_HALO) {                          // (photos of the halo: a beat fed in, the test browser has no sound levels)
      await ev(`(() => { const t0 = performance.now(); window.HomeboardAudio.now = () => { const ph = ((performance.now() - t0) / 500) % 1, kick = Math.max(0, 1 - ph * 3); return { title: 'beat', bands: Uint8Array.from({ length: 96 }, (_, i) => Math.min(255, Math.round((i < 10 ? 70 + 185 * kick : 90 + 70 * Math.sin(i * .4 + performance.now() / 300)) * (i < 70 ? 1 : .5)))) }; }; })()`);
      for (let i = 0; i < 6; i++) { await send('Page.bringToFront', {}, sid); await sleep(300); }
      console.log('halo', JSON.stringify(await ev(`[...document.querySelectorAll('.ytm')].slice(0, 3).map(y => { const c = y.querySelector('.ytm-halo'); return { cls: y.className, playing: y.dataset.playing, disp: c && getComputedStyle(c).display, w: c && c.width, cw: c && c.clientWidth }; })`)));
    }
    if (process.env.HB_SHOT) { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); require('fs').writeFileSync(process.env.HB_SHOT, Buffer.from(data, 'base64')); }
    // 1. a song playing, nobody touching anything
    await send('Performance.enable', {}, sid);
    const m0 = Object.fromEntries((await send('Performance.getMetrics', {}, sid)).metrics.map(x => [x.name, x.value]));
    const c0 = await ev('({ ...window.__hb, who: { ...(window.__hb.who || {}) } })');
    for (let i = 0; i < SECS; i++) { await sleep(1000); if (i % 5 === 0) await send('Page.bringToFront', {}, sid); }
    const m1 = Object.fromEntries((await send('Performance.getMetrics', {}, sid)).metrics.map(x => [x.name, x.value]));
    const c1 = await ev('({ ...window.__hb, who: { ...(window.__hb.who || {}) } })');
    const per = k => +((c1[k] - c0[k]) / SECS).toFixed(1), ms = k => Math.round((m1[k] - m0[k]) * 1000 / SECS);
    const idle = {
      'messages handled /s': per('msg'), 'port messages handled /s': per('port'), 'timer callbacks /s': per('timers'), 'animation frames /s': per('raf'),
      'script ms /s': ms('ScriptDuration'), 'style ms /s': ms('RecalcStyleDuration'), 'layout ms /s': ms('LayoutDuration'), 'all tasks ms /s': ms('TaskDuration'),
      'style recalcs /s': +((m1.RecalcStyleCount - m0.RecalcStyleCount) / SECS).toFixed(1), 'layouts /s': +((m1.LayoutCount - m0.LayoutCount) / SECS).toFixed(1),
      'storage writes': c1.sets - c0.sets, 'MB written': +((c1.setBytes - c0.setBytes) / 1e6).toFixed(2), 'JS heap MB': +(m1.JSHeapUsedSize / 1e6).toFixed(1),
    };
    // 2. panning around for 6 seconds
    const s0 = await ev('({ ...window.__hb })');
    for (let k = 0; k < 6; k++) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1500, y: 960, button: 'left', clickCount: 1 }, sid);
      for (let j = 1; j <= 20; j++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1500 - j * 8 * (k % 2 ? -1 : 1), y: 960 - j * 2, button: 'left', buttons: 1 }, sid); await sleep(40); }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1500 - 160 * (k % 2 ? -1 : 1), y: 920, button: 'left', clickCount: 1 }, sid);
      await sleep(150);
    }
    await sleep(1200);
    const s1 = await ev('({ ...window.__hb })');
    const pan = { 'storage writes while panning': s1.sets - s0.sets, 'MB written while panning': +((s1.setBytes - s0.setBytes) / 1e6).toFixed(2) };
    // 3. the saved board itself
    const saved = await ev(`chrome.storage.local.get(null).then(all => ({ board: JSON.stringify(all['homeboard:v1'] || {}).length, everything: JSON.stringify(all).length }))`);
    const who = process.env.HB_DEBUG ? Object.fromEntries(Object.entries(c1.who || {}).map(([k, v]) => [k, Math.round((v - ((c0.who || {})[k] || 0)) / SECS)]).filter(([, v]) => v > 0)) : undefined;
    console.log(JSON.stringify({ folder: ext, playing, idle, pan, 'saved board KB': Math.round(saved.board / 1024), 'animation frames by function /s': who }, null, 1));
    done(0);
  } catch (e) { console.log('ERROR', e.stack); done(1); }
})();
