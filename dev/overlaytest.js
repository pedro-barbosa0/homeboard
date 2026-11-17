// The music overlay (click-through, moves with a tone playing in another tab), its styles, commands in the search box,
// ambient mode, clear glass and liquid glass refraction. Screenshots each overlay style. Run from PowerShell:
//   node dev/overlaytest.js C:\Users\Pedro\Homeboard <new empty profile folder> [screenshot folder]
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
function wav() {
  const rate = 22050, n = rate * 4, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let ph = 0;
  for (let i = 0; i < n; i++) { const beat = (i % (rate / 2)) < rate / 10 ? 1 : .35, f = 80 + 2400 * ((i / rate) % 1); ph += 2 * Math.PI * f / rate; buf.writeInt16LE(Math.round((Math.sin(ph) * .6 + Math.sin(ph / 7) * .4) * 22000 * beat), 44 + i * 2); }
  return buf;
}
const tone = wav();
const server = http.createServer((req, res) => {
  if (req.url === '/tone.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(tone); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Tone</title><audio id="a" src="/tone.wav" loop autoplay></audio>');
}).listen(8798, '127.0.0.1');
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} server.close(); process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 170000);
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
    const key = async (k, vk, mod = 0, code = k) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod, text: k === 'Enter' ? '\r' : undefined }, sid); };
    const command = async text => { await key('k', 75, 2, 'KeyK'); await send('Input.insertText', { text: '>' + text }, sid); await sleep(250); await key('Enter', 13); await sleep(300); };
    const stored = () => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`);
    const shot = async name => { if (!outDir) return; const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64')); };
    await sleep(2200);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [{ id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
      { id: 'n1', type: 'note', title: 'Ideas', x: 60, y: 90, w: 320, h: 230, z: 1, markdown: true, md: '# Today\\n- music\\n- a walk' },
      { id: 't1', type: 'todo', title: 'To-do', x: 420, y: 90, w: 300, h: 230, z: 2, items: [{ id: 'i1', text: 'Try the overlay', done: false, steps: [], note: '', link: '', due: '', star: false }] },
      { id: 'l1', type: 'links', title: 'Links', x: 760, y: 90, w: 300, h: 230, z: 3, links: [{ id: 'k1', title: 'Wikipedia', url: 'https://www.wikipedia.org/' }] },
      { id: 'n2', type: 'note', title: 'Below', x: 200, y: 560, w: 420, h: 220, z: 4, markdown: true, md: 'Click me through the overlay' } ] }] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    const t2 = await send('Target.createTarget', { url: 'http://127.0.0.1:8798/' });
    const { sessionId: s2 } = await send('Target.attachToTarget', { targetId: t2.targetId, flatten: true });
    await sleep(1200);
    await send('Runtime.evaluate', { expression: `document.querySelector('#a').play().catch(() => {}), 1`, userGesture: true }, s2);
    await sleep(800);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);

    // commands
    await key('k', 75, 2, 'KeyK');
    await send('Input.insertText', { text: '>overlay' }, sid);
    await sleep(250);
    const cmds = await ev(`[...document.querySelectorAll('#finder .finder-row')].map(r => r.textContent)`);
    ok('typing > lists commands', cmds.length > 4 && cmds.every(t => /command$/.test(t)) && cmds.some(t => /Bars along the bottom/.test(t)), JSON.stringify(cmds.slice(0, 4)));
    await key('Escape', 27); await key('Escape', 27);
    await command('overlay bottom');
    await sleep(600);
    let st = await stored();
    ok('a command sets the overlay', st.settings.overlay === 'bottom', st.settings.overlay);
    await sleep(2500);
    const painted = () => ev(`(() => { const c = document.querySelector('#fx-layer'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 53) if (d[i] > 8) n++; return n; })()`);
    const p1 = await painted();
    ok('the overlay draws with the music', p1 > 40, p1);
    const through = await ev(`(() => { const r = document.querySelector('[data-id="n2"] .card-body').getBoundingClientRect(); const e = document.elementFromPoint(r.x + 40, r.y + r.height - 20); return { pe: getComputedStyle(document.querySelector('#fx-layer')).pointerEvents, hit: e.closest('.card')?.dataset.id }; })()`);
    ok('…and clicks go through it to the cards', through.pe === 'none' && through.hit === 'n2', JSON.stringify(through));
    for (const [cmd, file] of [['overlay bottom', 'bottom'], ['overlay top and bottom', 'both'], ['overlay from the sides', 'sides'], ['overlay edge glow', 'glow'], ['overlay waves', 'waves'], ['overlay stars', 'bursts']]) {
      await command(cmd);
      await sleep(1500);
      if (outDir) await shot(`overlay-${file}.png`);
    }
    await command('overlay look tinted');
    await command('overlay bottom');
    await sleep(1200);
    await shot('overlay-bottom-tinted.png');

    // ambient mode
    await command('ambient');
    await sleep(700);
    const amb = await ev(`({ on: document.body.classList.contains('ambient'), top: getComputedStyle(document.querySelector('#topbar')).opacity, dock: getComputedStyle(document.querySelector('#dock')).opacity, card: getComputedStyle(document.querySelector('[data-id="n1"]')).opacity })`);
    ok('ambient mode hides the bars and buttons, not the cards', amb.on && +amb.top < .05 && +amb.dock < .05 && +amb.card === 1, JSON.stringify(amb));
    await shot('overlay-ambient.png');
    await key('Escape', 27);
    await sleep(300);
    ok('Esc leaves ambient mode', await ev(`!document.body.classList.contains('ambient')`));

    // glass: clear, and liquid glass that bends the light
    await command('material liquid');
    await command('glass colour clear');
    await sleep(600);
    const glass = await ev(`(() => { const c = document.querySelector('[data-id="n1"]'); return { material: document.body.dataset.material, glass: document.body.dataset.glass, bf: c.style.backdropFilter, filters: document.querySelectorAll('filter[id^="hb-lens"]').length, supports: CSS.supports('backdrop-filter', 'url(#x)') }; })()`);
    ok('liquid glass with clear glass, edges that bend the light', glass.material === 'liquid' && glass.glass === 'clear' && (!glass.supports || (/url\(/.test(glass.bf) && glass.filters > 0)), JSON.stringify(glass));
    await command('overlay off');
    await command('backdrop soft');
    await sleep(800);
    await shot('glass-clear-liquid.png');
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
