// Website windows: zooming from inside the site (Ctrl + scroll, Ctrl + plus / 0), and coming back to the same
// page and scroll position after the board is opened again. Run from PowerShell:
//   node dev/webzoomtest.js C:\path\to\Homeboard <new empty profile folder>
const { spawn } = require('child_process');
const http = require('http');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
const seen = { one: 0, two: 0 };                         // what the pages say about their own scroll position
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/pos') { seen[u.searchParams.get('p')] = +u.searchParams.get('y'); res.end('ok'); return; }
  const p = u.pathname === '/two' ? 'two' : 'one';
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><title>Page ${p}</title><body style="margin:0;font:16px sans-serif"><a id="next" href="/two">to page two</a>
    <div style="height:6000px;background:linear-gradient(#fff,#99c)">tall page ${p}</div>
    <script>setInterval(() => fetch('/pos?p=${p}&y=' + Math.round(scrollY)), 250);</script>`);
}).listen(8795, '127.0.0.1');
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} server.close(); process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 240000);
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
    const card = async () => (await ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`)).boards[0].cards[0];
    const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }, sid); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }, sid); };
    const wheel = (x, y, dy, mod = 0) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, modifiers: mod }, sid);
    const key = async (k, code, vk, mod) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod }, sid); };
    await sleep(2200);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'w1', type: 'web', title: 'Site', x: 100, y: 90, w: 700, h: 500, z: 1, url: 'http://127.0.0.1:8795/one' }] } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(3000);
    await send('Page.bringToFront', {}, sid);
    const box = await ev(`(() => { const r = document.querySelector('[data-id="w1"] .web-frame').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    await click(box.x, box.y);                            // start using the site
    await sleep(500);

    // --- zoom from inside the site ---
    for (let i = 0; i < 3; i++) { await wheel(box.x, box.y, -100, 2); await sleep(60); }
    await sleep(700);
    let c = await card();
    const scale = await ev(`getComputedStyle(document.querySelector('[data-id="w1"] iframe')).transform`);
    ok('Ctrl + scroll inside the site zooms the window', c.zoom > 1.4 && /matrix\(1\.[4-9]/.test(scale), `zoom ${c.zoom}, ${scale}`);
    ok('…and says so', /Zoom 1[4-6]\d%/.test(await ev(`document.querySelector('#hud')?.textContent || ''`)));
    await key('0', 'Digit0', 48, 2);
    await sleep(500);
    c = await card();
    ok('Ctrl + 0 inside the site goes back to 100%', c.zoom === 1, c.zoom);
    await key('=', 'Equal', 187, 2);
    await sleep(500);
    c = await card();
    ok('Ctrl + plus zooms in a step', Math.abs(c.zoom - 1.1) < .01, c.zoom);
    ok('the board itself did not zoom', await ev(`document.querySelector('#zoom-label').textContent`) === '100%');

    // --- coming back to the same spot ---
    await wheel(box.x, box.y, 1200); await sleep(200); await wheel(box.x, box.y, 1200);
    await sleep(1600);
    c = await card();
    ok('where you are on the site is kept', c.last && /\/one$/.test(c.last.url) && c.last.y > 1500, JSON.stringify(c.last));
    const before = seen.one;
    await send('Page.reload', {}, sid);
    seen.one = -1;
    await sleep(4000);
    await send('Page.bringToFront', {}, sid);
    ok('opening the board again brings the site back to the same spot', Math.abs(seen.one - before) < 5 && before > 1500, `was ${before}, now ${seen.one}`);
    // another page inside the window is remembered too
    await ev(`void 0`);
    const nb = await ev(`(() => { const r = document.querySelector('[data-id="w1"] .web-frame').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    await click(nb.x, nb.y); await sleep(300);
    await wheel(nb.x, nb.y, -6000); await sleep(800);
    const link = await ev(`(() => { const r = document.querySelector('[data-id="w1"] .web-frame').getBoundingClientRect(); return { x: Math.round(r.x + 30), y: Math.round(r.y + 9) }; })()`);
    await click(link.x, link.y);                         // the link at the top-left of the page
    await sleep(2000);
    c = await card();
    ok('going to another page inside the window is remembered', c.last && /\/two$/.test(c.last.url) && c.url.endsWith('/one'), JSON.stringify({ last: c.last, url: c.url }));
    await send('Page.reload', {}, sid);
    seen.two = -1;
    await sleep(3500);
    ok('…and it opens there next time', seen.two === 0, `page two reports ${seen.two}`);
    // the button next to the address goes back to the address, at its top
    await ev(`document.querySelector('[data-id="w1"] button[aria-label="Back to this address"]').click()`);
    await sleep(1500);
    c = await card();
    ok('"back to this address" starts fresh', !c.last || /\/one$/.test(c.last.url), JSON.stringify(c.last));
    // a crashed page is loaded again by itself
    await send('Page.bringToFront', {}, sid);
    await sleep(22000);                                    // the board watches only after being on screen a while
    const frames = (await send('Target.getTargets')).targetInfos.filter(t => t.type === 'iframe' && /8795/.test(t.url));
    if (frames.length) {
      const { sessionId: fs2 } = await send('Target.attachToTarget', { targetId: frames[0].targetId, flatten: true });
      send('Page.crash', {}, fs2).catch(() => {});
      seen.one = -1; seen.two = -1;
      for (let i = 0; i < 60 && seen.one < 0 && seen.two < 0; i++) { if (i % 5 === 0) await send('Page.bringToFront', {}, sid); await sleep(1000); }   // (the board heals only while it is on screen)
      ok('a website window whose page crashed is loaded again by itself', seen.one >= 0 || seen.two >= 0, JSON.stringify(seen) + ' ' + JSON.stringify(await ev('({ hud: document.querySelector("#hud")?.textContent, toast: document.querySelector("#toast")?.textContent, frames: document.querySelectorAll("iframe").length, vis: document.visibilityState })')) + ' targets ' + JSON.stringify((await send('Target.getTargets')).targetInfos.filter(t => t.type === 'iframe').map(t => t.url)));
    } else ok('a website window whose page crashed is loaded again by itself', false, 'no frame to crash');
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
