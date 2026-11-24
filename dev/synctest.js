// Another tab's change is merged into the open board, not rebuilt: untouched cards keep their element (a website,
// a console or a widget keeps running), moved cards move, changed ones are rebuilt, new ones appear, gone ones go;
// this tab keeps looking where it was. Run from PowerShell:
//   node dev/synctest.js C:\path\to\Homeboard <new empty profile folder>
const { spawn } = require('child_process');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile] = process.argv.slice(2);
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    await sleep(2000);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [{ id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
      { id: 'n1', type: 'note', title: 'Moves', x: 60, y: 90, w: 280, h: 200, z: 1, markdown: true, md: 'I will move' },
      { id: 'n2', type: 'note', title: 'Changes', x: 380, y: 90, w: 280, h: 200, z: 2, markdown: true, md: 'old text' },
      { id: 'w1', type: 'widget', widget: 'clock', title: 'Clock', x: 700, y: 90, w: 220, h: 220, z: 3, data: {} },
      { id: 'n4', type: 'note', title: 'Goes', x: 60, y: 360, w: 280, h: 160, z: 4, markdown: true, md: 'bye' } ] }] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)))`);
    // mark the elements as they are now, and where this tab looks
    await ev(`(() => { for (const id of ['n1', 'n2', 'w1']) document.querySelector('[data-id="' + id + '"]').__mark = id; })()`);
    const viewBefore = await ev(`document.querySelector('#world').style.transform`);
    // "another tab" saves: n1 moved, n2 edited, n3 new, n4 gone, and it looks somewhere else
    await ev(`chrome.storage.local.get('homeboard:v1').then(r => { const s = r['homeboard:v1'], b = s.boards[0];
      b.view = { x: -500, y: -300, z: .5 };
      b.cards.find(c => c.id === 'n1').x = 160;
      b.cards.find(c => c.id === 'n2').md = 'new text from the other tab';
      b.cards = b.cards.filter(c => c.id !== 'n4');
      b.cards.push({ id: 'n3', type: 'note', title: 'New', x: 380, y: 360, w: 280, h: 160, z: 5, markdown: true, md: 'hello' });
      s.writer = 'another-tab'; s.rev = Date.now();
      return chrome.storage.local.set({ 'homeboard:v1': s }); })`);
    await sleep(1200);
    const after = await ev(`(() => { const q = id => document.querySelector('[data-id="' + id + '"]');
      return { n1kept: q('n1')?.__mark === 'n1', n1left: q('n1')?.style.left || q('n1')?.style.transform, w1kept: q('w1')?.__mark === 'w1',
        n2rebuilt: !!q('n2') && q('n2').__mark !== 'n2', n2text: q('n2')?.textContent.includes('new text') || false, n3: !!q('n3'), n4: !!q('n4'),
        view: document.querySelector('#world').style.transform }; })()`);
    ok('an untouched card keeps its element (its window or widget keeps running)', after.w1kept, JSON.stringify(after));
    ok('a moved card keeps its element and moves', after.n1kept && /160/.test(after.n1left), after.n1left);
    ok('a changed card is rebuilt with the new content', after.n2rebuilt && after.n2text);
    ok('a new card appears, a deleted one goes', after.n3 && !after.n4);
    ok('this tab keeps looking where it was', after.view === viewBefore, `${viewBefore} / ${after.view}`);
    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(results.every(Boolean) ? 0 : 1);
})();
