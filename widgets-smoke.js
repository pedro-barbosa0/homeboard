/* Smoke break (prototype): an arm holds what you smoke, the other hand a lighter.
 *  Space   strike the lighter (it takes a few tries), hold it to keep the flame on the tip until it lights;
 *          then Space is a draw (the ember glows, it burns faster, smoke comes out when you let go).
 *          Space twice, quickly, throws it away (flicked off, still glowing) and you take the next one.
 *  Esc     put it out.
 *  Ash grows and now and then falls. Lighters run out of gas (sparks only) — refill or pick another.
 *  Several things to smoke: cigarette, hand-rolled (roll it first), cigar, cigarillo, pipe, heated tobacco, vape.
 *  The Tabacaria (shop) sells them, in a kiosk, airport, gas station, café or supermarket.
 *  Everything here is drawn in code; names are made up (no real brands).
 */
(() => {
'use strict';
const REG = window.HomeboardWidgets = window.HomeboardWidgets || {};
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- what can be smoked, and with what ---------- */
const PRODUCTS = {
  cig:     { name: 'Atlântico Azul', kind: 'Cigarette', price: 5.2, len: 170, thick: 13, paper: '#f4f1ea', filter: '#d98c3a', ash: 26, burn: 1, light: 1.1, out: 90, flame: true, pack: 20 },
  cigw:    { name: 'Douro Suave', kind: 'Cigarette', price: 5.0, len: 170, thick: 13, paper: '#ffffff', filter: '#efe8dc', ash: 26, burn: 1, light: 1.1, out: 90, flame: true, pack: 20 },
  roll:    { name: 'Folha de Ouro (rolling)', kind: 'Hand-rolled', price: 7.9, len: 150, thick: 12, paper: '#efe6cf', filter: null, ash: 22, burn: 1.25, light: 1.2, out: 60, flame: true, pack: 25, rolled: true },
  cigar:   { name: 'Habano Robusto', kind: 'Cigar', price: 12.5, len: 250, thick: 30, paper: '#6b4423', band: '#c9a227', ash: 70, burn: .32, light: 3.2, out: 75, flame: true, pack: 1 },
  açores:  { name: 'Charuto dos Açores', kind: 'Cigar', price: 9.5, len: 220, thick: 26, paper: '#7a4e2a', band: '#2f7d4a', ash: 60, burn: .38, light: 3, out: 75, flame: true, pack: 1 },
  cigarillo: { name: 'Cigarrilha do Porto', kind: 'Cigarillo', price: 6.4, len: 140, thick: 12, paper: '#5a3a22', band: '#8c1d2a', ash: 30, burn: .8, light: 1.6, out: 60, flame: true, pack: 10 },
  pipe:    { name: 'Cachimbo de urze', kind: 'Pipe', price: 34, len: 210, thick: 18, paper: '#4a2e1a', ash: 0, burn: .25, light: 2.2, out: 22, flame: true, pack: 12, pipe: true },
  heated:  { name: 'Brasa Fria (heated sticks)', kind: 'Heated tobacco', price: 4.7, len: 120, thick: 14, paper: '#f2f2ef', filter: '#e4a1b0', ash: 0, burn: 0, light: 2.2, out: 999, flame: false, pack: 20, heated: true, puffs: 12 },
  vape:    { name: 'Nuvem Pod', kind: 'Vape', price: 14.9, len: 120, thick: 22, paper: '#2b2f3a', ash: 0, burn: 0, light: 0, out: 999, flame: false, pack: 1, vape: true, puffs: 400 },
};
const LIGHTERS = {
  flint:  { name: 'Flint lighter', price: 1.5, colors: ['#e63946', '#2a9d8f', '#f4a261', '#264653', '#8338ec', '#ffbe0b'], strike: .32, gas: 100, refill: false },
  refill: { name: 'Refillable flint lighter', price: 2.5, colors: ['#3a86ff', '#ff006e', '#06d6a0', '#111111'], strike: .38, gas: 100, refill: true },
  petrol: { name: 'Petrol flip lighter', price: 24, colors: ['#c0c0c0', '#b08d57', '#222222'], strike: .5, gas: 100, refill: true, flip: true },
  torch:  { name: 'Torch lighter', price: 9, colors: ['#1f1f1f', '#3a3a3a', '#7a0f1f'], strike: .7, gas: 100, refill: true, torch: true },
  matches:{ name: 'Matches', price: .8, colors: ['#c1121f'], strike: .55, gas: 40, refill: false, match: true },
};
const SCENES = {
  'cafe-night': 'Café at night',
  'cafe-morning': 'Café in the morning',
  gas: 'Gas station (drawn)',
  kiosk:   'Tobacco kiosk',
  airport: 'Airport',
  station: 'Gas station',
  cafe:    'Café',
  market:  'Supermarket',
};
const SKIN = ['#f1c7a3', '#e0a77e', '#c68a5c', '#8d5a3b', '#5e3a24'];


/* ---------- packs: the ones drawn for the cigarette pack widget (widgets.js), and your own ---------- */
const ORIGINAL = () => (window.HomeboardPacks && window.HomeboardPacks.SKINS) || {};
const myPacks = (() => {                              // kept once for every board: chrome.storage.local 'homeboard:packs'
  const KEY = 'homeboard:packs', store = (globalThis.browser ?? globalThis.chrome)?.storage?.local;
  let list = [], ready = null;
  const load = () => ready || (ready = (async () => {
    try { list = store ? ((await store.get(KEY))[KEY] || []) : JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { list = []; }
    list = Array.isArray(list) ? list.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string') : [];
    return list;
  })());
  const save = () => { try { if (store) store.set({ [KEY]: list }); else localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full */ } };
  return {
    load, all: () => list,
    add(p) { list.push({ id: 'my-' + Date.now().toString(36), ...p }); save(); return list[list.length - 1]; },
    update(id, ch) { const p = list.find(x => x.id === id); if (p) { Object.assign(p, ch); save(); } },
    remove(id) { list = list.filter(x => x.id !== id); save(); },
    get: id => list.find(x => x.id === id),
  };
})();
const packName = id => (ORIGINAL()[id] && ORIGINAL()[id].name) || (myPacks.get(id) && myPacks.get(id).name) || '';
function packFace(id) {                               // a pack, drawn: the original art, your photo, or your design
  const o = ORIGINAL()[id];
  if (o) { const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('viewBox', '0 0 120 190'); sv.setAttribute('class', 'smoke-face'); sv.innerHTML = o.art(); return sv; }
  const m = myPacks.get(id);
  if (m && m.img) { const i = el('img', 'smoke-face'); i.src = m.img; i.alt = ''; return i; }
  const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('viewBox', '0 0 120 190'); sv.setAttribute('class', 'smoke-face');
  const d = (m && m.design) || { body: '#c4161c', band: '#f6f2e7', ink: '#ffffff' };
  const name = String((m && m.name) || '?').replace(/[<&>"]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));
  sv.innerHTML = `<rect width="120" height="190" fill="${d.body}"/><rect y="40" width="120" height="6" fill="${d.band}"/><rect y="120" width="120" height="70" fill="${d.band}"/>`
    + `<text x="60" y="94" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${Math.max(10, Math.min(22, 200 / Math.max(4, name.length)))}" fill="${d.ink}">${name}</text>`
    + `<text x="60" y="168" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="6" letter-spacing="2" fill="${d.body}">20 CIGARROS</text>`;
  return sv;
}
/* the little form to add a pack of your own (a photo of the real one, or a design) or change one */
function packForm(host, existing, done) {
  const f = el('form', 'smoke-packform');
  const name = el('input'); name.placeholder = 'Name on the pack'; name.value = existing ? existing.name : ''; name.maxLength = 30;
  const d = existing && existing.design || { body: '#1f4e9c', band: '#f6f2e7', ink: '#ffffff' };
  const col = (v, label) => { const i = el('input'); i.type = 'color'; i.value = v; i.title = label; return i; };
  const body = col(d.body, 'Pack colour'), band = col(d.band, 'Stripe colour'), ink = col(d.ink, 'Name colour');
  let img = existing && existing.img || '';
  const preview = el('div', 'smoke-packform-preview');
  const photo = el('button', 'smoke-chip', img ? 'Change photo…' : 'Use a photo…'); photo.type = 'button';
  const noPhoto = el('button', 'smoke-chip', 'No photo'); noPhoto.type = 'button';
  const show = () => {
    const tmp = { id: '__preview', name: name.value || 'Your pack', img, design: { body: body.value, band: band.value, ink: ink.value } };
    const keepList = myPacks.get; myPacks.get = id => (id === '__preview' ? tmp : keepList(id));
    preview.replaceChildren(packFace('__preview'));
    myPacks.get = keepList;
    noPhoto.hidden = !img; photo.textContent = img ? 'Change photo…' : 'Use a photo…';
  };
  photo.onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      try {                                           // cropped to the shape of a pack, kept small
        const bmp = await createImageBitmap(file), W = 240, H = 380, k = Math.max(W / bmp.width, H / bmp.height);
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        c.getContext('2d').drawImage(bmp, (W - bmp.width * k) / 2, (H - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
        img = c.toDataURL('image/jpeg', .85); show();
      } catch { /* not a picture */ }
    };
    inp.click();
  };
  noPhoto.onclick = () => { img = ''; show(); };
  for (const i of [name, body, band, ink]) i.addEventListener('input', show);
  const save = el('button', 'smoke-chip on', existing ? 'Save' : 'Add the pack'); save.type = 'submit';
  const cancel = el('button', 'smoke-chip', 'Cancel'); cancel.type = 'button'; cancel.onclick = () => { f.remove(); done(null); };
  f.onsubmit = e => {
    e.preventDefault();
    const data = { name: name.value.trim() || 'My pack', img, design: { body: body.value, band: band.value, ink: ink.value } };
    if (existing) myPacks.update(existing.id, data); else existing = myPacks.add(data);
    f.remove(); done(existing.id);
  };
  const colours = el('div', 'smoke-packform-cols');
  colours.append(el('label', null, 'Pack'), body, el('label', null, 'Stripe'), band, el('label', null, 'Name'), ink);
  const side = el('div', 'smoke-packform-side');
  side.append(name, colours, el('div', 'smoke-packform-row'), el('div', 'smoke-packform-row'));
  side.children[2].append(photo, noPhoto);
  side.children[3].append(cancel, save);
  f.append(preview, side);
  host.append(f);
  show();
  f.scrollIntoView({ block: 'nearest' });
  name.focus();
}

/* ---------- the session: a layer over the screen, Space and Esc ---------- */
function session(st, keep) {
  const P = PRODUCTS[st.product] || PRODUCTS.cig, L = LIGHTERS[st.lighter] || LIGHTERS.flint;
  const layer = el('canvas', 'smoke-layer'), hint = el('div', 'smoke-hint');
  document.body.append(layer, hint);
  const g = layer.getContext('2d');
  layer.hbState = () => ({ ...s, down, clouds: parts.filter(p => p.puff).length });   // (for the tests)
  const s = {                                         // what is happening
    phase: P.rolled && !st.rolled ? 'roll' : P.vape ? 'ready' : P.heated ? 'heat' : 'strike',
    flick: 9, needRelease: false, lastTap: 0, empty: 0, toss: null, lastHeld: null, burnt: 0, ash: 0, lit: false, flame: 0, strikes: 0, hold: 0, heat: 0, drawing: false, drawT: 0, idle: 0,
    roll: 0, puffs: 0, armUp: 0, lighterIn: 0, ember: 0, done: false, gasWarned: false,
    hand: 'holding', ouch: 0, shake: 0, dropped: false,   // hand: 'empty' after throwing it away or dropping it
    breath: null,                                       // breathing out: { left, size, t, dur } (a longer draw, a bigger, longer cloud)
    haze: st.closed ? Math.max(0, +st.haze || 0) * Math.exp(-Math.max(0, Date.now() - (+st.hazeAt || 0)) / 600000) : 0,   // a closed room airs out over ~10 minutes between breaks
  };
  let hazeSaved = performance.now();
  const parts = [], ashBits = [];
  const PUFF = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(220,220,225,.22)'); gr.addColorStop(1, 'rgba(220,220,225,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c; })();
  let raf = 0, last = performance.now(), down = false;
  const gas = () => st.gas[st.lighter] ?? L.gas;
  const say = t => { if (hint.textContent !== t) hint.textContent = t; };

  function key(e, isDown) {
    if (e.code === 'Escape' && isDown) { e.preventDefault(); e.stopImmediatePropagation(); end(); return; }
    if (e.code !== 'Space') return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault(); e.stopImmediatePropagation();        // the board's Space-drag waits
    if (isDown && e.repeat) { down = true; return; }      // a held key whose first press went elsewhere still counts
    down = isDown;
    if (!isDown) { s.needRelease = false; return; }
    // Space twice, quickly: throw it away (and take the next one)
    const now = performance.now(), canToss = !P.vape && !P.pipe && !s.toss && s.empty <= 0 && s.hand === 'holding' && s.ouch <= 0 && (s.lit || s.done);
    if (canToss && now - s.lastTap < 340) { toss(); s.lastTap = 0; return; }
    s.lastTap = now;
    if (s.empty > 0 || s.ouch > 0) return;
    if (s.hand === 'empty') { if (performance.now() - (s.emptyAt || 0) > 300) take(); return; }   // (not the tail of the double tap)            // the hand is empty: Space takes another
    if (s.phase === 'roll') { s.roll = Math.min(1, s.roll + rnd(.08, .14)); if (s.roll >= 1) { st.rolled = true; keep(); s.phase = 'strike'; } }
    else if (s.phase === 'strike' || (s.phase === 'smoke' && !s.lit && P.flame)) strike();
  }
  const kd = e => key(e, true), ku = e => key(e, false);
  addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);
  // the keys must come here: a website window or a text field that has them would swallow Space
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  window.focus();
  const lost = () => { down = false; };
  addEventListener('blur', lost);

  function strike() {
    if (!P.flame) return;
    s.strikes++;
    s.flick = 0;                                            // the thumb rolls the wheel down
    for (let i = 0; i < 10; i++) parts.push({ x: 0, y: 0, vx: rnd(-1.5, 1.5), vy: rnd(-3, -.5), r: rnd(1, 2.2), life: 1, spark: true, rel: 'lighter' });
    const chance = gas() <= 0 ? 0 : Math.min(.95, L.strike + s.strikes * .1);
    if (Math.random() < chance) { s.flame = 1; s.phase = 'lighting'; }
    else if (gas() <= 0 && !s.gasWarned) { s.gasWarned = true; }
  }
  function fresh() {                                        // the next one, unlit
    if (st.left > 0) st.left--;
    Object.assign(s, { phase: P.rolled ? 'roll' : P.heated ? 'heat' : P.vape ? 'ready' : 'strike', burnt: 0, ash: 0, lit: false, flame: 0, strikes: 0, hold: 0, heat: 0, roll: 0, puffs: 0, done: false, drawing: false, drawT: 0, idle: 0 });
    if (P.rolled) st.rolled = false;
    keep();
  }
  function toss() {                                         // flicked away, spinning, still glowing
    const h = s.lastHeld || { x: innerWidth * .5, y: innerHeight * .6, len: P.len };
    s.toss = { x: h.x, y: h.y, len: h.len, lit: s.lit, vx: rnd(-950, -650), vy: rnd(-650, -420), rot: 0, vr: rnd(-14, -8) };
    s.empty = 0; s.emptyAt = performance.now(); s.needRelease = true; s.armUp = 0;
    s.hand = 'empty'; s.dropped = false; s.lit = false; s.done = false; s.flame = 0;
  }
  function take() {                                         // Space with an empty hand: the next one, unlit
    fresh(); s.hand = 'holding'; s.dropped = false; s.needRelease = true; s.shake = 0;
  }
  function drop() {                                         // burnt the fingers: let go, it falls, still glowing
    const h = s.lastHeld || { x: innerWidth * .5, y: innerHeight * .6, len: P.len };
    s.toss = { x: h.x, y: h.y, len: h.len, lit: true, vx: rnd(-90, 50), vy: rnd(-140, -60), rot: 0, vr: rnd(-7, 7) };
    s.emptyAt = performance.now(); s.hand = 'empty'; s.dropped = true; s.lit = false; s.done = false; s.drawing = false; s.needRelease = true;
  }
  function end() {
    cancelAnimationFrame(raf);
    removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); removeEventListener('blur', lost);
    layer.remove(); hint.remove();
    if (P.rolled) { st.rolled = false; keep(); }
  }

  /* ---------- drawing ---------- */
  function drawHaze(W, H, t) {                              // the room filling up: thickest under the ceiling, slowly drifting
    const a = Math.min(.62, s.haze * .7);
    const fog = g.createLinearGradient(0, 0, 0, H);
    fog.addColorStop(0, `rgba(205,205,212,${a})`); fog.addColorStop(.45, `rgba(195,195,202,${a * .55})`); fog.addColorStop(1, `rgba(185,185,192,${a * .25})`);
    g.fillStyle = fog; g.fillRect(0, 0, W, H);
    g.globalAlpha = Math.min(1, s.haze * 1.4);
    for (let i = 0; i < 7; i++) {                             // a few big soft banks, moving
      const r = Math.max(W, H) * (.35 + (i % 3) * .12), x = ((i * 0.23 + t / (90000 + i * 17000)) % 1.4 - .2) * W, y = H * (.08 + (i % 4) * .14) + Math.sin(t / 7000 + i) * 30;
      g.drawImage(PUFF, x - r, y - r * .5, r * 2, r);
    }
    g.globalAlpha = 1;
  }
  function arm(fromX, fromY, toX, toY, w, skin, sleeve) {   // a forearm from off-screen to the hand
    g.save();
    g.lineCap = 'round';
    const grad = g.createLinearGradient(fromX, fromY - w, fromX, fromY + w);
    grad.addColorStop(0, sleeve); grad.addColorStop(1, shade(sleeve, -.35));
    g.strokeStyle = grad; g.lineWidth = w * 1.25;
    const mx = fromX + (toX - fromX) * .55, my = fromY + (toY - fromY) * .55;
    g.beginPath(); g.moveTo(fromX, fromY); g.lineTo(mx, my); g.stroke();
    const sk = g.createLinearGradient(mx, my - w, mx, my + w);
    sk.addColorStop(0, shade(skin, .12)); sk.addColorStop(1, shade(skin, -.18));
    g.strokeStyle = sk; g.lineWidth = w;
    g.beginPath(); g.moveTo(mx, my); g.lineTo(toX, toY); g.stroke();
    g.restore();
  }
  function hand(x, y, size, skin, flip) {                   // a loose fist; fingers wrap whatever it holds
    g.save(); g.translate(x, y); if (flip) g.scale(-1, 1);
    g.fillStyle = shade(skin, -.05);
    g.beginPath(); g.ellipse(0, 0, size * .62, size * .5, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 4; i++) {
      g.fillStyle = shade(skin, -.02 - i * .03);
      g.beginPath(); g.ellipse(-size * .45, -size * .32 + i * size * .21, size * .22, size * .12, -.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = shade(skin, -.3); g.lineWidth = 1; g.stroke();
    }
    g.fillStyle = shade(skin, .06);                          // thumb
    g.beginPath(); g.ellipse(-size * .2, -size * .52, size * .32, size * .13, -.5, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  /* the hand that holds it: the palm and the middle finger behind it ('back'), the index finger across it, the other
     two curled in and the thumb under it ('front') — so it sits between the fingers. x, y: where it is held; th: its thickness */
  function fingers(x, y, th, skin, layer) {
    const k = 1.45, h = th / 2 / k;                       // a hand the size of the forearm
    g.save(); g.translate(x, y); g.scale(k, k); g.lineCap = 'round';
    const finger = (x0, y0, cx, cy, x1, y1, w) => {
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1);
      g.strokeStyle = shade(skin, -.34); g.lineWidth = w + 2.5; g.stroke();
      g.strokeStyle = shade(skin, -.03); g.lineWidth = w; g.stroke();
      g.fillStyle = shade(skin, .28); g.globalAlpha = .75; g.beginPath(); g.ellipse(x1 + 1, y1 + 1, w * .28, w * .2, -.6, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;   // the nail
    };
    const knuckle = (cx, cy, rx, ry) => {
      g.fillStyle = shade(skin, -.06); g.strokeStyle = shade(skin, -.34); g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(cx, cy, rx, ry, -.25, 0, Math.PI * 2); g.fill(); g.stroke();
    };
    if (layer === 'back') {
      const pg = g.createLinearGradient(0, h, 60, h + 56); pg.addColorStop(0, shade(skin, -.02)); pg.addColorStop(1, shade(skin, -.2));
      g.fillStyle = pg; g.beginPath(); g.ellipse(34, h + 28, 38, 29, -.35, 0, Math.PI * 2); g.fill();
      finger(32, h + 12, 26, -h - 2, 9, -h - 13, 15);                    // middle finger, behind
    } else {
      finger(18, h + 18, 2, -h + 4, -13, -h - 7, 16);                    // index finger, across in front
      knuckle(9, h + 25, 13, 9); knuckle(15, h + 39, 11, 8);              // ring and little finger, curled in
      finger(54, h + 20, 38, h + 9, 20, h + 3, 15);                      // the thumb, under it
    }
    g.restore();
  }
  /* the thumb of the lighter hand: raised, it rolls down over the wheel when you strike, and stays pressed on the gas while the flame burns */
  function thumb(x, y, skin) {
    const w = L.petrol ? 40 : L.torch ? 34 : 28;
    let tipY, tipX = x + w * .2;
    if (s.flick < .18) { const k = s.flick / .18; tipY = y - 22 + k * 26; tipX = x + w * .32 - k * w * .18; }   // the flick
    else if (s.flame > 0) tipY = y + 3;                                                                   // holding the gas down
    else tipY = y - 20;                                                                                   // ready, above the wheel
    const baseX = x + w * .55 + 10, baseY = y + 52;
    g.save(); g.lineCap = 'round';
    const gr = g.createLinearGradient(baseX, baseY, tipX, tipY); gr.addColorStop(0, shade(skin, -.12)); gr.addColorStop(1, shade(skin, .08));
    g.strokeStyle = shade(skin, -.35); g.lineWidth = 17; g.beginPath(); g.moveTo(baseX, baseY); g.quadraticCurveTo(baseX + 6, (baseY + tipY) / 2, tipX, tipY); g.stroke();
    g.strokeStyle = gr; g.lineWidth = 15; g.stroke();
    g.fillStyle = shade(skin, .3); g.globalAlpha = .8; g.beginPath(); g.ellipse(tipX - 2, tipY + 1, 4.5, 3, -.3, 0, Math.PI * 2); g.fill();   // the nail
    g.restore();
  }
  function shade(hex, k) {
    const n = hex.replace('#', ''), c = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16));
    return '#' + c.map(v => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)).toString(16).padStart(2, '0')).join('');
  }
  function smokable(tipX, y, t) {                          // drawn from the tip (left) to the hand (right)
    const len = P.len * (1 - s.burnt * (P.heated || P.vape || P.pipe ? 0 : .78)), th = P.thick;
    const x0 = tipX, x1 = tipX + len;
    g.save();
    if (P.vape) {
      const grd = g.createLinearGradient(0, y - th, 0, y + th); grd.addColorStop(0, '#4a5163'); grd.addColorStop(.5, P.paper); grd.addColorStop(1, '#14161c');
      g.fillStyle = grd; g.beginPath(); g.roundRect(x0, y - th / 2, len, th, 8); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.roundRect(x0 - 16, y - th / 4, 22, th / 2, 4); g.fill();
      g.fillStyle = s.drawing ? '#5ee7ff' : '#1b6b7a'; g.shadowColor = '#5ee7ff'; g.shadowBlur = s.drawing ? 14 : 0;
      g.beginPath(); g.arc(x0 + len * .6, y, 3, 0, Math.PI * 2); g.fill();
      g.restore(); return { tip: [x0 - 16, y] };
    }
    if (P.heated) {                                          // the holder, with the stick in its end
      const dev = 150;
      const grd = g.createLinearGradient(0, y - 12, 0, y + 12); grd.addColorStop(0, '#6f8ea8'); grd.addColorStop(.5, '#3d5a73'); grd.addColorStop(1, '#22374a');
      g.fillStyle = grd; g.beginPath(); g.roundRect(x0 + 40, y - 11, dev, 22, 11); g.fill();
      g.fillStyle = P.paper; g.beginPath(); g.roundRect(x0, y - 6, 48, 12, 3); g.fill();
      g.fillStyle = P.filter; g.fillRect(x0, y - 6, 18, 12);
      const ready = s.phase === 'smoke';
      g.fillStyle = ready ? '#5cff8d' : (Math.floor(t / 300) % 2 && s.heat > 0 ? '#5cff8d' : '#1e3b2a');
      g.shadowColor = '#5cff8d'; g.shadowBlur = ready ? 8 : 0;
      g.beginPath(); g.arc(x0 + 40 + dev * .55, y - 4, 2.5, 0, Math.PI * 2); g.fill();
      g.restore(); return { tip: [x0, y] };
    }
    if (P.pipe) {                                            // bowl at the tip, stem to the hand
      g.fillStyle = '#2b1a0e'; g.beginPath(); g.roundRect(x0 + 34, y - 5, len - 34, 10, 5); g.fill();
      const bowl = g.createLinearGradient(x0 - 30, 0, x0 + 30, 0); bowl.addColorStop(0, '#3a2414'); bowl.addColorStop(.5, '#6b4423'); bowl.addColorStop(1, '#3a2414');
      g.fillStyle = bowl; g.beginPath(); g.roundRect(x0 - 26, y - 48, 54, 56, [8, 8, 22, 22]); g.fill();
      g.fillStyle = s.lit ? (s.drawing ? '#ff7b2b' : '#a33a12') : '#3a2a1c';
      g.shadowColor = '#ff6a00'; g.shadowBlur = s.lit ? (s.drawing ? 22 : 8) : 0;
      g.beginPath(); g.ellipse(x0 + 1, y - 46, 20, 6, 0, 0, Math.PI * 2); g.fill();
      g.restore(); return { tip: [x0 + 1, y - 50] };
    }
    // a cigarette, hand-rolled, cigar or cigarillo
    const body = g.createLinearGradient(0, y - th / 2, 0, y + th / 2);
    body.addColorStop(0, shade(P.paper, .08)); body.addColorStop(.6, P.paper); body.addColorStop(1, shade(P.paper, -.18));
    const ashLen = Math.min(s.ash, P.ash);
    g.fillStyle = body;
    if (P.rolled) { g.beginPath(); g.moveTo(x0 + ashLen, y - th / 2 + 1); g.lineTo(x1, y - th / 2 - 1); g.lineTo(x1, y + th / 2 + 1); g.lineTo(x0 + ashLen, y + th / 2 - 1); g.closePath(); g.fill(); }
    else { g.beginPath(); g.roundRect(x0 + ashLen, y - th / 2, len - ashLen, th, P.kind === 'Cigar' ? th / 2.5 : 2); g.fill(); }
    if (P.filter) { const fg = g.createLinearGradient(0, y - th / 2, 0, y + th / 2); fg.addColorStop(0, shade(P.filter, .15)); fg.addColorStop(1, shade(P.filter, -.2)); g.fillStyle = fg; g.fillRect(x1 - 42, y - th / 2, 42, th); g.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 8; i++) g.fillRect(x1 - 40 + i * 5, y - th / 2 + 2, 1.2, th - 4); }
    if (P.band) { g.fillStyle = P.band; g.fillRect(x1 - 60, y - th / 2, 18, th); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x1 - 58, y - th / 2 + 2, 2, th - 4); }
    if (P.kind === 'Cigar') { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x0 + ashLen + 20 + i * 30, y - th / 2); g.lineTo(x0 + ashLen + 35 + i * 30, y + th / 2); g.stroke(); } }
    if (ashLen > 1) {                                         // the ash, grey with cracks
      const ag = g.createLinearGradient(0, y - th / 2, 0, y + th / 2); ag.addColorStop(0, '#cfcac3'); ag.addColorStop(1, '#8d8780');
      g.fillStyle = ag; g.beginPath(); g.roundRect(x0, y - th / 2 + .5, ashLen + 2, th - 1, 3); g.fill();
      g.strokeStyle = 'rgba(70,64,58,.5)'; g.lineWidth = .8;
      for (let i = 4; i < ashLen; i += 6) { g.beginPath(); g.moveTo(x0 + i, y - th / 2 + 1); g.lineTo(x0 + i + rnd(-1, 1), y + th / 2 - 1); g.stroke(); }
    }
    if (s.lit) {                                              // the ember
      const e = .5 + s.ember * .5 + Math.sin(t / 90) * .05;
      const eg = g.createRadialGradient(x0 + ashLen + 2, y, 1, x0 + ashLen + 2, y, th);
      eg.addColorStop(0, `rgba(255,${Math.round(150 + 80 * e)},80,${.9 * e})`); eg.addColorStop(.5, `rgba(230,60,10,${.6 * e})`); eg.addColorStop(1, 'rgba(120,20,0,0)');
      g.fillStyle = eg; g.beginPath(); g.arc(x0 + ashLen + 2, y, th, 0, Math.PI * 2); g.fill();
    } else if (!s.lit && s.burnt === 0 && !P.rolled) { g.fillStyle = shade(P.paper, -.45); g.fillRect(x0, y - th / 2, 2, th); }
    g.restore();
    return { tip: [x0 + ashLen, y], ashX: x0, ashLen };
  }
  function lighter(x, y, t) {                               // the lighter, held up so the flame meets the tip
    const col = st.color || L.colors[0];
    g.save(); g.translate(x, y);
    if (L.match) {
      g.fillStyle = '#e9d9b6'; g.fillRect(-2, 0, 4, 70);
      g.fillStyle = '#9b1d20'; g.beginPath(); g.ellipse(0, -2, 5, 7, 0, 0, Math.PI * 2); g.fill();
    } else {
      const w = L.petrol ? 40 : L.torch ? 34 : 28, hgt = L.petrol ? 64 : 82;
      const bg = g.createLinearGradient(-w / 2, 0, w / 2, 0); bg.addColorStop(0, shade(col, -.25)); bg.addColorStop(.35, shade(col, .25)); bg.addColorStop(1, shade(col, -.35));
      g.fillStyle = bg; g.beginPath(); g.roundRect(-w / 2, 8, w, hgt, L.petrol ? 6 : 9); g.fill();
      if (!L.petrol) {                                        // gas you can see through the plastic
        const lvl = Math.max(0, gas()) / 100;
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-w / 2 + 4, 8 + hgt * (1 - lvl * .8), w - 8, hgt * lvl * .8 - 4);
      }
      const hood = g.createLinearGradient(-w / 2, 0, w / 2, 0); hood.addColorStop(0, '#888'); hood.addColorStop(.5, '#eee'); hood.addColorStop(1, '#777');
      g.fillStyle = hood; g.beginPath(); g.roundRect(-w / 2 + 2, -6, w - 4, 16, 3); g.fill();
      if (!L.torch && !L.petrol) { g.fillStyle = '#444'; g.beginPath(); g.ellipse(w / 4, -2, 5, 7, 0, 0, Math.PI * 2); g.fill(); }
    }
    if (s.flame > 0) {                                       // a flickering flame: blue at the root, yellow above
      const f = s.flame, fl = L.torch ? 30 : 46, wob = Math.sin(t / 60) * 2;
      g.globalCompositeOperation = 'lighter';
      if (L.torch) {
        const tg = g.createLinearGradient(0, -6, 0, -6 - fl); tg.addColorStop(0, 'rgba(90,140,255,.95)'); tg.addColorStop(1, 'rgba(160,200,255,0)');
        g.fillStyle = tg; g.beginPath(); g.ellipse(0, -6 - fl / 2, 4, fl / 2, 0, 0, Math.PI * 2); g.fill();
      } else {
        const fg = g.createRadialGradient(wob, -14 - fl * .35, 2, wob, -14 - fl * .35, fl * .55);
        fg.addColorStop(0, 'rgba(255,250,210,.95)'); fg.addColorStop(.35, 'rgba(255,190,60,.85)'); fg.addColorStop(.7, 'rgba(255,90,20,.35)'); fg.addColorStop(1, 'rgba(255,60,0,0)');
        g.fillStyle = fg; g.beginPath(); g.ellipse(wob, -12 - fl * .35, 9 * f, fl * .55 * f, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(80,120,255,.55)'; g.beginPath(); g.ellipse(0, -9, 5, 4, 0, 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }

  /* ---------- the moving parts ---------- */
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (t - last) / 1000) * (window.__hbSmokeSpeed || 1); last = t;   // (the tests can speed time up)
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (layer.width !== Math.round(W * dpr)) { layer.width = Math.round(W * dpr); layer.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (s.haze > .005) drawHaze(W, H, t);

    // what Space does now
    const wantFlame = (s.phase === 'lighting' || (s.phase === 'smoke' && !s.lit && s.flame > 0)) && down;
    if (s.flame > 0) {
      if (!down || !wantFlame) s.flame = Math.max(0, s.flame - dt * 6);
      st.gas[st.lighter] = Math.max(0, gas() - dt * (L.match ? 12 : 2.2));
      if (gas() <= 0) s.flame = 0;
    }
    if (s.flame === 0 && s.phase === 'lighting' && !down) s.phase = s.lit ? 'smoke' : 'strike';
    if (s.phase === 'lighting' && s.flame > 0) { s.hold += dt; if (s.hold >= P.light) { s.lit = true; s.phase = 'smoke'; s.ember = 1; s.idle = 0; s.flame = 0; s.needRelease = down; } }
    if (s.phase === 'heat') { if (down) { s.heat += dt; if (s.heat >= P.light) { s.phase = 'smoke'; s.lit = true; s.needRelease = down; } } }
    if (s.phase === 'ready' && P.vape) s.phase = 'smoke', s.lit = true;
    s.drawing = s.phase === 'smoke' && s.lit && down && !s.needRelease && s.ouch <= 0 && s.hand === 'holding';
    s.flick += dt;
    s.armUp += ((s.drawing ? 1 : 0) - s.armUp) * Math.min(1, dt * 6);
    s.lighterIn += (((s.phase === 'strike' || s.phase === 'lighting' || (s.phase === 'smoke' && !s.lit && P.flame)) && P.flame && s.empty <= 0 && s.hand === 'holding' ? 1 : 0) - s.lighterIn) * Math.min(1, dt * 5);
    if (s.drawing) { s.drawT += dt; s.idle = 0; s.ember = Math.min(1, s.ember + dt * 3); }
    else {
      if (s.drawT > .2) {                                       // breathe out from the top right: as much as was drawn in
        const size = Math.min(1, (s.drawT - .1) / 2.6) * (P.vape ? 1.6 : P.kind === 'Cigar' || P.pipe ? 1.25 : 1);   // a quick drag: a wisp; a long draw: a big cloud
        s.breath = { left: Math.round(6 + 70 * size), size, t: 0, dur: .5 + 1.6 * Math.min(1, size) };
        if (P.heated || P.vape) { s.puffs++; if (P.heated && s.puffs >= P.puffs) s.done = true; }
      }
      s.drawT = 0; s.idle += dt; s.ember = Math.max(.25, s.ember - dt * .8);
    }
    if (s.lit && !P.heated && !P.vape) {
      // a cigarette is about a dozen long draws; left in the hand it only smoulders
      s.burnt = Math.min(1, s.burnt + dt * P.burn * (s.drawing ? .05 : .0033));
      if (!P.pipe) s.ash += dt * P.burn * (s.drawing ? 7 : .45);
      if (s.drawing && Math.random() < .5) parts.push({ x: 0, y: 0, vx: rnd(-1.2, .4), vy: rnd(-1.6, -.4), r: rnd(.8, 1.6), life: .7, spark: true, rel: 'tip' });
      if (s.idle > P.out) { s.lit = false; s.phase = 'smoke'; }          // it went out: light it again
      if (s.burnt >= 1) { if (P.pipe) s.done = true; else if (s.ouch <= 0 && s.hand === 'holding') { s.ouch = .55; s.shake = 1; } }
    }
    if (s.breath) {                                           // the breath goes out over a moment, strongest at first
      const b = s.breath; b.t += dt;
      const k = Math.max(0, 1 - b.t / b.dur), want = Math.round(b.left * Math.min(1, dt / b.dur * 2.2 * (k + .25)));
      for (let i = 0; i < want && b.left > 0; i++, b.left--) {
        const push = .6 + 2.8 * b.size * (k + .2);
        parts.push({ x: W * rnd(.8, .88), y: H * rnd(.1, .17), vx: -push * rnd(.7, 1.3), vy: rnd(-.5, .35) * (1 + b.size), r: rnd(8, 16) + 26 * b.size * rnd(.6, 1.2), life: .55 + .45 * b.size, puff: true });
      }
      if (b.left <= 0 || b.t > b.dur * 1.5) s.breath = null;
      if (st.closed) s.haze = Math.min(1, s.haze + dt * b.size * .03);
    }
    if (s.airing) { s.haze = Math.max(0, s.haze - dt * .3); for (const p of parts) if (p.puff) p.life -= dt * .8; if (!s.haze) s.airing = false; }   // the window is open: it clears in a few seconds
    else if (st.closed) {                                     // a closed room: the smoke has nowhere to go
      if (s.lit && !P.vape) s.haze = Math.min(1, s.haze + dt * .0018);
      if (performance.now() - hazeSaved > 4000) { hazeSaved = performance.now(); st.haze = +s.haze.toFixed(3); st.hazeAt = Date.now(); keep(true); }
    }
    if (s.ouch > 0) { s.ouch -= dt; s.shake = 1; if (s.ouch <= 0) { s.ouch = 0; drop(); } }   // it hurts... then let go
    else s.shake = Math.max(0, s.shake - dt * 1.1);              // shaking the burn off
    // ash falls now and then (more likely the longer it is)
    if (s.ash > 8 && Math.random() < dt * .25 * Math.pow(s.ash / Math.max(1, P.ash), 3)) {
      const drop = s.ash * rnd(.5, 1); s.ash -= drop; s.ashFall = { len: drop };
    }

    // where things are
    const sh = s.shake * (s.ouch > 0 ? 4 : 9);
    const hx = W * .64 + s.armUp * W * .12 + Math.sin(t / 17) * sh, hy = H * .66 - s.armUp * H * .38 + Math.cos(t / 23) * sh * .7 + (s.ouch > 0 ? 0 : s.shake * 14);
    // it is held near its end, so it gets shorter towards the fingers as it burns (it never floats away from them)
    const curLen = P.heated ? 190 : P.len * (1 - s.burnt * (P.vape || P.pipe ? 0 : .78));
    const grip = P.heated ? 60 : P.vape ? 40 : P.pipe ? 36 : P.kind === 'Cigar' ? 30 : 22;
    const gTh = P.heated || P.vape ? 22 : P.pipe ? 10 : P.thick;
    const gx = hx - 40, gy = hy - 10, tipX = gx + grip - curLen, ty = gy;
    const skin = st.skin || SKIN[1], sleeve = st.sleeve || '#2c3e50';
    // right arm, the hand, and what it holds between its fingers
    arm(W + 60, H * .9 - s.armUp * H * .3, gx + 66, gy + gTh / 2 + 44, 72, skin, sleeve);
    fingers(gx, gy, gTh, skin, 'back');
    const held = s.hand === 'empty' ? { tip: [tipX, ty] } : smokable(tipX, ty, t);
    fingers(gx, gy, gTh, skin, 'front');
    if (s.ouch > 0 || s.shake > .05) {                         // the burnt fingers: red and hot where it was held
      const k = s.ouch > 0 ? 1 : s.shake, fx = gx + grip * .4, fy = gy;
      const rg = g.createRadialGradient(fx, fy, 2, fx, fy, 34);
      rg.addColorStop(0, `rgba(255,70,40,${.55 * k})`); rg.addColorStop(.6, `rgba(220,40,30,${.22 * k})`); rg.addColorStop(1, 'rgba(200,30,20,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(fx, fy, 34, 0, Math.PI * 2); g.fill();
      if (s.ouch > 0 && Math.random() < .6) parts.push({ x: fx + rnd(-6, 6), y: fy - 6, vx: rnd(-.4, .4), vy: rnd(-1.4, -.8), r: rnd(2, 4), life: .8 });   // a sizzle
    }
    s.lastHeld = { x: tipX + curLen / 2, y: ty, len: curLen };
    if (s.empty > 0) s.empty -= dt;
    if (s.toss) {                                              // the one you threw away, flying off
      const k = s.toss; k.vy += 1500 * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.rot += k.vr * dt;
      g.save(); g.translate(k.x, k.y); g.rotate(k.rot);
      g.fillStyle = P.paper; g.beginPath(); g.roundRect(-k.len / 2, -P.thick / 2, k.len, P.thick, P.kind === 'Cigar' ? P.thick / 2.5 : 2); g.fill();
      if (P.filter && !P.heated) { g.fillStyle = P.filter; g.fillRect(k.len / 2 - 42, -P.thick / 2, 42, P.thick); }
      if (P.band && k.len > 80) { g.fillStyle = P.band; g.fillRect(k.len / 2 - 60, -P.thick / 2, 18, P.thick); }
      if (k.lit) { g.fillStyle = '#ff7b2b'; g.shadowColor = '#ff6a00'; g.shadowBlur = 12; g.fillRect(-k.len / 2 - 2, -P.thick / 2, 4, P.thick); }
      g.restore();
      if (k.lit && Math.random() < .7) parts.push({ x: k.x - Math.cos(k.rot) * k.len / 2, y: k.y - Math.sin(k.rot) * k.len / 2, vx: rnd(-.6, .6), vy: rnd(-.4, .4), r: rnd(1, 2), life: .6, spark: true, rel: 'air' });
      if (k.y > H + 200 || k.x < -300) s.toss = null;
    }
    // left arm with the lighter, brought to the tip while lighting
    const lx = -40 + (held.tip[0] - 6 + 40) * s.lighterIn, ly = H + 140 - (H + 140 - (held.tip[1] + (L.match ? 58 : 44))) * s.lighterIn;
    if (s.lighterIn > .02) {
      arm(-160, H * 1.05, lx - 8, ly + 70, 70, skin, sleeve);
      const jolt = s.flick < .12 ? 3 * (1 - s.flick / .12) : 0;
      lighter(lx, ly + (L.match ? 0 : 6) + jolt, t);
      hand(lx - 4, ly + 66, 60, skin, true);
      if (!L.match) thumb(lx, ly + 6 + jolt, skin);
    }
    // smoke from the tip, rising and curling
    if (s.lit && Math.random() < (P.vape ? 0 : .6)) parts.push({ x: held.tip[0], y: held.tip[1] - 4, vx: rnd(-.3, .3), vy: rnd(-1.2, -.6), r: rnd(3, 6), life: 1 });
    if (s.ashFall) { ashBits.push({ x: held.ashX ?? held.tip[0], y: ty, vy: 0, len: s.ashFall.len, rot: 0 }); s.ashFall = null; }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.spark) {
        const lp = p.rel === 'tip' ? held.tip : [lx + 6, ly + 2]; if (p.x === 0 && p.y === 0) { p.x = lp[0]; p.y = lp[1]; }
        p.x += p.vx; p.y += p.vy; p.vy += .15; p.life -= dt * 3;
        g.fillStyle = `rgba(255,${180 + Math.random() * 60 | 0},80,${p.life})`; g.fillRect(p.x, p.y, p.r, p.r);
      } else {
        if (st.closed) { p.vx *= .985; p.vy = p.vy * .985 - .012; }       // no draught: it slows, spreads and rises to the ceiling
        p.x += p.vx + Math.sin((p.y + t / 20) / 30) * .4; p.y += p.vy; p.r += p.puff ? .5 : .12; p.life -= dt * (p.puff ? (st.closed ? .16 : .35) : (st.closed ? .3 : .55));
        g.globalAlpha = Math.max(0, p.life); g.drawImage(PUFF, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); g.globalAlpha = 1;   // one soft puff, drawn once, reused
      }
      if (p.life <= 0) parts.splice(i, 1);
    }
    if (parts.length > 320) parts.splice(0, parts.length - 320);
    for (let i = ashBits.length - 1; i >= 0; i--) {
      const a = ashBits[i]; a.vy += 900 * dt; a.y += a.vy * dt; a.rot += dt * 3;
      g.save(); g.translate(a.x + a.len / 2, a.y); g.rotate(a.rot); g.fillStyle = '#9a948c'; g.fillRect(-a.len / 2, -P.thick / 2, a.len, P.thick); g.restore();
      if (a.y > H + 40) { ashBits.splice(i, 1); for (let k = 0; k < 6; k++) parts.push({ x: a.x, y: H - 4, vx: rnd(-1, 1), vy: rnd(-.6, -.1), r: rnd(2, 5), life: .6 }); }
    }

    // what to do now
    const more = typeof st.left === 'number' ? ` (${st.left} left)` : '';
    if (s.ouch > 0) say('Ouch! It burnt down to your fingers');
    else if (s.hand === 'empty') say((s.dropped ? 'Burnt your fingers and dropped it. ' : 'Thrown away. ') + `Space: take another${more} · Esc to stop`);
    else if (s.done) say(`Finished. Space for another (${P.kind.toLowerCase()}), Esc to stop.`);
    else if (s.phase === 'roll') say(`Rolling it… tap Space to roll (${Math.round(s.roll * 100)}%)`);
    else if (s.phase === 'heat') say(s.heat > 0 ? 'Heating… keep holding Space' : 'Hold Space to heat it up');
    else if (P.flame && gas() <= 0 && !s.lit) say(`${L.name}: out of gas — only sparks. Refill or pick another in the Tabacaria (Esc, then the widget).`);
    else if (s.phase === 'strike') say(s.strikes ? `Again… (${s.strikes} tries) — Space` : 'Space: strike the lighter');
    else if (s.phase === 'lighting') say(down ? `Keep the flame on it… ${Math.min(100, Math.round(s.hold / P.light * 100))}%` : 'Hold Space to keep the flame on');
    else if (s.phase === 'smoke' && !s.lit && P.flame) say('It went out. Space: light it again');
    else say((P.heated ? `Puff ${s.puffs}/${P.puffs} · ` : '') + 'Hold Space to draw · ' + (P.vape || P.pipe ? '' : 'Space twice: throw it away · ') + 'Esc to put it out');
    if (s.done && s.hand === 'holding' && down && !s.needRelease && performance.now() - s.lastTap > 360) fresh();   // the next one (unless this is the start of a double tap)
  }
  raf = requestAnimationFrame(frame);
  return { end, air: () => { s.airing = true; } };
}

/* ---------- the Tabacaria ---------- */
function shop(st, keep, onDone) {
  const wrap = el('div', 'smoke-shop'), box = el('div', 'smoke-shop-box');
  wrap.append(box);
  document.body.append(wrap);
  let tab = 'cig';
  const close = () => { wrap.remove(); onDone(); };
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); });
  const TABS = { cig: 'Cigarettes', roll: 'Rolling', cigar: 'Cigars', heated: 'Heated', vape: 'Vapes', lighter: 'Lighters' };
  const inTab = (id, p) => tab === 'cig' ? p.kind === 'Cigarette' : tab === 'roll' ? !!p.rolled : tab === 'cigar' ? /^(Cigar|Cigarillo|Pipe)$/.test(p.kind) : tab === 'heated' ? !!p.heated : tab === 'vape' ? !!p.vape : false;
  let form = null;
  function draw() {
    wrap.dataset.scene = st.scene || 'kiosk';
    const drawn = window.HomeboardPacks && window.HomeboardPacks.SCENES && window.HomeboardPacks.SCENES[st.scene];
    wrap.querySelector('.smoke-scene')?.remove();
    if (drawn) {                                        // the same scenes as the tobacco machine
      const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      sv.setAttribute('viewBox', '0 0 1600 900'); sv.setAttribute('preserveAspectRatio', 'xMidYMid slice'); sv.setAttribute('class', 'smoke-scene');
      sv.innerHTML = drawn.art(); wrap.prepend(sv);
    }
    const packTile = (id, mine) => {
      const name = packName(id), on = st.product === 'cig' && st.pack === id;
      const card = el('div', 'smoke-item smoke-packitem' + (on ? ' on' : ''));
      card.tabIndex = 0;
      const buy = () => { st.product = 'cig'; st.pack = id; st.left = 20; keep(); draw(); };
      card.onclick = buy; card.onkeydown = e => { if (e.key === 'Enter') buy(); };
      card.append(packFace(id), el('b', null, name), el('small', null, mine ? 'Yours · 20' : 'Cigarettes · 20'), el('span', 'smoke-price', '€5.40'));
      if (mine) {
        const tools = el('div', 'smoke-packtools');
        const edit = el('button', 'smoke-mini', '✎'); edit.type = 'button'; edit.title = 'Change it';
        edit.onclick = e => { e.stopPropagation(); form?.remove(); packForm(box, myPacks.get(id), () => draw()); };
        const del = el('button', 'smoke-mini', '🗑'); del.type = 'button'; del.title = 'Delete it';
        del.onclick = e => {
          e.stopPropagation();
          if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Delete?'; setTimeout(() => { if (del.isConnected) { del.dataset.sure = ''; del.textContent = '🗑'; } }, 2500); return; }
          myPacks.remove(id);
          if (st.pack === id) { st.pack = 'portugues'; keep(); }
          draw();
        };
        tools.append(edit, del); card.append(tools);
      }
      return card;
    };
    const items = tab === 'cig'
      ? [...Object.keys(ORIGINAL()).map(id => packTile(id, false)), ...myPacks.all().map(p => packTile(p.id, true)),
        (() => { const b = el('button', 'smoke-item smoke-addpack'); b.type = 'button'; b.append(el('span', 'smoke-plus', '+'), el('b', null, 'Your own pack'), el('small', null, 'A photo of it, or a design')); b.onclick = () => { form?.remove(); packForm(box, null, id => { if (id) { st.product = 'cig'; st.pack = id; keep(); } draw(); }); }; return b; })()]
      : tab === 'lighter'
      ? Object.entries(LIGHTERS).map(([id, l]) => item(id, l.name, l.price, l.refill ? 'Refillable' : 'Disposable', st.lighter === id, () => { st.lighter = id; st.color = l.colors[Math.floor(Math.random() * l.colors.length)]; st.gas[id] = l.gas; keep(); draw(); }, l.colors.map(c => swatch(c, () => { st.lighter = id; st.color = c; st.gas[id] = st.gas[id] ?? l.gas; keep(); draw(); }))))
      : Object.entries(PRODUCTS).filter(([id, p]) => inTab(id, p)).map(([id, p]) => item(id, p.name, p.price, `${p.kind}${p.pack > 1 ? ' · ' + p.pack : ''}`, st.product === id, () => { st.product = id; st.left = p.pack; st.rolled = false; keep(); draw(); }));
    const L = LIGHTERS[st.lighter] || LIGHTERS.flint;
    box.replaceChildren(
      el('div', 'smoke-shop-sign', 'TABACARIA'),
      (() => { const r = el('div', 'smoke-shop-row'); for (const [k, n] of Object.entries(SCENES)) { const b = el('button', 'smoke-chip' + ((st.scene || 'kiosk') === k ? ' on' : ''), n); b.type = 'button'; b.onclick = () => { st.scene = k; keep(); draw(); }; r.append(b); } return r; })(),
      (() => { const r = el('div', 'smoke-shop-row tabs'); for (const [k, n] of Object.entries(TABS)) { const b = el('button', 'smoke-chip' + (tab === k ? ' on' : ''), n); b.type = 'button'; b.onclick = () => { tab = k; draw(); }; r.append(b); } return r; })(),
      (() => { const r = el('div', 'smoke-shelf'); r.append(...items); return r; })(),
      (() => {
        const r = el('div', 'smoke-shop-row foot');
        const g0 = Math.round(st.gas[st.lighter] ?? L.gas);
        r.append(el('span', null, `You have: ${smokeName(st)} · ${L.name} (gas ${g0}%)`));
        if (L.refill && g0 < 100) { const b = el('button', 'smoke-chip', 'Refill gas · €1.20'); b.type = 'button'; b.onclick = () => { st.gas[st.lighter] = 100; keep(); draw(); }; r.append(b); }
        const done = el('button', 'smoke-chip on', 'Done'); done.type = 'button'; done.onclick = close; r.append(done);
        return r;
      })());
  }
  function swatch(c, fn) { const b = el('button', 'smoke-swatch'); b.type = 'button'; b.style.background = c; b.title = 'This colour'; b.onclick = e => { e.stopPropagation(); fn(); }; return b; }
  function item(id, name, price, sub, on, buy, extra) {
    const card = el('button', 'smoke-item' + (on ? ' on' : ''));
    card.type = 'button';
    const pic = el('div', 'smoke-pack');
    const p = PRODUCTS[id];
    if (p) { pic.style.setProperty('--a', p.band || p.filter || p.paper); pic.style.setProperty('--b', p.paper); pic.dataset.kind = p.vape ? 'vape' : p.heated ? 'heated' : /^(Cigar|Cigarillo)$/.test(p.kind) ? 'cigar' : p.pipe ? 'pipe' : p.rolled ? 'pouch' : 'pack'; }
    else { pic.dataset.kind = 'lighter'; pic.style.setProperty('--a', LIGHTERS[id].colors[0]); }
    const label = el('span', 'smoke-pack-name', name.split(' ')[0]);
    pic.append(label);
    card.append(pic, el('b', null, name), el('small', null, sub), el('span', 'smoke-price', `€${price.toFixed(2)}`));
    if (extra) { const row = el('div', 'smoke-swatches'); row.append(...extra); card.append(row); }
    card.onclick = buy;
    return card;
  }
  myPacks.load().then(draw);
}
const smokeName = st => (st.product === 'cig' && st.pack && packName(st.pack)) || (PRODUCTS[st.product] || PRODUCTS.cig).name;

/* ---------- the widget on the board: what you have, and the buttons ---------- */
function smokeWidget(host, saved, onChange) {
  const st = { product: 'cig', lighter: 'flint', color: '', gas: {}, left: 20, scene: 'kiosk', skin: SKIN[1], sleeve: '#2c3e50', rolled: false, closed: false, haze: 0, hazeAt: 0 };
  if (saved && typeof saved === 'object') {
    if (PRODUCTS[saved.product]) st.product = saved.product;
    if (LIGHTERS[saved.lighter]) st.lighter = saved.lighter;
    if (typeof saved.color === 'string') st.color = saved.color;
    if (saved.gas && typeof saved.gas === 'object') for (const [k, v] of Object.entries(saved.gas)) if (LIGHTERS[k]) st.gas[k] = Math.max(0, Math.min(100, +v || 0));
    if (Number.isFinite(+saved.left)) st.left = +saved.left;
    if (SCENES[saved.scene]) st.scene = saved.scene;
    if (SKIN.includes(saved.skin)) st.skin = saved.skin;
    if (typeof saved.sleeve === 'string') st.sleeve = saved.sleeve;
    if (typeof saved.pack === 'string') st.pack = saved.pack;
    st.closed = !!saved.closed; st.haze = Math.max(0, Math.min(1, +saved.haze || 0)); st.hazeAt = +saved.hazeAt || 0;
  }
  if (!st.pack) st.pack = 'portugues';
  const keep = quiet => { try { onChange({ ...st, gas: { ...st.gas } }); } catch { /* host gone */ } if (!quiet) paint(); };
  const root = el('div', 'smoke-w'), what = el('div', 'smoke-w-what'), go = el('button', 'smoke-w-go', 'Smoke break'), store = el('button', 'smoke-w-shop', 'Tabacaria');
  go.type = store.type = 'button';
  root.append(what, go, store);
  host.append(root);
  let live = null;
  function paint() {
    const P = PRODUCTS[st.product], L = LIGHTERS[st.lighter];
    what.replaceChildren(el('b', null, smokeName(st)), el('span', null, `${P.kind}${P.flame ? ` · ${L.name}, gas ${Math.round(st.gas[st.lighter] ?? L.gas)}%` : ''}`));
  }
  go.onclick = () => { live?.end(); live = session(st, keep); };
  store.onclick = () => shop(st, keep, paint);
  paint();
  myPacks.load().then(paint);
  return {
    grab: e => !e.target.closest('button'),
    menu: () => [
      { info: 'Space strikes, holds and draws; Space twice throws it away; Esc puts it out.' },
      { label: 'Smoke break', icon: 'play', action: () => go.click() },
      { label: 'Tabacaria (shop)', icon: 'media', action: () => store.click() },
      { label: 'Hands', icon: 'layers', items: SKIN.map((c, i) => ({ label: ['Light', 'Light-medium', 'Medium', 'Medium-dark', 'Dark'][i], checked: st.skin === c, action() { st.skin = c; keep(); } })) },
      { label: st.closed ? 'Closed room: on (the smoke stays and fills it)' : 'Closed room: off (the smoke drifts away)', icon: 'layers', checked: st.closed, action() { st.closed = !st.closed; if (!st.closed) st.haze = 0; keep(); } },
      st.closed && st.haze > .02 && { label: 'Open the window (air the room)', icon: 'reload', action() { st.haze = 0; st.hazeAt = Date.now(); keep(); if (live) live.air(); } },
      { label: 'Sleeves', icon: 'layers', items: [['Navy', '#2c3e50'], ['Black', '#151515'], ['Denim', '#3b5b8c'], ['Red flannel', '#8c2b2b'], ['White', '#e8e8e8']].map(([n, c]) => ({ label: n, checked: st.sleeve === c, action() { st.sleeve = c; keep(); } })) },
    ],
  };
}
REG.smoke = { label: 'Smoke break', menu: 'Smoke break (arm and lighter)', w: 240, h: 140, bare: true, create: smokeWidget };
})();
