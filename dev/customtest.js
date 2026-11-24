// Custom components: the sandbox runs them, they get the time / theme / sound levels, save their settings and open
// links; they cannot reach the board or the extension; a file component reloads when its file changes; the shipped
// examples render. Photographs the board. Run from PowerShell:
//   node dev/customtest.js C:\path\to\Homeboard <new empty profile folder> [screenshot folder]
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 300) : '')); };
const tmpDir = path.join(ext, 'components', 'zz-test');
(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'index.html'), `<div id="v">one</div><script>homeboard.save({ version: 1 });</script>`);
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} process.exit(c); };
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    // a probe component: tries what it should not be able to do, records what it can
    const probe = `<div id="p">probe</div><script>
      const r = { ran: true };
      try { r.parentDoc = !!parent.document.body; } catch { r.parentDoc = false; }
      r.chromeApi = !!(window.chrome && chrome.runtime && chrome.runtime.id);
      try { r.storage = !!localStorage.getItem; } catch { r.storage = false; }
      r.theme = homeboard.theme.accent || '';
      homeboard.save(r);
      homeboard.on('levels', lv => { if (lv && !homeboard.settings.gotLevels) homeboard.save({ gotLevels: lv.length }); });
      setTimeout(() => homeboard.open('https://example.com/from-component'), 300);
      setTimeout(() => homeboard.open('javascript:alert(1)'), 400);
    </script>`;
    const cards = [
      { id: 'pr', type: 'widget', widget: 'custom', title: 'probe', x: 40, y: 80, w: 200, h: 120, z: 1, data: { source: 'board', name: 'Probe', code: probe } },
      { id: 'fz', type: 'widget', widget: 'custom', title: 'file', x: 260, y: 80, w: 200, h: 120, z: 2, data: { source: 'file', id: 'zz-test', name: 'Test file' } },
      { id: 'd1', type: 'widget', widget: 'custom', title: 'sky', x: 40, y: 240, w: 320, h: 230, z: 3, data: { source: 'file', id: 'daynight-clock', name: 'Day & night sky' } },
      { id: 'd2', type: 'widget', widget: 'custom', title: 'words', x: 380, y: 240, w: 320, h: 300, z: 4, data: { source: 'file', id: 'word-clock', name: 'Word clock' } },
      { id: 'd3', type: 'widget', widget: 'custom', title: 'orb', x: 720, y: 240, w: 260, h: 260, z: 5, data: { source: 'file', id: 'beat-orb', name: 'Beat orb' } },
      { id: 'd4', type: 'widget', widget: 'custom', title: 'count', x: 1000, y: 240, w: 300, h: 200, z: 6, data: { source: 'file', id: 'countdown', name: 'Countdown', settings: { name: 'Holidays', when: '2027-08-01T09:00' } } },
      { id: 'np', type: 'widget', widget: 'custom', title: 'new', x: 1000, y: 470, w: 300, h: 260, z: 7, data: {} },
      { id: 's1', type: 'note', title: 'Styled', x: 40, y: 560, w: 220, h: 120, z: 8, markdown: true, md: 'red title', css: '.card-title { color: rgb(255, 0, 0); } :scope { outline: 2px solid rgb(255, 0, 0); }' },
      { id: 'db', type: 'widget', widget: 'custom', title: 'button', x: 720, y: 560, w: 260, h: 200, z: 10, surface: 'dark', data: { source: 'board', name: 'Button', code: `<style>body{display:grid;place-items:center}button{font:inherit;padding:20px 30px}</style><button id="b">Press</button><script>document.getElementById('b').addEventListener('click', () => homeboard.save({ pressed: true }));</script>` } },
      { id: 's2', type: 'note', title: 'Plain', x: 280, y: 560, w: 220, h: 120, z: 9, markdown: true, md: 'not styled' },
    ];
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false, scene: 'aurora', userCss: '#dock { outline: 3px solid rgb(0, 255, 0); }' }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version,
      boards: [{ id: 'a', name: 'Components', view: { x: 0, y: 0, z: 1 }, strings: [], cards: ${JSON.stringify(cards)} }] } })`);
    await send('Page.enable', {}, sid);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; };` }, sid);
    await send('Page.reload', {}, sid);
    await sleep(800);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)));
      (() => { const t0 = performance.now(); window.HomeboardAudio.now = () => ({ title: 'beat', bands: Uint8Array.from({ length: 96 }, (_, i) => i < 10 ? 120 + 120 * Math.abs(Math.sin((performance.now() - t0) / 250)) : 90) }); })()`);
    for (let i = 0; i < 8; i++) { await send('Page.bringToFront', {}, sid); await sleep(400); }
    const stored = async cid => ev(`chrome.storage.local.get('homeboard:v1').then(r => (r['homeboard:v1'].boards[0].cards.find(c => c.id === '${cid}') || {}).data || {})`);
    let pr = (await stored('pr')).settings || {};
    for (let i = 0; i < 10 && !pr.gotLevels; i++) { await send('Page.bringToFront', {}, sid); await sleep(400); pr = (await stored('pr')).settings || {}; }
    ok('a component runs in the sandbox and can save its own settings', pr.ran === true, JSON.stringify(pr));
    ok('…it cannot reach the board, the extension or the board\'s storage', pr.parentDoc === false && pr.chromeApi === false && pr.storage === false, JSON.stringify({ parentDoc: pr.parentDoc, chromeApi: pr.chromeApi, storage: pr.storage }));
    ok('…it gets the board\'s colours', /^#|rgb/.test(pr.theme || ''), pr.theme);
    ok('…and the sound levels while something plays', pr.gotLevels === 96, pr.gotLevels);
    const opened = await ev('window.__opened');
    ok('…it may open web addresses, nothing else', opened.length === 1 && opened[0] === 'https://example.com/from-component', JSON.stringify(opened));
    // the file component, then its file changes
    ok('a file component runs', (await stored('fz')).settings?.version === 1, JSON.stringify((await stored('fz')).settings));
    fs.writeFileSync(path.join(tmpDir, 'index.html'), `<div id="v">two</div><script>homeboard.save({ version: 2 });</script>`);
    let v2 = null;
    for (let i = 0; i < 12 && v2 !== 2; i++) { await send('Page.bringToFront', {}, sid); await sleep(500); v2 = (await stored('fz')).settings?.version; }
    if (process.env.HB_DEBUG) console.log('debug fetch', JSON.stringify(await ev(`fetch('components/zz-test/index.html', { cache: 'no-store' }).then(r => r.text())`)));
    ok('…and reloads by itself when the file changes', v2 === 2, v2);
    const pick = await ev(`(() => { const p = document.querySelector('[data-id="np"] .cc-pick'); return p && { items: [...p.querySelectorAll('.cc-item b')].map(b => b.textContent), buttons: [...p.querySelectorAll('.btn')].map(b => b.textContent) }; })()`);
    ok('a new custom card offers the components, "Write my own" and "Design with AI"', pick && pick.items.includes('Day & night sky') && pick.items.includes('Word clock') && pick.buttons.some(b => /Write my own/.test(b)) && pick.buttons.some(b => /Design with AI/.test(b)), JSON.stringify(pick));
    // Design with AI writes a brief with the description and the reference
    await ev(`[...document.querySelectorAll('[data-id="np"] .cc-pick .btn')].find(b => /Design with AI/.test(b.textContent)).click()`);
    await sleep(600);
    await ev(`(() => { const t = document.querySelector('.cc-want'); t.value = 'a pixel-art sky clock'; t.dispatchEvent(new Event('input')); })()`);
    const brief = await ev(`document.querySelector('.cc-editor .cc-code').value`);
    ok('Design with AI writes a complete brief (the wish, where the file goes, the reference)', /a pixel-art sky clock/.test(brief) && /components\/a-pixel-art-sky\/index\.html/.test(brief) && /homeboard\.on\('time'/.test(brief), brief.slice(0, 160));
    await ev(`[...document.querySelectorAll('.cc-editor .btn')].find(b => b.textContent === 'Close').click()`);
    await sleep(300);
    if (outDir) { await send('Page.bringToFront', {}, sid); await sleep(300); const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, 'components.png'), Buffer.from(data, 'base64')); }
    // one real click on a card that is not selected: it reaches the component (its button is pressed)
    const dbr = await ev(`(() => { const r = document.querySelector('[data-id="db"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * .45 }; })()`);
    await ev(`document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'))`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dbr.x, y: dbr.y, button: 'left', clickCount: 1 }, sid);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dbr.x, y: dbr.y, button: 'left', clickCount: 1 }, sid);
    let spin = null;
    for (let i = 0; i < 10 && !spin; i++) { await send('Page.bringToFront', {}, sid); await sleep(300); spin = (await stored('db')).settings?.pressed; }
    ok('one click on a component card reaches the component (its button is pressed)', spin === true, JSON.stringify((await stored('db')).settings));
    if (outDir) { await sleep(900); const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: dbr.x - 160, y: dbr.y - 160, width: 320, height: 320, scale: 1 } }, sid); fs.writeFileSync(path.join(outDir, 'first-click.png'), Buffer.from(data, 'base64')); }
    const css = await ev(`({ styled: getComputedStyle(document.querySelector('[data-id="s1"] .card-title')).color, root: getComputedStyle(document.querySelector('[data-id="s1"]')).outlineColor, plain: getComputedStyle(document.querySelector('[data-id="s2"] .card-title')).color, dock: getComputedStyle(document.querySelector('#dock')).outlineColor })`);
    ok('the CSS of one card changes that card only (:scope is the card itself)', css.styled === 'rgb(255, 0, 0)' && css.root === 'rgb(255, 0, 0)' && css.plain !== 'rgb(255, 0, 0)', JSON.stringify(css));
    ok('the CSS of the board applies over everything', css.dock === 'rgb(0, 255, 0)', css.dock);
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(results.every(Boolean) ? 0 : 1);
})();
