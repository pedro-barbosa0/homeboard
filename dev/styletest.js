// Style kits, Shuffle, materials and backdrops, widgets restyled on every board, the picture frame, and cover colours.
// Takes a screenshot per kit for a look. Run from PowerShell:
//   node dev/styletest.js C:\Users\Pedro\Homeboard <new empty profile folder> [screenshot folder]
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
// a small picture with a clear colour: orange top, blue bottom
function bmp() {
  const w = 32, hgt = 32, row = w * 3, pad = (4 - row % 4) % 4, size = 54 + (row + pad) * hgt, b = Buffer.alloc(size);
  b.write('BM', 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(hgt, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(size - 54, 34);
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) { const o = 54 + y * (row + pad) + x * 3, top = y >= hgt / 2; b[o] = top ? 30 : 220; b[o + 1] = top ? 120 : 80; b[o + 2] = top ? 255 : 30; }
  return b;
}
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'image/bmp' }); res.end(bmp()); }).listen(8797, '127.0.0.1');
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
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
    const stored = () => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`);
    const shot = async name => { if (!outDir) return; await sleep(500); const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64')); };
    await sleep(2200);
    // a picture for the frame, made in the page
    const pic = await ev(`(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 380; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 300, 380); gr.addColorStop(0, '#f6a35b'); gr.addColorStop(.5, '#d9485f'); gr.addColorStop(1, '#3a2c6b'); g.fillStyle = gr; g.fillRect(0, 0, 300, 380); g.fillStyle = '#fff3'; g.beginPath(); g.arc(150, 150, 60, 0, 7); g.fill(); return c.toDataURL('image/jpeg', .8); })()`);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
        { id: 'n1', type: 'note', title: 'Ideas', x: 60, y: 90, w: 300, h: 220, z: 1, markdown: true, md: '# Today\\n- a walk\\n- **music** on\\n- tidy the board' },
        { id: 't1', type: 'todo', title: 'To-do', x: 390, y: 90, w: 280, h: 220, z: 2, items: [{ id: 'i1', text: 'Pick a style', done: true, steps: [], note: '', link: '', due: '', star: false }, { id: 'i2', text: 'Frame a picture', done: false, steps: [], note: '', link: '', due: '', star: false }] },
        { id: 'y1', type: 'widget', widget: 'ytm', title: 'YouTube Music', x: 60, y: 340, w: 420, h: 150, z: 3, data: { look: 'glass' } },
        { id: 'f1', type: 'widget', widget: 'frame', title: 'Frame', x: 720, y: 90, w: 250, h: 310, z: 4, data: { style: 'gilded', source: 'picture', pic: ${JSON.stringify(pic)} } },
        { id: 'l1', type: 'links', title: 'Links', x: 1010, y: 90, w: 300, h: 200, z: 5, links: [{ id: 'k1', title: 'Wikipedia', url: 'https://www.wikipedia.org/' }] } ] },
      { id: 'b', name: 'Other', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'y2', type: 'widget', widget: 'ytm', title: 'YTM', x: 60, y: 90, w: 420, h: 150, z: 1, data: { look: 'minimal' } }] } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);
    await shot('style-0-default.png');

    const fr = await ev(`(() => { const p = document.querySelector('.pf'); return p && { style: p.dataset.style, img: !!p.querySelector('.pf-img')?.src.startsWith('data:image'), pad: getComputedStyle(p.querySelector('.pf-frame')).paddingTop }; })()`);
    ok('the picture frame shows your picture in a gilded frame', fr && fr.style === 'gilded' && fr.img && parseFloat(fr.pad) > 5, JSON.stringify(fr));
    const pal = await ev(`window.HomeboardMusic.palette('http://127.0.0.1:8797/x.bmp')`);
    ok('cover colours can be read from a picture (a vivid one picked)', pal && /^#[0-9a-f]{6}$/.test(pal.vivid) && (() => { const c = [1, 3, 5].map(i => parseInt(pal.vivid.slice(i, i + 2), 16)); return Math.max(...c) - Math.min(...c) > 100; })(), JSON.stringify(pal));

    await ev(`document.querySelector('#settings-btn').click()`);
    await sleep(300);
    const kits = await ev(`[...document.querySelectorAll('#style-sec .kit')].map(k => k.textContent)`);
    ok('Customize starts with style kits and Shuffle', kits.length >= 8 && kits.includes('Liquid glass') && kits.some(k => /Shuffle/.test(k)), JSON.stringify(kits));
    for (const [i, name] of ['Liquid glass', 'Gallery', 'Neon nights', 'Vinyl lounge', 'Calm dawn'].entries()) {
      await ev(`[...document.querySelectorAll('#style-sec .kit')].find(k => k.textContent === ${JSON.stringify(name)}).click()`);
      await ev(`document.querySelector('#settings').hidden = true`);
      await sleep(400);
      await shot(`style-${i + 1}-${name.replace(/\s+/g, '-').toLowerCase()}.png`);
      await ev(`document.querySelector('#settings-btn').click()`);
      await sleep(200);
    }
    await ev(`[...document.querySelectorAll('#style-sec .kit')].find(k => k.textContent === 'Liquid glass').click()`);
    await sleep(500);
    let st = await stored();
    const body = await ev(`({ material: document.body.dataset.material, theme: document.body.dataset.theme, bg: getComputedStyle(document.documentElement).getPropertyValue('--bg-image').slice(0, 30), blur: getComputedStyle(document.querySelector('[data-id="n1"]')).backdropFilter })`);
    ok('a kit sets material, theme and backdrop together', body.material === 'liquid' && body.theme === 'midnight' && /radial-gradient/.test(body.bg) && /blur/.test(body.blur), JSON.stringify(body));
    ok('…and the YouTube Music widgets on every board, and the frames', st.boards[1].cards[0].data.look === 'liquid' && st.boards[0].cards.find(c => c.id === 'y1').data.look === 'liquid' && st.boards[0].cards.find(c => c.id === 'f1').data.style === 'white', JSON.stringify([st.boards[1].cards[0].data, st.boards[0].cards.find(c => c.id === 'f1').data.style]));
    await ev(`[...document.querySelectorAll('#toast button')].find(b => b.textContent === 'Undo').click()`);
    await sleep(400);
    st = await stored();
    ok('Undo puts the previous kit back (Calm dawn), widgets too', st.settings.material === 'liquid' && st.settings.scene === 'aurora' && st.boards[1].cards[0].data.look === 'pill', JSON.stringify([st.settings.material, st.boards[1].cards[0].data.look]));
    await ev(`[...document.querySelectorAll('#style-sec .kit')].find(k => /Shuffle/.test(k.textContent)).click()`);
    await sleep(400);
    st = await stored();
    ok('Shuffle makes a new combination', /^#[0-9a-f]{6}$/.test(st.settings.accent) && !!st.settings.material && !!st.settings.scene, JSON.stringify({ m: st.settings.material, s: st.settings.scene, a: st.settings.accent }));
    await ev(`[...document.querySelectorAll('#style-sec .style-chip')].find(c => c.textContent === 'Paper').click()`);
    ok('a material can be picked on its own', await ev(`document.body.dataset.material`) === 'paper');
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
