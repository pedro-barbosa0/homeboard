// Update cycle, end to end, in throwaway folders and a throwaway Edge profile:
// install an "older" build, use it, update it while Edge is open, check the board was kept and the
// new code runs, then roll back. Run from PowerShell:  node dev/updatetest.js <empty temp folder>
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const src = path.resolve(__dirname, '..');
const work = path.resolve(process.argv[2]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 260) : '')); };
const ps = (script, ...args) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { encoding: 'utf8' });

(async () => {
  const older = path.join(work, 'older'), daily = path.join(work, 'daily'), profile = path.join(work, 'profile');
  // an "older" build: same files, lower version, and a marker so we can tell which code a tab runs
  fs.cpSync(src, older, { recursive: true, filter: p => !/[\\/](\.git|dev|backups|node_modules)([\\/]|$)/.test(p.slice(src.length)) && !/token\.txt$|paired-with\.txt$/.test(p) });
  const m = JSON.parse(fs.readFileSync(path.join(older, 'manifest.json'), 'utf8'));
  const newVersion = m.version; m.version = '1.0.9';
  fs.writeFileSync(path.join(older, 'manifest.json'), JSON.stringify(m, null, 2));
  fs.writeFileSync(path.join(older, 'index.html'), fs.readFileSync(path.join(older, 'index.html'), 'utf8').replace('<head>', '<head>\n<meta name="hb-build" content="older">'));

  console.log(ps(path.join(older, 'tools', 'install.ps1'), '-Target', daily).trim());
  // things that belong to the daily copy and must survive updates
  fs.mkdirSync(path.join(daily, 'helper'), { recursive: true }); fs.mkdirSync(path.join(daily, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(daily, 'helper', 'token.txt'), 'a'.repeat(64));
  fs.writeFileSync(path.join(daily, 'backups', 'homeboard-2026-01-01.json'), '{"keep":true}');

  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 120000);
  let id = 0, buf = ''; const pending = new Map();
  proc.stdio[4].on('data', chunk => {
    buf += chunk.toString('utf8'); let i;
    while ((i = buf.indexOf('\0')) >= 0) { const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const p = pending.get(msg.id); if (!p) continue; pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  const open = async url => { const { targetId } = await send('Target.createTarget', { url }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }); return sessionId; };
  const evIn = async (sid, expression) => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
  try {
    const r = await send('Extensions.loadUnpacked', { path: daily });
    const expectId = 'ighnfalcemcbjacbfpakkkhdbdbbabdm';
    ok('the extension has its fixed ID, whatever folder it is loaded from', r.id === expectId, r.id);
    const base = `chrome-extension://${r.id}/index.html`;
    let s1 = await open(base);
    await sleep(2500);
    await evIn(s1, `document.querySelector('[data-add="note"]').click()`);
    await send('Input.insertText', { text: 'written on the older version' }, s1);
    await sleep(900);
    const before = await evIn(s1, `chrome.storage.local.get('homeboard:v1').then(r => ({ seen: r['homeboard:v1'].seenVersion, build: document.querySelector('meta[name=hb-build]')?.content || 'new' }))`);
    ok('older build runs and records its version', before.seen === '1.0.9' && before.build === 'older', JSON.stringify(before));

    // update while Edge is open
    console.log(ps(path.join(src, 'tools', 'install.ps1'), '-Target', daily).trim().split('\n').join(' | '));
    ok('update keeps the helper key and the backups', fs.readFileSync(path.join(daily, 'helper', 'token.txt'), 'utf8') === 'a'.repeat(64) && fs.existsSync(path.join(daily, 'backups', 'homeboard-2026-01-01.json')));
    ok('the version you had is kept for going back', JSON.parse(fs.readFileSync(path.join(daily + '-previous', 'manifest.json'), 'utf8')).version === '1.0.9');

    const s2 = await open(base);
    await sleep(2500);
    const after = await evIn(s2, `chrome.storage.local.get(null).then(r => ({ seen: r['homeboard:v1'].seenVersion, note: JSON.stringify(r['homeboard:v1']).includes('written on the older version'),
      build: document.querySelector('meta[name=hb-build]')?.content || 'new', snapFrom: r['homeboard:before-update']?.from, snapTo: r['homeboard:before-update']?.to,
      snapNote: JSON.stringify(r['homeboard:before-update']?.data || {}).includes('written on the older version') }))`);
    ok('a new tab runs the new code, without reloading the extension', after.build === 'new' && after.seen === newVersion, JSON.stringify(after));
    ok('the board survived, and a copy from before the update was kept', after.note && after.snapFrom === '1.0.9' && after.snapTo === newVersion && after.snapNote, JSON.stringify(after));
    await evIn(s2, `document.querySelector('#settings-btn').click()`);
    await sleep(500);
    const ui = await evIn(s2, `({ version: document.querySelector('#version-note').textContent, undo: document.querySelector('#undo-update').hidden ? '' : document.querySelector('#undo-update').textContent })`);
    ok('Customize shows the version and offers to undo the update', ui.version.includes(newVersion) && ui.undo.includes(newVersion), JSON.stringify(ui));

    // undo the data side
    await evIn(s2, `document.querySelectorAll('.note-text')[0].focus()`);
    await evIn(s2, `(() => { const n = [...document.querySelectorAll('.card-note .note-text')].find(e => e.textContent.includes('written on the older')); n.textContent = 'changed after the update'; n.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(800);
    await evIn(s2, `window.confirm = () => true; document.querySelector('#undo-update').click()`);
    await sleep(900);
    const undone = await evIn(s2, `chrome.storage.local.get('homeboard:v1').then(r => { const t = JSON.stringify(r['homeboard:v1']); return { old: t.includes('written on the older version'), changed: t.includes('changed after the update') }; })`);
    ok('"Undo the last update" brings the board back', undone.old && !undone.changed, JSON.stringify(undone));

    // roll the program back
    console.log(ps(path.join(src, 'tools', 'rollback.ps1'), '-Target', daily).trim());
    ok('rollback puts the earlier version back and keeps key and backups', JSON.parse(fs.readFileSync(path.join(daily, 'manifest.json'), 'utf8')).version === '1.0.9'
      && fs.existsSync(path.join(daily, 'helper', 'token.txt')) && fs.existsSync(path.join(daily, 'backups', 'homeboard-2026-01-01.json')));
    const s3 = await open(base);
    await sleep(2500);
    ok('after rollback a new tab runs the earlier build', await evIn(s3, `document.querySelector('meta[name=hb-build]')?.content`) === 'older');
  } catch (e) { console.log('ERROR', e.stack || e.message); results.push(false); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
