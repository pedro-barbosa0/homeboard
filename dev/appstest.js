// Apps and windows through the helper, on this computer's real desktop (runs a second helper on port 8768):
// lists Start apps and icons, then opens Character Map and a test folder in zones, checks where they landed,
// checks that opening again reuses them, and closes both. It never touches windows that were already open.
//   node dev/appstest.js <scratch folder>
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const scratch = process.argv[2] || require('os').tmpdir();
const PORT = 8768;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 300) : '')); };
const near = (a, b) => Math.abs(a - b) <= 2;
(async () => {
  const helper = spawn('node', [path.join(root, 'helper', 'server.js')], { env: { ...process.env, HB_HELPER_PORT: String(PORT) }, stdio: 'ignore', windowsHide: true });
  const token = fs.readFileSync(path.join(root, 'helper', 'token.txt'), 'utf8').trim();
  let origin = '';
  try { origin = fs.readFileSync(path.join(root, 'helper', 'paired-with.txt'), 'utf8').trim(); } catch { /* unpaired */ }
  if (!origin) { console.log('SKIP the helper is not paired yet (open the board once with the helper running)'); helper.kill(); return; }
  const call = async (route, body = {}) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
  };
  const folder = path.join(scratch, 'Homeboard workspace test');
  fs.mkdirSync(folder, { recursive: true });
  const CHARMAP = 'C:\\Windows\\System32\\charmap.exe';
  let charHwnd = 0;
  try {
    await sleep(900);
    const ping = await call('/ping');
    ok('helper says it can do apps', ping.apps === true && ping.version >= 2);
    let t = Date.now();
    const { apps } = await call('/apps/list');
    ok('Start apps listed', apps.length > 10 && apps.every(a => a.id && a.name), `${apps.length} apps in ${Date.now() - t} ms`);
    t = Date.now();
    const pick = apps.find(a => /character map|mapa de caracteres/i.test(a.name)) || apps[0];
    const { icons } = await call('/apps/icons', { targets: ['shell:AppsFolder\\' + pick.id, CHARMAP, folder], size: 48 });
    const vals = Object.values(icons);
    ok('icons come back as pictures', vals.length === 3 && vals.every(v => v.startsWith('data:image/png;base64,') && v.length > 300), `${pick.name}; ${vals.map(v => v.length).join(', ')} chars in ${Date.now() - t} ms`);
    fs.writeFileSync(path.join(scratch, 'icon-test.png'), Buffer.from(vals[1].split(',')[1], 'base64'));
    const refused = await call('/apps/launch', { appId: 'Not.A.Real.App!App' }).then(() => 'launched', e => e.message);
    ok('only Start-menu apps can be started by id', /not in the Start menu/.test(refused), refused);

    const { screens } = await call('/win/screens');
    const s = screens[0];
    ok('screens listed', screens.length >= 1 && s.ww > 0 && s.wh > 0, JSON.stringify(screens));
    const before = (await call('/win/list')).windows;
    if (before.some(w => /\\charmap\.exe$/i.test(w.exe)) || before.some(w => w.folder && w.folder.toLowerCase() === folder.toLowerCase())) {
      console.log('SKIP Character Map or the test folder is already open; close them to run the window part');
    } else {
      const items = [
        { id: 'a', kind: 'app', name: 'Character Map', path: CHARMAP, screen: 0, zone: { x: .5, y: 0, w: .5, h: 1 } },
        { id: 'f', kind: 'folder', name: 'test folder', path: folder, screen: 0, zone: { x: 0, y: 0, w: .5, h: .5 } },
      ];
      t = Date.now();
      const first = (await call('/win/open', { items })).results;
      ok('both opened and placed', first.length === 2 && first.every(r => r.placed && r.hwnd && !r.reused), JSON.stringify(first) + ` in ${Date.now() - t} ms`);
      charHwnd = (first[0] || {}).hwnd;
      await sleep(600);
      const now = (await call('/win/list')).windows;
      const cm = now.find(w => w.hwnd === first[0].hwnd), fo = now.find(w => w.hwnd === first[1].hwnd);
      ok('Character Map sits in the right half', cm && near(cm.x, s.wx + Math.round(s.ww / 2)) && near(cm.y, s.wy), cm && JSON.stringify(cm));
      ok('the folder fills the top-left quarter', fo && near(fo.x, s.wx) && near(fo.y, s.wy) && near(fo.w, Math.round(s.ww / 2)) && near(fo.h, Math.round(s.wh / 2)), fo && JSON.stringify(fo));
      ok('the program file was learnt', /charmap\.exe$/i.test(first[0].exe || ''), first[0].exe);
      // move them, then open the workspace again: the same windows come back to their zones
      t = Date.now();
      const again = (await call('/win/open', { items: [{ ...items[0], zone: { x: 0, y: .5, w: .5, h: .5 } }, items[1]] })).results;
      await sleep(400);
      const cm2 = (await call('/win/list')).windows.find(w => w.hwnd === first[0].hwnd);
      ok('opening again reuses the open windows', again.every(r => r.reused) && again[0].hwnd === first[0].hwnd, JSON.stringify(again) + ` in ${Date.now() - t} ms`);
      ok('and moves them to their zones', cm2 && near(cm2.x, s.wx) && near(cm2.y, s.wy + Math.round(s.wh / 2)), cm2 && JSON.stringify(cm2));
    }
  } catch (e) { ok('no errors', false, e.stack); }
  finally {
    // close only what this test opened
    if (charHwnd) try { const pid = ((await call('/win/list')).windows.find(w => w.hwnd === charHwnd) || {}).pid; if (pid) execFileSync('taskkill', ['/PID', String(pid)], { stdio: 'ignore' }); } catch { /* already closed */ }
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-Command', `foreach ($w in (New-Object -ComObject Shell.Application).Windows()) { try { if (([Uri]$w.LocationURL).LocalPath -eq $env:HB_DIR) { $w.Quit() } } catch {} }`], { env: { ...process.env, HB_DIR: folder }, stdio: 'ignore' });
    } catch { /* already closed */ }
    helper.kill();
    const pass = results.filter(Boolean).length;
    console.log(`\n${pass}/${results.length} passed`);
    process.exit(pass === results.length ? 0 : 1);
  }
})();
