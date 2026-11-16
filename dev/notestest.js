// Markdown notes, Markdown export, .md files dropped as notes, saved views, the locked view, and
// website windows that show only the site. Run from PowerShell:
//   node dev/notestest.js C:\Users\Pedro\Homeboard <new empty profile folder> [screenshot folder]
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
    const ev = async expression => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
    const key = async (k, vk, extra = {}) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: extra.code || k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...extra }, sid); };
    const type = text => send('Input.insertText', { text }, sid);
    const stored = () => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`);
    const menuOn = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 8 })); return [...document.querySelectorAll('#menu .menu-item')].map(b => b.textContent.trim()); })()`);
    const pick = label => ev(`(() => { const b = [...document.querySelectorAll('#menu .menu-item')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    await sleep(2200);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'a', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'a', name: 'Home', view: { x: 0, y: 0, z: 1 }, strings: [{ id: 's1', from: 'n2', to: 'td' }], cards: [
        { id: 'n1', type: 'note', title: 'Old note', x: 60, y: 80, w: 300, h: 200, z: 1, html: '<div><b>Bold</b> and <i>slanted</i></div><ul><li>one</li><li>two</li></ul>' },
        { id: 'n2', type: 'note', title: 'Plan', x: 400, y: 80, w: 330, h: 300, z: 2, markdown: true, md: '' },
        { id: 'td', type: 'todo', title: 'Errands', x: 760, y: 80, w: 300, h: 260, z: 3, items: [{ id: 'i1', text: 'Buy bread', done: true, steps: [{ id: 'st', text: 'wholegrain', done: false }], note: 'the corner shop', link: 'https://example.com', due: '', star: true }] },
        { id: 'w1', type: 'web', title: 'Example', x: 60, y: 420, w: 420, h: 280, z: 4, url: 'https://example.com/' } ] },
      { id: 'b', name: 'Work', parent: null, view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'n3', type: 'note', title: 'Meeting/notes: Q1?', x: 0, y: 0, w: 300, h: 200, z: 1, markdown: true, md: '# Agenda\\n- item' }] } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);
    // capture downloads instead of saving them
    await ev(`window.__dl = []; const orig = URL.createObjectURL; URL.createObjectURL = b => { window.__dl.push(b); return orig(b); }; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push(this.download); };`);

    // --- writing Markdown ---
    ok('an empty Markdown note opens straight into its text field', await ev(`!!document.querySelector('[data-id="n2"] textarea.md-src')`));
    await ev(`document.querySelector('[data-id="n2"] textarea').focus()`);
    await type('# Trip\nSome **bold** words and a [link](https://example.org).\n- [ ] pack');
    await key('Enter', 13);
    await type('book train');
    await key('Enter', 13); await key('Enter', 13);            // empty item ends the list
    await type('| a | b |\n|---|---|\n| 1 | 2 |');
    await sleep(500);
    let st = await stored();
    const src = st.boards[0].cards.find(c => c.id === 'n2').md;
    ok('Enter carries the list on, and an empty item ends it', /- \[ \] pack\n- \[ \] book train\n\| a/.test(src), JSON.stringify(src));
    await ev(`document.activeElement.blur()`);
    await sleep(300);
    const view = await ev(`(() => { const v = document.querySelector('[data-id="n2"] .md-view'); return v ? { h1: v.querySelector('h1')?.textContent, b: v.querySelector('strong')?.textContent, a: v.querySelector('a')?.getAttribute('href'), boxes: v.querySelectorAll('input[type=checkbox]').length, td: v.querySelectorAll('td').length } : null; })()`);
    ok('leaving the field shows it formatted (heading, bold, link, tasks, table)', view && view.h1 === 'Trip' && view.b === 'bold' && view.a === 'https://example.org' && view.boxes === 2 && view.td === 2, JSON.stringify(view));
    await ev(`document.querySelectorAll('[data-id="n2"] .md-view input[type=checkbox]')[1].click()`);
    await sleep(400);
    st = await stored();
    ok('ticking a task in the formatted view ticks it in the text', /- \[x\] book train/.test(st.boards[0].cards.find(c => c.id === 'n2').md) && await ev(`!!document.querySelector('[data-id="n2"] .md-view')`));
    const unsafe = await ev(`(() => { const d = document.createElement('div'); d.innerHTML = HomeboardMd.render('<img src=x onerror=alert(1)> [x](javascript:alert(1)) <script>bad()</script>'); return { img: !!d.querySelector('img'), script: !!d.querySelector('script'), js: [...d.querySelectorAll('a')].some(a => /javascript/i.test(a.href)) }; })()`);
    ok('Markdown cannot run code: HTML is shown as text, unsafe links are ignored', !unsafe.img && !unsafe.script && !unsafe.js, JSON.stringify(unsafe));

    // --- older notes convert ---
    const items = await menuOn('[data-id="n1"] .card-head');
    await pick('Markdown');
    await sleep(400);
    st = await stored();
    const n1 = st.boards[0].cards.find(c => c.id === 'n1');
    ok('an older note converts to Markdown from its menu', items.includes('Markdown') && n1.markdown && /\*\*Bold\*\*/.test(n1.md) && /\*slanted\*/.test(n1.md) && /- one\n- two/.test(n1.md) && n1.html === '', JSON.stringify(n1.md));

    // --- export ---
    await menuOn('[data-id="n2"] .card-head'); await pick('Export as Markdown');
    await sleep(300);
    const one = await ev(`(async () => { const b = window.__dl.find(x => x instanceof Blob); return { name: window.__dl.find(x => typeof x === 'string'), text: b && await b.text() }; })()`);
    ok('one note exports as a .md file', one.name === 'Plan.md' && one.text.startsWith('# Trip'), JSON.stringify(one).slice(0, 120));
    await ev(`window.__dl = []; document.querySelector('#settings-btn').click(); document.querySelector('#export-md').click(); document.querySelector('#settings').hidden = true`);
    await sleep(500);
    const all = await ev(`(async () => {
      const blob = window.__dl.find(x => x instanceof Blob), name = window.__dl.find(x => typeof x === 'string');
      const bytes = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(bytes.buffer), files = {};
      for (let at = 0; dv.getUint32(at, true) === 0x04034b50;) {          // walk the zip's entries
        const size = dv.getUint32(at + 18, true), nl = dv.getUint16(at + 26, true), xl = dv.getUint16(at + 28, true);
        const fname = new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nl));
        files[fname] = new TextDecoder().decode(bytes.slice(at + 30 + nl + xl, at + 30 + nl + xl + size));
        at += 30 + nl + xl + size;
      }
      return { name, files };
    })()`);
    const f = all.files || {};
    ok('everything exports as a zip of .md files in a folder per board', /^homeboard-notes-\d{4}-\d\d-\d\d\.zip$/.test(all.name) && f['Home/Plan.md'] && f['Home/Old note.md'] && f['Home/Errands.md'] && f['Work/Meeting-notes- Q1-.md'], Object.keys(f).join(', '));
    ok('to-dos export as task lists, strings as [[links]]', /- \[x\] Buy bread ⭐/.test(f['Home/Errands.md']) && /    - \[ \] wholegrain/.test(f['Home/Errands.md']) && /\[\[Errands\]\]/.test(f['Home/Plan.md'] || '') && /\[\[Plan\]\]/.test(f['Home/Errands.md']), (f['Home/Errands.md'] || '').replace(/\n/g, ' | '));

    // --- a .md file dropped on the board ---
    const cardsBefore = await ev(`document.querySelectorAll('.card').length`);
    await ev(`(() => { const dt = new DataTransfer(); dt.items.add(new File(['## Dropped\\n\\n- [x] works'], 'reading list.md', { type: 'text/markdown' })); document.querySelector('#canvas').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: 1100, clientY: 600, bubbles: true, cancelable: true })); })()`);
    await sleep(800);
    const dropped = await ev(`(() => { const c = [...document.querySelectorAll('.card-note')].pop(); return { n: document.querySelectorAll('.card').length, title: c.querySelector('.card-title').textContent, h2: c.querySelector('.md-view h2')?.textContent }; })()`);
    ok('a dropped .md file becomes a Markdown note', dropped.n === cardsBefore + 1 && dropped.title === 'reading list' && dropped.h2 === 'Dropped', JSON.stringify(dropped));

    // --- saved views ---
    const viewNow = () => ev(`({ x: Math.round(document.querySelector('#world').style.transform.match(/translate\\(([-\\d.]+)px/)[1]), t: document.querySelector('#world').style.transform })`);
    await ev(`(() => { const r = document.querySelector('#zoom-views').getBoundingClientRect(); document.querySelector('#zoom-views').click(); })()`);
    await pick('Save this view');
    await sleep(300);
    const home0 = await viewNow();
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 650, deltaX: 0, deltaY: 900 }, sid);   // wander off
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 650, deltaX: 700, deltaY: 0 }, sid);
    await sleep(300);
    const lost = await viewNow();
    await key('Home', 36);
    await sleep(700);
    const back = await viewNow();
    st = await stored();
    ok('Home goes back to the start view', lost.t !== home0.t && back.t === home0.t && st.boards[0].views.length === 1 && st.boards[0].home === st.boards[0].views[0].id, `${home0.t} / ${lost.t} / ${back.t}`);
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 650, deltaX: 0, deltaY: 500 }, sid);
    await sleep(200);
    await ev(`document.querySelector('#zoom-views').click()`); await pick('Save this view');
    await sleep(200);
    await key('Home', 36); await sleep(600);
    await key('2', 50, { code: 'Digit2' }); await sleep(700);
    const second = await viewNow();
    ok('keys 1–9 go to the saved views', second.t !== back.t && (await stored()).boards[0].views.length === 2, second.t);

    await ev(`document.querySelector('#zoom-views').click()`); await pick('Lock the view');
    await sleep(200);
    const lockedAt = await viewNow();
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 650, deltaX: 0, deltaY: 600 }, sid);
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 650, deltaX: 0, deltaY: -300, modifiers: 2 }, sid);
    await sleep(300);
    const stillAt = await viewNow();
    ok('a locked view does not move or zoom', lockedAt.t === stillAt.t && (await stored()).boards[0].frozen === true && await ev(`document.body.classList.contains('view-locked')`), stillAt.t);
    await ev(`document.querySelector('#zoom-views').click()`); await pick('Lock the view');
    await key('Home', 36); await sleep(600);

    // --- a website window with no frame ---
    await menuOn('[data-id="w1"] .card-head'); await pick('Show only the website');
    await sleep(500);
    const plain = await ev(`(() => { const c = document.querySelector('[data-id="w1"]'); return { cls: c.classList.contains('web-plain'), head: getComputedStyle(c.querySelector('.card-head')).display, bar: getComputedStyle(c.querySelector('.web-bar')).display, grab: !!c.querySelector('.web-grab'), frame: !!c.querySelector('iframe') }; })()`);
    ok('a website window can show only the site', plain.cls && plain.head === 'none' && plain.bar === 'none' && plain.grab && plain.frame, JSON.stringify(plain));
    await key('Escape', 27);                                                    // unselect
    await sleep(200);
    const before = (await stored()).boards[0].cards.find(c => c.id === 'w1');
    const sh = await ev(`(() => { const r = document.querySelector('[data-id="w1"] .web-shield').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sh.x, y: sh.y, button: 'none', buttons: 0 }, sid);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sh.x, y: sh.y, button: 'left', buttons: 1, clickCount: 1 }, sid);
    for (let i = 1; i <= 6; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sh.x + i * 20, y: sh.y + i * 10, button: 'left', buttons: 1 }, sid);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sh.x + 120, y: sh.y + 60, button: 'left', buttons: 0, clickCount: 1 }, sid);
    await sleep(500);
    const after = (await stored()).boards[0].cards.find(c => c.id === 'w1');
    const items2 = await menuOn('[data-id="w1"] .web-grab');
    ok('dragging the site moves it; its top strip opens the menu', Math.round(after.x - before.x) === 120 && Math.round(after.y - before.y) === 60 && items2.some(t => t.startsWith('Show only the website')), `dx=${after.x - before.x} dy=${after.y - before.y}`);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);

    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      await ev(`document.querySelector('[data-id="n2"]').scrollIntoView()`);
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid);
      fs.writeFileSync(path.join(outDir, 'notes.png'), Buffer.from(data, 'base64'));
    }
    const errs = await ev(`JSON.stringify(window.__errs)`);
    ok('no script errors', errs === '[]', errs);
  } catch (e) { console.log('ERROR', e.stack || e.message); results.push(false); }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
