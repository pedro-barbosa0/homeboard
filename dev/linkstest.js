// Dragging boards in the tree, dropping a card on a board, links to boards / views / cards, linked notes,
// and menus over an expanded card. Run from PowerShell:
//   node dev/linkstest.js C:\Users\Pedro\Homeboard <new empty profile folder>
const { spawn } = require('child_process');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile] = process.argv.slice(2);
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
    const key = async (k, vk, mod = 0, code = k) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod }, sid); };
    const mouse = (type, x, y, buttons = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 }, sid);
    const dragFromTo = async (a, b, steps = 8) => {
      await mouse('mouseMoved', a.x, a.y, 0); await mouse('mousePressed', a.x, a.y);
      for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await sleep(20); }
      await sleep(80);
      await mouse('mouseReleased', b.x, b.y, 0);
    };
    const stored = () => ev(`chrome.storage.local.get('homeboard:v1').then(r => r['homeboard:v1'])`);
    const rowAt = (bid, f = .5) => ev(`(() => { const r = document.querySelector('.tab[data-board="${bid}"]').getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height * ${f} }; })()`);
    const pick = label => ev(`(() => { const b = [...document.querySelectorAll('#menu .menu-item')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    const typeIn = text => send('Input.insertText', { text }, sid);
    await sleep(2200);
    await ev(`chrome.storage.local.set({ 'homeboard:v1': { v: 1, settings: { dockHide: false }, active: 'b1', lastBackup: '9999', seenVersion: chrome.runtime.getManifest().version, boards: [
      { id: 'b1', name: 'Alpha', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [
        { id: 'n1', type: 'note', title: 'Shared', x: 120, y: 120, w: 300, h: 200, z: 1, markdown: true, md: 'first words' },
        { id: 'n2', type: 'note', title: 'Jumps', x: 460, y: 120, w: 300, h: 200, z: 2, markdown: true, md: 'See [the reading view](homeboard:board/b2/view/v1) and [the card](homeboard:board/b3/card/c3).' },
        { id: 'l1', type: 'links', title: 'Places', x: 800, y: 120, w: 330, h: 200, z: 3, links: [{ id: 'k1', title: '', url: 'homeboard:board/b2' }] },
        { id: 'mv', type: 'note', title: 'Mover', x: 120, y: 400, w: 260, h: 160, z: 4, markdown: true, md: 'move me' } ] },
      { id: 'b2', name: 'Beta', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [], views: [{ id: 'v1', name: 'Reading', cx: 2000, cy: 1500, z: 1.5 }] },
      { id: 'b3', name: 'Gamma', view: { x: 0, y: 0, z: 1 }, strings: [], cards: [{ id: 'c3', type: 'note', title: 'Far card', x: 3000, y: 3000, w: 300, h: 200, z: 1, markdown: true, md: 'far away' }] } ] } })`);
    await send('Page.reload', {}, sid);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);

    // --- boards in the tree ---
    await mouse('mouseMoved', 30, 40, 0); await sleep(500);                  // the rail opens when pointed at
    await dragFromTo(await rowAt('b3'), await rowAt('b1', .1));
    await sleep(300);
    let st = await stored();
    ok('dragging a board to the top edge of another puts it before', st.boards.map(b => b.id).join() === 'b3,b1,b2' && !st.boards[0].parent, st.boards.map(b => b.id + ':' + b.parent).join());
    await mouse('mouseMoved', 30, 40, 0); await sleep(400);
    await dragFromTo(await rowAt('b2'), await rowAt('b1', .5));
    await sleep(300);
    st = await stored();
    ok('dragging onto the middle of a board puts it inside', st.boards.find(b => b.id === 'b2').parent === 'b1', st.boards.map(b => b.id + ':' + b.parent).join());
    const active = await ev(`document.querySelector('.tab.active')?.dataset.board`);
    ok('a drag does not open the board it started on', active === 'b1', active);

    // --- a card dropped on a board ---
    await mouse('mouseMoved', 700, 700, 0); await sleep(400);
    const head = await ev(`(() => { const r = document.querySelector('[data-id="mv"] .card-head').getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; })()`);
    await mouse('mouseMoved', head.x, head.y, 0); await mouse('mousePressed', head.x, head.y);
    for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', head.x - (head.x - 40) * i / 10, head.y - (head.y - 40) * i / 10); await sleep(25); }
    await sleep(400);
    const g = await rowAt('b3');
    await mouse('mouseMoved', g.x, g.y); await sleep(200);
    await mouse('mouseReleased', g.x, g.y, 0);
    await sleep(300);
    st = await stored();
    ok('a card dropped on a board in the tree moves there', st.boards.find(b => b.id === 'b3').cards.some(c => c.id === 'mv') && !st.boards.find(b => b.id === 'b1').cards.some(c => c.id === 'mv'));
    await mouse('mouseMoved', 700, 700, 0); await sleep(300);

    // --- links in a note ---
    const links = await ev(`[...document.querySelectorAll('[data-id="n2"] a')].map(a => a.getAttribute('href'))`);
    ok('board links show as links in a note', links.length === 2 && links[0] === 'homeboard:board/b2/view/v1', JSON.stringify(links));
    await ev(`document.querySelector('[data-id="n2"] a').click()`);
    await sleep(700);
    let view = await ev(`(() => { const m = /scale\\(([-\\d.]+)\\)/.exec(document.querySelector('#world').style.transform); return { board: document.querySelector('.tab.active')?.dataset.board, z: m && +m[1] }; })()`);
    ok('clicking a view link opens that board at that view', view.board === 'b2' && Math.abs(view.z - 1.5) < .01, JSON.stringify(view));
    await ev(`document.querySelector('.tab[data-board="b1"]').click()`); await sleep(500);
    await ev(`document.querySelectorAll('[data-id="n2"] a')[1].click()`);
    await sleep(700);
    const far = await ev(`(() => { const c = document.querySelector('[data-id="c3"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { board: document.querySelector('.tab.active')?.dataset.board, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), sel: c.classList.contains('selected') }; })()`);
    ok('clicking a card link opens its board centred on the card', far && far.board === 'b3' && Math.abs(far.cx - 700) < 30 && Math.abs(far.cy - 440) < 40 && far.sel, JSON.stringify(far));
    await ev(`document.querySelector('.tab[data-board="b1"]').click()`); await sleep(500);
    const tile = await ev(`(() => { const t = document.querySelector('[data-id="l1"] .link-tile'); return { name: t.textContent.trim(), chip: t.querySelector('.link-board')?.textContent }; })()`);
    ok('a link tile to a board shows the board', tile.name.includes('Beta') && tile.chip === 'BE', JSON.stringify(tile));
    await ev(`document.querySelector('[data-id="l1"] .link-tile').click()`); await sleep(600);
    ok('clicking it goes there', await ev(`document.querySelector('.tab.active')?.dataset.board`) === 'b2');
    await ev(`document.querySelector('.tab[data-board="b1"]').click()`); await sleep(500);

    // --- linked notes ---
    await ev(`(() => { const e = document.querySelector('[data-id="n1"] .card-head'), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 8 })); })()`);
    ok('the menu offers a linked copy', await pick('Linked copy'));
    ok('…here, beside it', await pick('Here, beside it'));
    await sleep(300);
    st = await stored();
    const group = st.boards.find(b => b.id === 'b1').cards.filter(c => c.type === 'note' && c.sync);
    ok('two cards now share one group', group.length === 2 && group[0].sync === group[1].sync, JSON.stringify(group.map(c => [c.id, c.sync])));
    const copyId = group.find(c => c.id !== 'n1').id;
    ok('both show the linked mark with 2', await ev(`[...document.querySelectorAll('.card-linked')].map(b => b.textContent).join()`) === '2,2');
    // type in the original: the copy follows
    await ev(`(() => { const v = document.querySelector('[data-id="n1"] .md-view'); v ? v.click() : null; })()`);
    await sleep(200);
    await ev(`(() => { const t = document.querySelector('[data-id="n1"] textarea'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); })()`);
    await typeIn(' and more');
    await sleep(700);
    const copyText = await ev(`document.querySelector('[data-id="${copyId}"] .card-body').textContent`);
    ok('typing in one changes the other on screen', /first words and more/.test(copyText), copyText);
    st = await stored();
    ok('and in the saved data', st.boards.find(b => b.id === 'b1').cards.find(c => c.id === copyId).md === 'first words and more');
    await key('Escape', 27); await sleep(200);
    // Ctrl+C, then Ctrl+Shift+V on another board: a linked copy; plain Ctrl+V: a separate one with the offer
    await ev(`document.querySelector('[data-id="n1"] .card-head').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    await ev(`document.activeElement?.blur()`);
    await key('c', 67, 2, 'KeyC');
    await ev(`document.querySelector('.tab[data-board="b3"]').click()`); await sleep(500);
    await mouse('mouseMoved', 600, 500, 0);
    await key('V', 86, 2 | 8, 'KeyV');
    await sleep(400);
    st = await stored();
    const onG = st.boards.find(b => b.id === 'b3').cards.filter(c => c.type === 'note' && c.sync);
    ok('Ctrl+Shift+V pastes a linked copy', onG.length === 1 && onG[0].sync === group[0].sync && onG[0].md === 'first words and more', JSON.stringify(onG.map(c => c.md)));
    await key('v', 86, 2, 'KeyV');
    await sleep(400);
    const offer = await ev(`document.querySelector('#toast')?.textContent || ''`);
    ok('plain Ctrl+V pastes a separate copy and offers to link it', /separate copy/.test(offer) && /Keep them the same/.test(offer), offer);
    await ev(`document.querySelector('#toast button').click()`);
    await sleep(300);
    st = await stored();
    ok('…which links it', st.boards.find(b => b.id === 'b3').cards.filter(c => c.sync === group[0].sync).length === 2);
    // a change on another board shows here when coming back
    await ev(`document.querySelector('.tab[data-board="b1"]').click()`); await sleep(500);
    const marks = await ev(`document.querySelector('[data-id="n1"] .card-linked')?.textContent`);
    ok('the mark counts every place', marks === '4', marks);

    // --- menus over an expanded card ---
    await ev(`document.querySelector('[data-id="n1"] .card-expand').click()`); await sleep(350);
    await ev(`document.querySelector('[data-id="n1"] .card-head button[aria-label="Card menu"]').click()`); await sleep(150);
    const onTop = await ev(`(() => { const m = document.querySelector('#menu'); if (m.hidden) return 'hidden'; const r = m.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + 20); return m.contains(e); })()`);
    ok('the card menu shows above an expanded card', onTop === true, String(onTop));
    await key('Escape', 27); await key('Escape', 27);

    const errs = await ev('window.__errs');
    ok('no errors on the page', !errs.length, JSON.stringify(errs));
  } catch (e) { ok('no exceptions', false, e.stack); }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  done(pass === results.length ? 0 : 1);
})();
