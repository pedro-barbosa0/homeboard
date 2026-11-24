// Menus of looks open as galleries (tiles that show each option, often the widget itself, live); picking a tile applies
// it; the pool table has a table in the album cover's colours; neon looks follow the accent. Photographs the galleries.
//   node dev/gallerytest.js C:\path\to\Homeboard <new empty profile folder> [screenshot folder]
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
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 120000);
  let id = 0, buf = ''; const pending = new Map();
  proc.stdio[4].on('data', chunk => { buf += chunk.toString('utf8'); let i; while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const p = pending.get(m.id); if (!p) continue; pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  try {
    const r = await send('Extensions.loadUnpacked', { path: ext });
    const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${r.id}/index.html` });
    const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async e => { const v = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    const cards = [
      { id: 'pl', type: 'widget', widget: 'pool', title: 'Pool', x: 40, y: 80, w: 560, h: 300, z: 1, data: {} },
      { id: 'ck', type: 'widget', widget: 'clock', title: 'Clock', x: 640, y: 80, w: 220, h: 230, z: 2, data: { skin: 'neon' } },
      { id: 'ym', type: 'widget', widget: 'ytm', title: 'YTM', x: 900, y: 80, w: 420, h: 150, z: 3, data: { look: 'glass' } },
      { id: 'fr', type: 'widget', widget: 'frame', title: 'Frame', x: 40, y: 420, w: 250, h: 310, z: 4, data: { style: 'gilded', source: 'music' } },
      { id: 'vz', type: 'widget', widget: 'viz', title: 'Viz', x: 340, y: 440, w: 440, h: 170, z: 5, data: { style: 'bars' } },
    ];
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false, theme: 'neon', accent: '#ff7a1a' }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version,
      boards: [{ id: 'a', name: 'Looks', view: { x: 0, y: 0, z: 1 }, strings: [], cards: ${JSON.stringify(cards)} }] } })`);
    await send('Page.reload', {}, sid); await sleep(3000); await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);
    const openGallery = (cid, label, sel) => ev(`(async () => {
      const t = document.querySelector('[data-id="${cid}"] ${sel || '.card-body'}'), r = t.getBoundingClientRect();
      t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 20 }));
      const item = [...document.querySelectorAll('#menu .menu-item')].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)}));
      if (!item) return { error: 'no item ' + ${JSON.stringify(label)} };
      item.click(); await new Promise(x => setTimeout(x, 700));
      const m = document.querySelector('#menu');
      const tiles = [...m.querySelectorAll('.gallery-tile')];
      return { gallery: m.classList.contains('gallery'), tiles: tiles.length, names: tiles.map(t => t.querySelector(':scope > span').textContent.trim()), withPreview: tiles.filter(t => { const p = t.querySelector('.gallery-pic'); return p.children.length || p.style.background; }).length, live: m.querySelectorAll('.gallery-card').length };
    })()`);
    const shoot = async name => { if (!outDir) return; await send('Page.bringToFront', {}, sid); await sleep(500); const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64')); };
    // the pool table
    const pool = await openGallery('pl', 'Change table');
    ok('the pool table\'s tables open as a gallery, each one drawn', pool.gallery && pool.tiles >= 9 && pool.withPreview === pool.tiles, JSON.stringify(pool));
    ok('…with a table in the album cover\'s colours', pool.names.includes('From the album cover'), JSON.stringify(pool.names));
    await shoot('gallery-pool.png');
    await ev(`[...document.querySelectorAll('#menu .gallery-tile')].find(t => t.querySelector(':scope > span').textContent.trim() === 'Purple').click()`);
    await sleep(600);
    const saved = async cid => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'].boards[0].cards.find(c => c.id === '${cid}').data)`);
    ok('…picking a tile applies it (and closes the gallery)', (await saved('pl')).skin === 'purple' && await ev(`document.querySelector('#menu').hidden && !document.querySelector('#menu .gallery-card')`), JSON.stringify(await saved('pl')));
    // the clock, live previews
    const clock = await openGallery('ck', 'Change clock');
    ok('the clock faces open as a gallery of live clocks', clock.gallery && clock.tiles >= 14 && clock.live >= 14, JSON.stringify({ tiles: clock.tiles, live: clock.live }));
    await shoot('gallery-clock.png');
    await ev(`[...document.querySelectorAll('#menu .gallery-tile')].find(t => t.querySelector(':scope > span').textContent.trim() === 'Flip clock').click()`); await sleep(600);
    ok('…and a face can be picked from it', (await saved('ck')).skin === 'flip');
    // YouTube Music looks and bars, the frame, the visualiser
    const looks = await openGallery('ym', 'Look', '.ytm');
    ok('YouTube Music looks open as a gallery (the widget in each look)', looks.gallery && looks.tiles >= 10 && looks.live === looks.tiles, JSON.stringify({ tiles: looks.tiles, live: looks.live }));
    await shoot('gallery-ytm.png');
    await ev(`document.body.click(); document.querySelector('#menu').hidden = true`);
    const bars = await openGallery('ym', 'Progress bar', '.ytm');
    ok('…and the progress bars', bars.gallery && bars.tiles === 8, JSON.stringify({ tiles: bars.tiles }));
    const frames = await openGallery('fr', 'Frame', '.pf');
    ok('picture frames open as a gallery', frames.gallery && frames.tiles >= 10 && frames.live === frames.tiles, JSON.stringify({ tiles: frames.tiles }));
    await shoot('gallery-frame.png');
    const viz = await openGallery('vz', 'Background', '.viz');
    ok('the visualiser\'s backgrounds open as a gallery', viz.gallery && viz.tiles === 6 && viz.live === 6, JSON.stringify({ tiles: viz.tiles }));
    await ev(`document.querySelector('#menu').hidden = true`);
    // neon follows the accent
    await sleep(2200);
    const neon = await ev(`(() => { const rim = document.querySelector('[data-id="ck"] .clock-face circle, [data-id="ck"] .clock-face line'); return { accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), border: getComputedStyle(document.documentElement).getPropertyValue('--border').trim() }; })()`);
    ok('the Neon theme takes the accent (borders, glow)', /255, 122, 26/.test(neon.accent) && /255, 122, 26/.test(neon.border), JSON.stringify(neon));
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(results.every(Boolean) ? 0 : 1);
})();
