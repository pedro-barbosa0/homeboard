// Clocks (every face, digital ones too), "Music around it", and the Sound visualiser's waves and backgrounds, with a
// beat fed in (the test browser plays no real sound). Photographs the board. Run from PowerShell:
//   node dev/clocktest.js C:\path\to\Homeboard <new empty profile folder> [screenshot folder]
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 300) : '')); };
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 90000);
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    const faces = ['digital', 'led', 'flip', 'nixie', 'lcd', 'matrix', 'thin', 'tube'];
    const cards = faces.map((f, i) => ({ id: 'c' + i, type: 'widget', widget: 'clock', title: f, x: 30 + (i % 4) * 300, y: 70 + Math.floor(i / 4) * 200, w: 280, h: 180, z: i + 1, data: { skin: f, seconds: true, date: true, h24: true } }));
    cards.push({ id: 'cm', type: 'widget', widget: 'clock', title: 'ring', x: 1230, y: 70, w: 240, h: 260, z: 20, data: { skin: 'theme', music: true } });
    cards.push({ id: 'cd', type: 'widget', widget: 'clock', title: 'eq', x: 1230, y: 350, w: 240, h: 150, z: 21, data: { skin: 'nixie', music: true } });
    cards.push({ id: 'v1', type: 'widget', widget: 'viz', title: 'Waves', x: 30, y: 500, w: 460, h: 190, z: 22, data: { style: 'wave', bg: 'glow' } });
    cards.push({ id: 'v2', type: 'widget', widget: 'viz', title: 'Bars', x: 520, y: 500, w: 460, h: 190, z: 23, data: { style: 'mirror', bg: 'glass', color: 'rainbow' } });
    cards.push({ id: 'v3', type: 'widget', widget: 'viz', title: 'Ring', x: 1010, y: 520, w: 220, h: 220, z: 24, data: { style: 'ring', bg: 'dark' } });
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false, scene: 'aurora' }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version,
      boards: [{ id: 'a', name: 'Clocks', view: { x: 0, y: 0, z: 1 }, strings: [], cards: ${JSON.stringify(cards)} }] } })`);
    // a beat for everything that listens (bass kicks twice a second, the rest moving)
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('DOMContentLoaded', () => { const t0 = performance.now(); const fake = () => { const ph = ((performance.now() - t0) / 500) % 1, kick = Math.max(0, 1 - ph * 3);
      return { title: 'beat', bands: Uint8Array.from({ length: 96 }, (_, i) => Math.min(255, Math.round((i < 10 ? 70 + 185 * kick : 90 + 70 * Math.sin(i * .4 + performance.now() / 300)) * (i < 70 ? 1 : .5)))) }; };
      const hook = () => { if (window.HomeboardAudio) window.HomeboardAudio.now = fake; else setTimeout(hook, 20); }; hook(); });` }, sid);
    await send('Page.reload', {}, sid);
    await sleep(3500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);
    await ev(`(() => { const t0 = performance.now(); window.HomeboardAudio.now = () => { const ph = ((performance.now() - t0) / 500) % 1, kick = Math.max(0, 1 - ph * 3);
      return { title: 'beat', bands: Uint8Array.from({ length: 96 }, (_, i) => Math.min(255, Math.round((i < 10 ? 70 + 185 * kick : 90 + 70 * Math.sin(i * .4 + performance.now() / 300)) * (i < 70 ? 1 : .5)))) }; }; })()`);
    for (let i = 0; i < 6; i++) { await send('Page.bringToFront', {}, sid); await sleep(400); }
    const faceInfo = await ev(`[...document.querySelectorAll('.clock-widget')].slice(0, 8).map(w => ({ skin: w.dataset.skin, digits: w.querySelector('.clock-time')?.textContent || '', kind: w.querySelector('.clock-digits')?.className || '' }))`);
    ok('every digital face shows the time', faceInfo.length === 8 && faceInfo.every(f => /^\d\d:\d\d$/.test(f.digits)), JSON.stringify(faceInfo.map(f => f.skin + ' ' + f.digits)));
    const ink = sel => ev(`(() => { const c = document.querySelector('${sel}'); if (!c || !c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 30) n++; return n; })()`);
    if (process.env.HB_DEBUG) console.log('debug', JSON.stringify(await ev(`(() => { const w = document.querySelector('[data-id="cm"] .clock-widget'), c = w.querySelector('.clock-music'); return { music: w.classList.contains('music'), cw: c.width, ch: c.height, now: !!window.HomeboardAudio.now(), avail: window.HomeboardAudio.available, off: w.closest('.card').className }; })()`)));
    ok('a round clock with music around it draws a ring that moves', await ink('[data-id="cm"] .clock-music') > 200);
    ok('a digital clock with music around it draws an equaliser behind the digits', await ink('[data-id="cd"] .clock-music') > 200);
    ok('the visualiser waves draw', await ink('[data-id="v1"] .viz canvas') > 200);
    const bgs = await ev(`['v1', 'v2', 'v3'].map(id => { const v = document.querySelector('[data-id="' + id + '"] .viz'); return v.dataset.bg + ':' + getComputedStyle(v).backgroundImage.slice(0, 16) + '|' + getComputedStyle(v).backgroundColor; })`);
    ok('the visualiser can have a background (glow, glass, dark stage)', /^glow:radial/.test(bgs[0]) && /^glass/.test(bgs[1]) && /^dark:radial/.test(bgs[2]), JSON.stringify(bgs));
    if (outDir) { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, 'clocks.png'), Buffer.from(data, 'base64')); }
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(results.every(Boolean) ? 0 : 1);
})();
