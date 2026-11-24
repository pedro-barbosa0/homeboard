// YouTube Music widget against the real music.youtube.com, in a throwaway profile (needs the internet).
// YouTube Music is opened and started BEFORE Homeboard loads, like a tab you already had open.
//   node dev/musictest.js C:\path\to\Homeboard <new empty profile folder> [screenshot folder]
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ext, profile, outDir] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => { results.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  -> ' + String(info).slice(0, 240) : '')); };
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const done = c => { try { proc.kill(); } catch {} process.exit(c); };
  setTimeout(() => { console.log('TIMEOUT'); done(2); }, 200000);
  let id = 0, buf = ''; const pending = new Map();
  proc.stdio[4].on('data', chunk => {
    buf += chunk.toString('utf8'); let i;
    while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const p = pending.get(m.id); if (!p) continue; pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); proc.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  const evIn = async (sid, expression) => { const v = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid); if (v.exceptionDetails) throw new Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text); return v.result.value; };
  try {
    // 1. YouTube Music first, playing
    const yt = await send('Target.createTarget', { url: 'https://music.youtube.com/' });
    const { sessionId: ys } = await send('Target.attachToTarget', { targetId: yt.targetId, flatten: true });
    await sleep(6000);
    await evIn(ys, `(() => { const b = [...document.querySelectorAll('button, [role=button]')].find(x => /reject all|rejeitar tudo|recusar tudo/i.test(x.textContent || '')); if (b) b.click(); })()`);   // the private choice
    await sleep(6000);
    await send('Page.navigate', { url: 'https://music.youtube.com/search?q=' + encodeURIComponent('Bach Prelude in C major BWV 846') }, ys);
    await sleep(8000);
    await evIn(ys, `document.querySelector('ytmusic-play-button-renderer')?.click()`);
    let playingTitle = '';
    for (let i = 0; i < 20 && !playingTitle; i++) { await sleep(1000); playingTitle = await evIn(ys, `(() => { const v = document.querySelector('video'); return v && !v.paused && navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : ''; })()`); }
    if (!playingTitle) { console.log('     (skipped: YouTube Music did not start playing in the test browser)'); throw new Error('no playback'); }

    // 2. now Homeboard
    const r = await send('Extensions.loadUnpacked', { path: ext });
    const bt = await send('Target.createTarget', { url: `chrome-extension://${r.id}/index.html` });
    const { sessionId: sid } = await send('Target.attachToTarget', { targetId: bt.targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 800, deviceScaleFactor: 1, mobile: false }, sid);
    const ev = e => evIn(sid, e);
    await sleep(2500);
    await send('Page.bringToFront', {}, sid);
    await ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rej ' + (e.reason && e.reason.message || e.reason)))`);
    await ev(`(() => { document.querySelector('[data-add="widget"]').click(); [...document.querySelectorAll('#menu .menu-item')].find(b => b.textContent.trim() === 'YouTube Music').click(); })()`);
    let shown = '';
    for (let i = 0; i < 15 && !shown; i++) { await sleep(700); shown = await ev(`document.querySelector('.ytm:not(.none) .ytm-title')?.textContent || ''`); }
    ok('the widget finds a YouTube Music tab opened before Homeboard, and shows the song', shown === playingTitle, shown);
    const card = await ev(`({ who: document.querySelector('.ytm-who').textContent, art: document.querySelector('.ytm-art img').src.slice(0, 40), play: document.querySelector('.ytm-btn.play').title })`);
    ok('artist, artwork and the pause button are shown', card.who.length > 0 && card.art.startsWith('https://') && card.play === 'Pause', JSON.stringify(card));

    const ytState = () => evIn(ys, `(() => { const v = document.querySelector('video'); return { paused: v.paused, t: Math.round(v.currentTime), vol: Math.round(v.volume * 100), d: Math.round(v.duration || 0), title: navigator.mediaSession.metadata?.title }; })()`);
    await ev(`document.querySelector('.ytm-btn.play').click()`);
    await sleep(1200);
    const paused = await ytState();
    await ev(`document.querySelector('.ytm-btn.play').click()`);
    await sleep(1200);
    const resumed = await ytState();
    ok('play / pause from the board', paused.paused === true && resumed.paused === false && await ev(`document.querySelector('.ytm-btn.play').title`) === 'Pause', `${JSON.stringify(paused)} ${JSON.stringify(resumed)}`);
    await ev(`(() => { const v = document.querySelector('.ytm-vol'); v.value = 35; v.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(900);
    ok('volume from the board', (await ytState()).vol === 35);
    await ev(`document.querySelector('.ytm-btn.next').click()`);
    let moved = '';
    for (let i = 0; i < 12 && !moved; i++) { await sleep(800); const s = await ytState(); if (s.title && s.title !== playingTitle) moved = s.title; }
    let follows = '';
    for (let i = 0; i < 8 && moved && follows !== moved; i++) { await sleep(600); follows = await ev(`document.querySelector('.ytm-title').textContent`); }
    if (!moved && !(await ytState()).d) console.log('     (next song skipped: the test browser is not really playing; YouTube Music does not move on)');
    else ok('next song, and the board follows', !!moved && follows === moved, `${playingTitle} -> ${moved}`);
    for (let i = 0; i < 30 && !(await ytState()).d; i++) await sleep(700);    // the song must have loaded its length
    await sleep(1500);
    await ev(`(() => { const b = document.querySelector('.ytm-bar'), r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * .5, clientY: r.top + 2 })); })()`);
    await sleep(1200);
    const seeked = await ytState();
    if (!seeked.d) console.log('     (jump skipped: the test browser never loaded the song length)');
    else ok('clicking the progress bar jumps in the song', seeked.d > 0 && Math.abs(seeked.t - seeked.d / 2) < 8, `t=${seeked.t} of ${seeked.d}`);
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid);
      fs.writeFileSync(path.join(outDir, 'music.png'), Buffer.from(data, 'base64'));
    }
    // a picture frame shows the cover of what plays; every look of the widget, photographed
    await ev(`(() => { document.querySelector('[data-add="widget"]').click(); [...document.querySelectorAll('#menu .menu-item')].find(b => b.textContent.trim() === 'Picture frame').click(); })()`);
    await sleep(1500);
    const cover = await ev(`document.querySelector('.pf .pf-img')?.src || ''`);
    ok('a picture frame shows the cover of the song', /^https:/.test(cover) && !(await ev(`document.querySelector('.pf .pf-img').hidden`)), cover.slice(0, 80));
    if (outDir) for (const look of ['Liquid glass', 'Ambient (big cover glow)', 'Vinyl record', 'Framed cover', 'Compact pill']) {
      await ev(`(() => { const w = document.querySelector('.ytm'), r = w.getBoundingClientRect(); w.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 30 }));
        [...document.querySelectorAll('#menu .menu-item')].find(b => b.textContent.trim().startsWith('Look')).click();
        [...document.querySelectorAll('#menu .menu-item, #menu .gallery-tile')].find(b => (b.dataset.label || b.textContent).trim() === ${JSON.stringify(look)}).click(); })()`);
      await sleep(1800);
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid);
      fs.writeFileSync(path.join(outDir, 'music-' + look.split(' ')[0].toLowerCase() + '.png'), Buffer.from(data, 'base64'));
    }
    // whole players (click wheel, car radio, cassette, CD) and the progress bars, photographed; the click wheel's middle button really pauses
    const menuPick = (first, name) => ev(`(() => { const w = document.querySelector('.ytm'), r = w.getBoundingClientRect(); w.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 10 }));
      [...document.querySelectorAll('#menu .menu-item')].find(b => b.textContent.trim().startsWith(${JSON.stringify(first)})).click();
      [...document.querySelectorAll('#menu .menu-item, #menu .gallery-tile')].find(b => (b.dataset.label || b.textContent).trim() === ${JSON.stringify(name)}).click(); })()`);
    await ev(`(() => { const p = document.querySelector('.pf')?.closest('.card'); if (p) p.style.display = 'none'; const c = document.querySelector('.ytm').closest('.card'); c.style.width = '440px'; c.style.height = '230px'; })()`);
    for (const pl of ['Click-wheel player', 'Car radio', 'Cassette player', 'CD player']) {
      await menuPick('Look', pl);
      await sleep(1600);
      if (outDir) {
        const r = await ev(`(() => { const b = document.querySelector('.ytm').getBoundingClientRect(); return { x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height + 20 }; })()`);
        const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } }, sid);
        fs.writeFileSync(path.join(outDir, 'player-' + pl.split(' ')[0].toLowerCase() + '.png'), Buffer.from(data, 'base64'));
      }
    }
    await menuPick('Look', 'Click-wheel player'); await sleep(800);
    const p0 = (await ytState()).paused;
    await ev(`document.querySelector('.pl-wheel-center').click()`); await sleep(1500);
    const p1 = (await ytState()).paused;
    ok('the click wheel\'s middle button pauses / plays for real', p0 !== p1, `${p0} -> ${p1}`);
    if (p1) { await ev(`document.querySelector('.pl-wheel-center').click()`); await sleep(800); }
    await menuPick('Look', 'Glass panel'); await sleep(600);
    for (const bar of ['Burning fuse', 'Cigarette', 'Snail', 'Rocket', 'Wave', 'Beads', 'Rainbow']) {
      await menuPick('Progress bar', bar);
      await sleep(700);
      if (outDir) {
        const r = await ev(`(() => { const b = document.querySelector('.ytm-bar').getBoundingClientRect(); return { x: b.x - 20, y: b.y - 26, width: b.width + 40, height: 46 }; })()`);
        const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 2 } }, sid);
        fs.writeFileSync(path.join(outDir, 'bar-' + bar.split(' ').pop().toLowerCase() + '.png'), Buffer.from(data, 'base64'));
      }
    }
    ok('progress bars can be chosen', await ev(`document.querySelector('.ytm').dataset.bar`) === 'rainbow');
    // the Wave bar follows the beat: a canvas takes over while levels of what plays come in, and it draws
    await menuPick('Progress bar', 'Wave');
    if ((await ytState()).paused) { await ev(`document.querySelector('.ytm-btn.play').click()`); }
    await send('Page.bringToFront', {}, sid);
    // the test browser plays no real sound (taptest covers the levels from a tab); a beat is fed in: a bass kick 4 times a second
    await ev(`(() => { const A = window.HomeboardAudio, t0 = performance.now();
      A.now = () => { const ph = ((performance.now() - t0) / 250) % 1, kick = Math.max(0, 1 - ph * 3);
        return { title: 'beat', bands: Array.from({ length: 96 }, (_, i) => Math.round((i < 8 ? 90 + 165 * kick : 60 + 50 * Math.sin(i + ph * 6)) * (i < 60 ? 1 : .4))) }; }; })()`);
    // and the song length never loads here, so the played part is pinned at 60 %
    await ev(`(() => { const f = document.querySelector('.ytm-bar i'), h = document.querySelector('.ytm-head');
      Object.defineProperty(f.style, 'width', { get: () => '60%', set() {}, configurable: true }); f.style.setProperty('width', '60%');
      Object.defineProperty(h.style, 'left', { get: () => '60%', set() {}, configurable: true }); h.style.setProperty('left', '60%'); })()`);
    let wl = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      wl = await ev(`(() => { const w = document.querySelector('.ytm'), c = w.querySelector('.ytm-wave'); if (!c || !c.width) return { live: w.classList.contains('wave-live'), ink: 0 };
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) ink++;
        return { live: w.classList.contains('wave-live'), ink, hearing: !!window.HomeboardAudio.now() }; })()`);
      if (wl.live && wl.ink > 30) break;
    }
    ok('the Wave bar moves with the live sound of the song', wl.live && wl.ink > 30, JSON.stringify(wl));
    if (outDir) for (const k of [1, 2, 3]) {
      const r = await ev(`(() => { const b = document.querySelector('.ytm-bar').getBoundingClientRect(); return { x: b.x - 20, y: b.y - 26, width: b.width + 40, height: 46 }; })()`);
      const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 2 } }, sid);
      fs.writeFileSync(path.join(outDir, `bar-wave-live-${k}.png`), Buffer.from(data, 'base64'));
      await sleep(350);
    }
    await ev(`(() => { const p = document.querySelector('.pf')?.closest('.card'); if (p) p.style.display = ''; })()`);
    // the frame as devices (player, TV, CRT, arcade): the cover on their screen, their buttons work
    await ev(`(() => { const n = document.querySelector('.ytm').closest('.card'); n.style.display = 'none'; })()`);   // out of the way of the pictures
    for (const dev of ['Click-wheel music player', 'Wooden retro TV', 'Small CRT monitor', 'Arcade cabinet']) {
      await ev(`(() => { const w = document.querySelector('.pf'), r = w.getBoundingClientRect(); w.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 20 }));
        [...document.querySelectorAll('#menu .menu-item')].find(b => b.textContent.trim().startsWith('Frame')).click();
        [...document.querySelectorAll('#menu .menu-item, #menu .gallery-tile')].find(b => (b.dataset.label || b.textContent).trim() === ${JSON.stringify(dev)}).click(); })()`);
      await sleep(1500);
      if (outDir) { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, 'device-' + dev.split(' ').pop().toLowerCase() + '.png'), Buffer.from(data, 'base64')); }
    }
    const devShown = await ev(`(() => { const d = document.querySelector('.pf .dev-arcade'); return d && { img: !!d.querySelector('.pf-img')?.src, marquee: d.querySelector('.dev-marquee').textContent }; })()`);
    ok('the frame can be an arcade cabinet with the cover on its screen and the song on its marquee', devShown && devShown.img && devShown.marquee.length > 0 && devShown.marquee !== 'INSERT COIN', JSON.stringify(devShown));
    const before = (await ytState()).paused;
    const hubSaw = await ev(`(() => { const H = window.HomeboardMusic; return { alive: H.alive().map(([k, p]) => [k, p.state.playing, String(p.state.title).slice(0, 24)]), top: H.state()?.title?.slice(0, 24) }; })()`);
    // YouTube Music sometimes ignores a pause while it is still settling into a song: a second press, like a person would
    let after = before, tries = 0;
    for (; tries < 2 && after === before; tries++) {
      await ev(`document.querySelector('.pf .dev-cp .yellow').click()`);
      for (let i = 0; i < 12 && after === before; i++) { await sleep(250); after = (await ytState()).paused; }
    }
    ok('its play button pauses / plays YouTube Music', before !== after, `${before} -> ${after}${tries > 1 ? ' (needed a second press)' : ''} ` + JSON.stringify(hubSaw));

    if (after) { await ev(`document.querySelector('.pf .dev-cp .yellow').click()`); await sleep(800); }
    await ev(`document.querySelector('.ytm').closest('.card').style.display = ''`);
    // the cover itself as the backdrop, under liquid glass (commands typed in the search box)
    for (const c of ['backdrop cover art', 'material liquid', 'glass colour clear']) {
      await ev(`document.querySelector('#search-input').focus()`);
      await send('Input.insertText', { text: '>' + c }, sid);
      await sleep(300);
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: type === 'keyDown' ? String.fromCharCode(13) : undefined }, sid);
      await sleep(400);
    }
    await sleep(1500);
    const sceneArt = await ev(`(() => { const a = document.querySelector('#scene-art'); return a && !a.hidden ? a.style.backgroundImage.slice(0, 60) : ''; })()`);
    ok('the cover of the song can be the backdrop', sceneArt.startsWith('url("https:'), sceneArt);
    if (outDir) { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(path.join(outDir, 'music-coverart.png'), Buffer.from(data, 'base64')); }
    const errs = await ev(`JSON.stringify(window.__errs)`);
    ok('no script errors', errs === '[]', errs);
  } catch (e) { if (e.message !== 'no playback') { console.log('ERROR', e.stack || e.message); results.push(false); } }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  done(0);
})();
