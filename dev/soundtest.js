// Sound visualiser with Edge's built-in fake microphone (a test tone), plus file-type marks; also renders the extension icons.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 240) : '')); };
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 100000);
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 800, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    const folder = 'file:///' + ext.replace(/\\/g, '/') + '/';
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: {}, active: 'a', lastBackup: '9999', boards: [{ id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
      { id: 'vz', type: 'widget', widget: 'viz', title: 'Sound', x: 90, y: 90, w: 440, h: 170, z: 1, data: { source: 'mic', style: 'bars', color: 'rainbow' } },
      { id: 'v2', type: 'widget', widget: 'viz', title: 'Sound', x: 90, y: 290, w: 220, h: 220, z: 2, data: { source: 'mic', style: 'ring', color: 'fire' } },
      { id: 'fi', type: 'files', title: 'Homeboard', named: true, x: 580, y: 90, w: 420, h: 420, z: 3, path: ${JSON.stringify(folder)} } ] }] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);
    const state = () => ev(`[...document.querySelectorAll('.viz')].map(v => v.getAttribute('aria-label') + ' level=' + v.dataset.level)`);
    let s0 = await state();
    if (!s0.every(x => /listening/.test(x) && !/not listening/.test(x))) { await ev(`document.querySelectorAll('.viz').forEach(v => { if (/not/.test(v.getAttribute('aria-label'))) v.click(); })`); }
    let lv = [0, 0];                                     // the loudest each widget heard: the test tone rises and falls
    for (let i = 0; i < 12; i++) { await sleep(500); const now = await ev(`[...document.querySelectorAll('.viz')].map(v => +v.dataset.level)`); lv = lv.map((x, k) => Math.max(x, now[k] || 0)); if (lv.every(x => x > 20)) break; }
    const painted = await ev(`[...document.querySelectorAll('.viz canvas')].map(cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 97 * 4) if (d[i]) n++; return n; })`);
    ok('visualiser hears the input and draws it', lv.length === 2 && lv.every(x => x > 20) && painted.every(n => n > 5), `start=${s0.join(' | ')} levels=${lv} painted=${painted}`);
    fs.mkdirSync(outDir, { recursive: true });
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid);
    fs.writeFileSync(path.join(outDir, 'viz-files.png'), Buffer.from(data, 'base64'));
    // style change from the menu, then stop by clicking
    await ev(`(() => { const e = document.querySelector('[data-id="vz"] .viz'), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 30 })); [...document.querySelectorAll('#menu .menu-item')].find(b => b.textContent.trim().startsWith('Shape')).click(); [...document.querySelectorAll('#menu .menu-item, #menu .gallery-tile')].find(b => (b.dataset.label || b.textContent).trim() === 'Waves').click(); })()`);
    await sleep(700);
    const saved = await ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'].boards[0].cards.find(c => c.id === 'vz').data)`);
    await ev(`document.querySelector('[data-id="vz"] .viz').click()`);
    await sleep(400);
    ok('shape is changed from the right-click menu; a click stops listening', saved.style === 'wave' && saved.source === 'mic' && /not listening/.test((await state())[0]), JSON.stringify(saved));
    const marks = await ev(`Object.fromEntries([...document.querySelectorAll('[data-id="fi"] .files-row')].map(r => [r.dataset.name, r.querySelector('.fmark') ? r.querySelector('.fmark').textContent + ' ' + r.querySelector('.fmark').style.color : r.querySelector('svg')?.getAttribute('class')]))`);
    ok('file browser marks each file type', /JS/.test(marks['apps.js']) && /\{ \}/.test(marks['manifest.json']) && /#/.test(marks['style.css']) && /<>/.test(marks['index.html']) && /M/.test(marks['README.md']) && /fmark-folder/.test(marks.dev) && !!marks['icon.svg'],JSON.stringify(marks).slice(0, 230));
    const errs = await ev(`JSON.stringify(window.__errs)`);
    ok('no script errors', errs === '[]', errs);

    // extension icons from icon.svg (transparent PNGs)
    const iconDir = path.join(ext, 'icons');
    fs.mkdirSync(iconDir, { recursive: true });
    const svg = fs.readFileSync(path.join(ext, 'icon.svg'), 'utf8');
    const t2 = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: s2 } = await send('Target.attachToTarget', { targetId: t2.targetId, flatten: true });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, s2);
    for (const size of [16, 32, 48, 128]) {
      await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false }, s2);
      await send('Runtime.evaluate', { expression: `document.documentElement.innerHTML = '<body style="margin:0;background:transparent"><img style="display:block;width:${size}px;height:${size}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">'; new Promise(r => setTimeout(r, 300))`, awaitPromise: true }, s2);
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } }, s2);
      fs.writeFileSync(path.join(iconDir, `icon-${size}.png`), Buffer.from(shot.data, 'base64'));
    }
    ok('extension icons written', [16, 32, 48, 128].every(n => fs.statSync(path.join(iconDir, `icon-${n}.png`)).size > 150), fs.readdirSync(iconDir).join(', '));
  } catch (e) { console.log('ERROR', e.stack || e.message); results.push(false); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
