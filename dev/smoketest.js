// Smoke break prototype: strike the lighter until it lights, hold the flame, draw, put it out; the Tabacaria and its
// scenes; a cigar and heated tobacco. Screenshots each stage. Run from PowerShell:
//   node dev/smoketest.js C:\path\to\Homeboard <new empty profile folder> [screenshot folder]
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
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 260000);
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
    ok('the widget shows what you have (the pack)', /Português/.test(await ev(`document.querySelector('.smoke-w').textContent`)));

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
    ok('the hint says Space twice throws it away', /Space twice/.test(await hint()), await hint());
    await space('keyDown'); await sleep(60); await space('keyUp'); await sleep(90); await space('keyDown'); await sleep(60); await space('keyUp');
    await sleep(150);
    await shot('smoke-4b-toss.png');
    ok('Space twice, quickly, throws it away', /Thrown away/.test(await hint()), await hint());
    await sleep(900);
    ok('…and the hand stays empty (it does not take another by itself)', /Thrown away\. Space: take another/.test(await hint()), await hint());
    await space('keyDown'); await sleep(80); await space('keyUp'); await sleep(400);
    ok('…Space takes the next one, ready to light', /strike the lighter/.test(await hint()), await hint());
    // smoked down to the end: it burns the fingers, the hand shakes and drops it
    let lit2 = false;
    for (let i = 0; i < 25 && !lit2; i++) { await space('keyDown'); await sleep(250); if (/Keep the flame/.test(await hint())) lit2 = true; else { await space('keyUp'); await sleep(200); } }
    for (let i = 0; i < 40 && !/Hold Space to draw/.test(await hint()); i++) await sleep(250);   // held until it is really lit
    await space('keyUp'); await sleep(400);
    await ev('window.__hbSmokeSpeed = 4');                   // (time runs faster for the test)
    await space('keyDown');                                  // one long draw, all the way down
    let ouch = '', after = '';
    for (let i = 0; i < 1500 && !ouch; i++) { await sleep(30); if (i % 15 === 0) { await send('Page.bringToFront', {}, sid); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, autoRepeat: true }, sid); }   // a held key repeats; the headless window loses focus now and then
      if (process.env.HB_DEBUG && i % 60 === 0) console.log('  state', JSON.stringify(await ev(`(() => { const x = document.querySelector('.smoke-layer').hbState(); return { down: x.down, drawing: x.drawing, burnt: +x.burnt.toFixed(3), lit: x.lit, phase: x.phase, need: x.needRelease, hand: x.hand }; })()`))); const t = await hint(); if (/Ouch/.test(t)) ouch = t; else if (/dropped/.test(t)) { ouch = '(missed the moment) ' + t; } }
    await sleep(120); await shot('smoke-6-ouch.png');
    await space('keyUp');
    for (let i = 0; i < 10 && !/dropped/.test(after); i++) { await sleep(250); after = await hint(); }
    await ev('window.__hbSmokeSpeed = 1');
    await sleep(150); await shot('smoke-7-dropped.png');
    ok('smoked to the end, it burns the fingers', /Ouch/.test(ouch), ouch);
    ok('…and the hand drops it, and stays empty', /Burnt your fingers and dropped it\. Space: take another/.test(after), after);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sid);
    await sleep(300);
    ok('Esc puts it out (the layer goes away)', await ev(`!document.querySelector('.smoke-layer')`));

    // the shop
    await ev(`document.querySelector('.smoke-w-shop').click()`);
    await sleep(400);
    for (const sc of ['Café at night', 'Café in the morning', 'Gas station (drawn)', 'Tobacco kiosk', 'Airport', 'Supermarket']) {
      await ev(`[...document.querySelectorAll('.smoke-shop .smoke-chip')].find(b => b.textContent === ${JSON.stringify(sc)}).click()`);
      await sleep(200);
      await shot(`smoke-shop-${sc.replace(/W+/g, '-').toLowerCase()}.png`);
    }
    // the packs: the drawn ones, and one of your own (added, changed, deleted)
    await ev(`[...document.querySelectorAll('.smoke-shop .smoke-chip')].find(b => b.textContent === 'Cigarettes').click()`);
    const packs = await ev(`[...document.querySelectorAll('.smoke-packitem b')].map(b => b.textContent)`);
    ok('the Tabacaria sells the drawn packs', packs.includes('Português') && packs.includes('SG Ventil') && packs.length >= 10, JSON.stringify(packs));
    await ev(`document.querySelector('.smoke-addpack').click()`);
    await sleep(200);
    await ev(`(() => { const f = document.querySelector('.smoke-packform'), i = f.querySelector('input'); i.value = 'Minha Marca'; i.dispatchEvent(new Event('input')); f.requestSubmit(); })()`);
    await sleep(500);
    let mine = await ev(`(async () => (await chrome.storage.local.get('homeboard:packs'))['homeboard:packs'] || [])()`);
    ok('a pack of your own can be added (kept for every board)', mine.length === 1 && mine[0].name === 'Minha Marca' && /Minha Marca/.test(await ev(`document.querySelector('.smoke-shop-row.foot').textContent`)), JSON.stringify(mine.map(p => p.name)));
    await shot('smoke-shop-mypack.png');
    await ev(`(() => { const t = [...document.querySelectorAll('.smoke-packitem')].find(c => /Minha Marca/.test(c.textContent)); t.querySelector('.smoke-mini').click(); })()`);
    await sleep(200);
    await ev(`(() => { const f = document.querySelector('.smoke-packform'), i = f.querySelector('input'); i.value = 'Outra Marca'; f.requestSubmit(); })()`);
    await sleep(400);
    mine = await ev(`(async () => (await chrome.storage.local.get('homeboard:packs'))['homeboard:packs'] || [])()`);
    ok('…changed', mine.length === 1 && mine[0].name === 'Outra Marca', JSON.stringify(mine.map(p => p.name)));
    for (let i = 0; i < 2; i++) { await ev(`(() => { const t = [...document.querySelectorAll('.smoke-packitem')].find(c => /Outra Marca/.test(c.textContent)); t.querySelectorAll('.smoke-mini')[1].click(); })()`); await sleep(200); }
    await sleep(300);
    mine = await ev(`(async () => (await chrome.storage.local.get('homeboard:packs'))['homeboard:packs'] || [])()`);
    ok('…and deleted (asks once more first)', mine.length === 0 && !/Outra Marca/.test(await ev(`document.querySelector('.smoke-shelf').textContent`)), JSON.stringify(mine));
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
    await send('Page.bringToFront', {}, sid);          // (the headless window loses focus now and then, and its frames stop)
    await sleep(400);
    lit = false;
    for (let i = 0; i < 25 && !lit; i++) { await space('keyDown'); await sleep(250); if (/Keep the flame/.test(await hint())) lit = true; else { await space('keyUp'); await sleep(150); } }
    // hold the flame until it has really caught (slow frames on a busy machine make a fixed wait too short)
    for (let i = 0; i < 60 && !/Hold Space to draw/.test(await hint()); i++) { if (i % 8 === 0) await send('Page.bringToFront', {}, sid); if (i % 8 === 0) await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, autoRepeat: true }, sid); await sleep(250); }
    await space('keyUp'); await sleep(300);
    await space('keyDown'); await sleep(1500); await space('keyUp'); await sleep(400);
    await shot('smoke-5-cigar.png');
    ok('a cigar lights after toasting it longer', /Hold Space to draw/.test(await hint()), await hint());
    // how long you draw sets how much smoke comes out
    const st = () => ev(`(() => { const x = document.querySelector('.smoke-layer').hbState(); return { clouds: x.clouds, haze: +x.haze.toFixed(3) }; })()`);
    const drawFor = async ms => {
      await send('Page.bringToFront', {}, sid);
      await space('keyDown'); for (let t = 0; t < ms; t += 400) { await sleep(Math.min(400, ms - t)); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, autoRepeat: true }, sid); }
      await space('keyUp');
      let most = 0; for (let i = 0; i < 12; i++) { await sleep(200); most = Math.max(most, (await st()).clouds); }
      for (let i = 0; i < 40 && (await st()).clouds > 0; i++) await sleep(250);   // wait until it has cleared
      return most;
    };
    const short = await drawFor(450), long = await drawFor(2800);
    ok('a quick drag breathes out a wisp, a long draw a big cloud', short > 0 && long > short * 2.5, `short ${short} clouds, long ${long}`);
    // a closed room: the smoke stays and fills it; opening the window clears it
    const menuItem = async label => ev(`(() => { const e = document.querySelector('[data-id="s1"] .smoke-w'), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 20 })); const b = [...document.querySelectorAll('#menu .menu-item')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    const toggled = await menuItem('Closed room');
    await drawFor(2500); await drawFor(2500);
    const filled = (await st()).haze;
    await shot('smoke-8-closed-room.png');
    const savedRoom = (await ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`)).boards[0].cards.find(c => c.id === 's1').data;
    ok('a closed room fills with haze (and remembers it)', toggled && filled > .1 && savedRoom.closed === true && savedRoom.haze > .05, `haze ${filled}, saved ${JSON.stringify({ closed: savedRoom.closed, haze: savedRoom.haze })}`);
    await menuItem('Open the window'); await send('Page.bringToFront', {}, sid);
    for (let i = 0; i < 30 && (await st()).haze > 0; i++) await sleep(250);
    ok('opening the window clears it', (await st()).haze === 0, JSON.stringify(await st()));
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
