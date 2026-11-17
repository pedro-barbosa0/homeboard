// Smoke break prototype: strike the lighter until it lights, hold the flame, draw, put it out; the Tabacaria and its
// scenes; a cigar and heated tobacco. Screenshots each stage. Run from PowerShell:
//   node dev/smoketest.js C:\Users\Pedro\Homeboard <new empty profile folder> [screenshot folder]
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} process.exit(c); };
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
    const space = (type) => send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }, sid);
    const hint = () => ev(`document.querySelector('.smoke-hint')?.textContent || ''`);
    const shot = async name => { if (!outDir) return; const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64')); };
    await sleep(2200);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [{ id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
      { id: 'n1', type: 'note', title: 'Notes', x: 60, y: 90, w: 320, h: 220, z: 1, markdown: true, md: 'A break.' },
      { id: 's1', type: 'widget', widget: 'smoke', title: 'Smoke break', x: 420, y: 90, w: 240, h: 140, z: 2, data: { product: 'cig', lighter: 'flint', color: '#e63946' } } ] }] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);
    ok('the widget shows what you have', /Atlântico Azul/.test(await ev(`document.querySelector('.smoke-w').textContent`)));

    await ev(`document.querySelector('.smoke-w-go').click()`);
    await sleep(500);
    ok('Smoke break opens over the screen and says what to do', /strike the lighter/.test(await hint()), await hint());
    await shot('smoke-1-start.png');
    // strike until the flame catches (random), then keep holding
    let lit = false;
    for (let i = 0; i < 25 && !lit; i++) {
      await space('keyDown'); await sleep(250);
      if (/Keep the flame/.test(await hint())) lit = true; else { await space('keyUp'); await sleep(200); }
    }
    ok('striking the lighter takes a few tries, then the flame stays while Space is held', lit, await hint());
    await sleep(500);
    await shot('smoke-2-flame.png');
    await sleep(1200);
    await space('keyUp');
    await sleep(300);
    ok('held long enough on the tip, it lights', /Hold Space to draw/.test(await hint()), await hint());
    await space('keyDown'); await sleep(1600);
    await shot('smoke-3-draw.png');
    await space('keyUp'); await sleep(700);
    await shot('smoke-4-exhale.png');
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sid);
    await sleep(300);
    ok('Esc puts it out (the layer goes away)', await ev(`!document.querySelector('.smoke-layer')`));

    // the shop
    await ev(`document.querySelector('.smoke-w-shop').click()`);
    await sleep(400);
    for (const sc of ['Tobacco kiosk', 'Airport', 'Gas station', 'Café', 'Supermarket']) {
      await ev(`[...document.querySelectorAll('.smoke-shop .smoke-chip')].find(b => b.textContent === ${JSON.stringify(sc)}).click()`);
      await sleep(200);
      await shot(`smoke-shop-${sc.split(' ').pop().toLowerCase()}.png`);
    }
    await ev(`[...document.querySelectorAll('.smoke-shop .smoke-chip')].find(b => b.textContent === 'Cigars').click()`);
    await ev(`[...document.querySelectorAll('.smoke-item')].find(b => /Habano Robusto/.test(b.textContent)).click()`);
    await ev(`[...document.querySelectorAll('.smoke-shop .smoke-chip')].find(b => b.textContent === 'Lighters').click()`);
    await ev(`[...document.querySelectorAll('.smoke-item')].find(b => /Torch lighter/.test(b.textContent)).click()`);
    await shot('smoke-shop-lighters.png');
    await ev(`[...document.querySelectorAll('.smoke-shop .smoke-chip')].find(b => b.textContent === 'Done').click()`);
    await sleep(500);
    ok('buying a cigar and a torch lighter', /Habano Robusto/.test(await ev(`document.querySelector('.smoke-w').textContent`)) && /Torch lighter/.test(await ev(`document.querySelector('.smoke-w').textContent`)));
    const saved = (await ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`)).boards[0].cards.find(c => c.id === 's1').data;
    ok('…kept with the board', saved.product === 'cigar' && saved.lighter === 'torch', JSON.stringify(saved));
    await ev(`document.querySelector('.smoke-w-go').click()`);
    await sleep(400);
    lit = false;
    for (let i = 0; i < 25 && !lit; i++) { await space('keyDown'); await sleep(250); if (/Keep the flame/.test(await hint())) lit = true; else { await space('keyUp'); await sleep(150); } }
    await sleep(3600);
    await space('keyUp'); await sleep(300);
    await space('keyDown'); await sleep(1500); await space('keyUp'); await sleep(400);
    await shot('smoke-5-cigar.png');
    ok('a cigar lights after toasting it longer', /Hold Space to draw/.test(await hint()), await hint());
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
