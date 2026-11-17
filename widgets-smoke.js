/* Smoke break (prototype): an arm holds what you smoke, the other hand a lighter.
 *  Space   strike the lighter (it takes a few tries), hold it to keep the flame on the tip until it lights;
 *          then Space is a draw (the ember glows, it burns faster, smoke comes out when you let go).
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
  kiosk:   'Tobacco kiosk',
  airport: 'Airport',
  station: 'Gas station',
  cafe:    'Café',
  market:  'Supermarket',
};
const SKIN = ['#f1c7a3', '#e0a77e', '#c68a5c', '#8d5a3b', '#5e3a24'];

/* ---------- the session: a layer over the screen, Space and Esc ---------- */
function session(st, keep) {
  const P = PRODUCTS[st.product] || PRODUCTS.cig, L = LIGHTERS[st.lighter] || LIGHTERS.flint;
  const layer = el('canvas', 'smoke-layer'), hint = el('div', 'smoke-hint');
  document.body.append(layer, hint);
  const g = layer.getContext('2d');
  const s = {                                         // what is happening
    phase: P.rolled && !st.rolled ? 'roll' : P.vape ? 'ready' : P.heated ? 'heat' : 'strike',
    burnt: 0, ash: 0, lit: false, flame: 0, strikes: 0, hold: 0, heat: 0, drawing: false, drawT: 0, idle: 0,
    roll: 0, puffs: 0, armUp: 0, lighterIn: 0, ember: 0, done: false, gasWarned: false,
  };
  const parts = [], ashBits = [];
  let raf = 0, last = performance.now(), down = false;
  const gas = () => st.gas[st.lighter] ?? L.gas;
  const say = t => { if (hint.textContent !== t) hint.textContent = t; };

  function key(e, isDown) {
    if (e.code === 'Escape' && isDown) { e.preventDefault(); e.stopImmediatePropagation(); end(); return; }
    if (e.code !== 'Space') return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault(); e.stopImmediatePropagation();        // the board's Space-drag waits
    if (isDown && e.repeat) return;
    down = isDown;
    if (!isDown) return;
    if (s.phase === 'roll') { s.roll = Math.min(1, s.roll + rnd(.08, .14)); if (s.roll >= 1) { st.rolled = true; keep(); s.phase = 'strike'; } }
    else if (s.phase === 'strike' || (s.phase === 'smoke' && !s.lit && P.flame)) strike();
  }
  const kd = e => key(e, true), ku = e => key(e, false);
  addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);

  function strike() {
    if (!P.flame) return;
    s.strikes++;
    for (let i = 0; i < 10; i++) parts.push({ x: 0, y: 0, vx: rnd(-1.5, 1.5), vy: rnd(-3, -.5), r: rnd(1, 2.2), life: 1, spark: true, rel: 'lighter' });
    const chance = gas() <= 0 ? 0 : Math.min(.95, L.strike + s.strikes * .1);
    if (Math.random() < chance) { s.flame = 1; s.phase = 'lighting'; }
    else if (gas() <= 0 && !s.gasWarned) { s.gasWarned = true; }
  }
  function end() {
    cancelAnimationFrame(raf);
    removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true);
    layer.remove(); hint.remove();
    if (P.rolled) { st.rolled = false; keep(); }
  }

  /* ---------- drawing ---------- */
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
    const dt = Math.min(.05, (t - last) / 1000); last = t;
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (layer.width !== Math.round(W * dpr)) { layer.width = Math.round(W * dpr); layer.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);

    // what Space does now
    const wantFlame = (s.phase === 'lighting' || (s.phase === 'smoke' && !s.lit && s.flame > 0)) && down;
    if (s.flame > 0) {
      if (!down || !wantFlame) s.flame = Math.max(0, s.flame - dt * 6);
      st.gas[st.lighter] = Math.max(0, gas() - dt * (L.match ? 12 : 2.2));
      if (gas() <= 0) s.flame = 0;
    }
    if (s.flame === 0 && s.phase === 'lighting' && !down) s.phase = s.lit ? 'smoke' : 'strike';
    if (s.phase === 'lighting' && s.flame > 0) { s.hold += dt; if (s.hold >= P.light) { s.lit = true; s.phase = 'smoke'; s.ember = 1; s.idle = 0; } }
    if (s.phase === 'heat') { if (down) { s.heat += dt; if (s.heat >= P.light) { s.phase = 'smoke'; s.lit = true; } } }
    if (s.phase === 'ready' && P.vape) s.phase = 'smoke', s.lit = true;
    s.drawing = s.phase === 'smoke' && s.lit && down && s.flame === 0;
    s.armUp += ((s.drawing ? 1 : 0) - s.armUp) * Math.min(1, dt * 6);
    s.lighterIn += (((s.phase === 'strike' || s.phase === 'lighting' || (s.phase === 'smoke' && !s.lit && P.flame)) && P.flame ? 1 : 0) - s.lighterIn) * Math.min(1, dt * 5);
    if (s.drawing) { s.drawT += dt; s.idle = 0; s.ember = Math.min(1, s.ember + dt * 3); }
    else {
      if (s.drawT > .25) {                                      // breathe out: a cloud from the top right
        const n = Math.min(40, Math.round(s.drawT * 22)) * (P.vape ? 2 : 1);
        for (let i = 0; i < n; i++) parts.push({ x: W * rnd(.78, .9), y: H * rnd(.08, .2), vx: rnd(-3.2, -1.2), vy: rnd(-.6, .4), r: rnd(18, 42), life: 1, puff: true });
        if (P.heated || P.vape) { s.puffs++; if (P.heated && s.puffs >= P.puffs) s.done = true; }
      }
      s.drawT = 0; s.idle += dt; s.ember = Math.max(.25, s.ember - dt * .8);
    }
    if (s.lit && !P.heated && !P.vape) {
      s.burnt = Math.min(1, s.burnt + dt * P.burn * (s.drawing ? .018 : .0025));
      if (!P.pipe) s.ash += dt * P.burn * (s.drawing ? 2.2 : .35);
      if (s.idle > P.out) { s.lit = false; s.phase = 'smoke'; }          // it went out: light it again
      if (s.burnt >= 1) s.done = true;
    }
    // ash falls now and then (more likely the longer it is)
    if (s.ash > 8 && Math.random() < dt * .25 * Math.pow(s.ash / Math.max(1, P.ash), 3)) {
      const drop = s.ash * rnd(.5, 1); s.ash -= drop; s.ashFall = { len: drop };
    }

    // where things are
    const hx = W * .64 + s.armUp * W * .12, hy = H * .66 - s.armUp * H * .38;
    const tipX = hx - P.len - 30, ty = hy;
    const skin = st.skin || SKIN[1], sleeve = st.sleeve || '#2c3e50';
    // right arm and what it holds
    arm(W + 60, H * .9 - s.armUp * H * .3, hx + 30, hy + 8, 72, skin, sleeve);
    const held = smokable(tipX, ty, t);
    hand(hx + 14, hy + 4, 64, skin, false);
    // left arm with the lighter, brought to the tip while lighting
    const lx = -40 + (held.tip[0] - 6 + 40) * s.lighterIn, ly = H + 140 - (H + 140 - (held.tip[1] + (L.match ? 58 : 44))) * s.lighterIn;
    if (s.lighterIn > .02) {
      arm(-160, H * 1.05, lx - 8, ly + 70, 70, skin, sleeve);
      lighter(lx, ly + (L.match ? 0 : 6), t);
      hand(lx - 4, ly + 66, 60, skin, true);
    }
    // smoke from the tip, rising and curling
    if (s.lit && Math.random() < (P.vape ? 0 : .6)) parts.push({ x: held.tip[0], y: held.tip[1] - 4, vx: rnd(-.3, .3), vy: rnd(-1.2, -.6), r: rnd(3, 6), life: 1 });
    if (s.ashFall) { ashBits.push({ x: held.ashX ?? held.tip[0], y: ty, vy: 0, len: s.ashFall.len, rot: 0 }); s.ashFall = null; }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.spark) {
        const lp = [lx + 6, ly + 2]; if (p.x === 0 && p.y === 0) { p.x = lp[0]; p.y = lp[1]; }
        p.x += p.vx; p.y += p.vy; p.vy += .15; p.life -= dt * 3;
        g.fillStyle = `rgba(255,${180 + Math.random() * 60 | 0},80,${p.life})`; g.fillRect(p.x, p.y, p.r, p.r);
      } else {
        p.x += p.vx + Math.sin((p.y + t / 20) / 30) * .4; p.y += p.vy; p.r += p.puff ? .5 : .12; p.life -= dt * (p.puff ? .35 : .55);
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, `rgba(220,220,225,${.22 * p.life})`); gr.addColorStop(1, 'rgba(220,220,225,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      }
      if (p.life <= 0) parts.splice(i, 1);
    }
    if (parts.length > 500) parts.splice(0, parts.length - 500);
    for (let i = ashBits.length - 1; i >= 0; i--) {
      const a = ashBits[i]; a.vy += 900 * dt; a.y += a.vy * dt; a.rot += dt * 3;
      g.save(); g.translate(a.x + a.len / 2, a.y); g.rotate(a.rot); g.fillStyle = '#9a948c'; g.fillRect(-a.len / 2, -P.thick / 2, a.len, P.thick); g.restore();
      if (a.y > H + 40) { ashBits.splice(i, 1); for (let k = 0; k < 6; k++) parts.push({ x: a.x, y: H - 4, vx: rnd(-1, 1), vy: rnd(-.6, -.1), r: rnd(2, 5), life: .6 }); }
    }

    // what to do now
    if (s.done) say(`Finished. Space for another (${P.kind.toLowerCase()}), Esc to stop.`);
    else if (s.phase === 'roll') say(`Rolling it… tap Space to roll (${Math.round(s.roll * 100)}%)`);
    else if (s.phase === 'heat') say(s.heat > 0 ? 'Heating… keep holding Space' : 'Hold Space to heat it up');
    else if (P.flame && gas() <= 0 && !s.lit) say(`${L.name}: out of gas — only sparks. Refill or pick another in the Tabacaria (Esc, then the widget).`);
    else if (s.phase === 'strike') say(s.strikes ? `Again… (${s.strikes} tries) — Space` : 'Space: strike the lighter');
    else if (s.phase === 'lighting') say(down ? `Keep the flame on it… ${Math.min(100, Math.round(s.hold / P.light * 100))}%` : 'Hold Space to keep the flame on');
    else if (s.phase === 'smoke' && !s.lit && P.flame) say('It went out. Space: light it again');
    else say((P.heated ? `Puff ${s.puffs}/${P.puffs} · ` : '') + 'Hold Space to draw · Esc to put it out');
    if (s.done && down) {                                      // the next one
      if (st.left > 0) st.left--;
      Object.assign(s, { phase: P.rolled ? 'roll' : P.heated ? 'heat' : P.vape ? 'ready' : 'strike', burnt: 0, ash: 0, lit: false, flame: 0, strikes: 0, hold: 0, heat: 0, roll: 0, puffs: 0, done: false });
      if (P.rolled) st.rolled = false;
      keep();
    }
  }
  raf = requestAnimationFrame(frame);
  return { end };
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
  function draw() {
    wrap.dataset.scene = st.scene || 'kiosk';
    const items = tab === 'lighter'
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
        r.append(el('span', null, `You have: ${(PRODUCTS[st.product] || PRODUCTS.cig).name} · ${L.name} (gas ${g0}%)`));
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
  draw();
}

/* ---------- the widget on the board: what you have, and the buttons ---------- */
function smokeWidget(host, saved, onChange) {
  const st = { product: 'cig', lighter: 'flint', color: '', gas: {}, left: 20, scene: 'kiosk', skin: SKIN[1], sleeve: '#2c3e50', rolled: false };
  if (saved && typeof saved === 'object') {
    if (PRODUCTS[saved.product]) st.product = saved.product;
    if (LIGHTERS[saved.lighter]) st.lighter = saved.lighter;
    if (typeof saved.color === 'string') st.color = saved.color;
    if (saved.gas && typeof saved.gas === 'object') for (const [k, v] of Object.entries(saved.gas)) if (LIGHTERS[k]) st.gas[k] = Math.max(0, Math.min(100, +v || 0));
    if (Number.isFinite(+saved.left)) st.left = +saved.left;
    if (SCENES[saved.scene]) st.scene = saved.scene;
    if (SKIN.includes(saved.skin)) st.skin = saved.skin;
    if (typeof saved.sleeve === 'string') st.sleeve = saved.sleeve;
  }
  const keep = () => { try { onChange({ ...st, gas: { ...st.gas } }); } catch { /* host gone */ } paint(); };
  const root = el('div', 'smoke-w'), what = el('div', 'smoke-w-what'), go = el('button', 'smoke-w-go', 'Smoke break'), store = el('button', 'smoke-w-shop', 'Tabacaria');
  go.type = store.type = 'button';
  root.append(what, go, store);
  host.append(root);
  let live = null;
  function paint() {
    const P = PRODUCTS[st.product], L = LIGHTERS[st.lighter];
    what.replaceChildren(el('b', null, P.name), el('span', null, `${P.kind}${P.flame ? ` · ${L.name}, gas ${Math.round(st.gas[st.lighter] ?? L.gas)}%` : ''}`));
  }
  go.onclick = () => { live?.end(); live = session(st, keep); };
  store.onclick = () => shop(st, keep, paint);
  paint();
  return {
    grab: e => !e.target.closest('button'),
    menu: () => [
      { info: 'Space strikes, holds and draws; Esc puts it out.' },
      { label: 'Smoke break', icon: 'play', action: () => go.click() },
      { label: 'Tabacaria (shop)', icon: 'media', action: () => store.click() },
      { label: 'Hands', icon: 'layers', items: SKIN.map((c, i) => ({ label: ['Light', 'Light-medium', 'Medium', 'Medium-dark', 'Dark'][i], checked: st.skin === c, action() { st.skin = c; keep(); } })) },
      { label: 'Sleeves', icon: 'layers', items: [['Navy', '#2c3e50'], ['Black', '#151515'], ['Denim', '#3b5b8c'], ['Red flannel', '#8c2b2b'], ['White', '#e8e8e8']].map(([n, c]) => ({ label: n, checked: st.sleeve === c, action() { st.sleeve = c; keep(); } })) },
    ],
  };
}
REG.smoke = { label: 'Smoke break', menu: 'Smoke break (arm and lighter)', w: 240, h: 140, bare: true, create: smokeWidget };
})();
