/* Homeboard widgets: minigames and other self-contained cards.
 *
 * Each one is registered as  HomeboardWidgets[id] = { label, menu, w, h, ratio, bare, create }  where
 *   create(host, saved, onChange)  builds the widget inside `host` (a card body),
 *   restores from `saved` (whatever it last passed to onChange, or undefined)
 *   and calls onChange(state) whenever there is something worth remembering.
 * It may return  { menu(): items, grab(event): boolean }:
 *   menu()  supplies the widget's own right-click options,
 *   grab()  says whether a press at that spot should drag the card (true) or belongs to the widget.
 * `bare` widgets are shown without any card frame or header; everything is on the right-click menu.
 * A widget must stop by itself once its elements leave the page, so cards can simply be removed.
 */
(() => {
'use strict';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function modal(cls, title) {
  const back = el('div', 'hb-modal'), box = el('div', 'hb-modal-box ' + cls);
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-label', title);
  back.append(box);
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { back.remove(); removeEventListener('keydown', onKey, true); };
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  addEventListener('keydown', onKey, true);
  document.body.append(back);
  return { box, close };
}

/* ================================================================== *
 *  8-ball pool: you against the computer, or two players taking turns.
 *
 *  Physics follows the usual billiards model: a struck ball first slides,
 *  cloth friction turns the slide into roll (which is what makes the cue
 *  ball follow through after a hit), then rolling resistance stops it.
 *  Cushions are real segments with gaps and angled jaws at the six pockets.
 * ================================================================== */
function pool(host, saved, onChange) {
  const W = 1000, H = 500, R = 11.5, RAIL = 40, LIP = 16;      // playing field, in table units
  const STEP = 1 / 480, STRIKE = .1;
  const SLIDE = 780, ROLL_F = 90, ROLL_D = .3, E_BALL = .95, E_CUSH = .74;
  const MIN_SPEED = 160, MAX_SPEED = 2900;
  const CG = 34, SG = 27;                                      // pocket openings: corner (along each rail), side (half width)
  const HOLES = [
    { x: -2, y: -2, r: 24, ax: 15, ay: 15 }, { x: W / 2, y: -9, r: 22, ax: W / 2, ay: 1, side: true },
    { x: W + 2, y: -2, r: 24, ax: W - 15, ay: 15 }, { x: -2, y: H + 2, r: 24, ax: 15, ay: H - 15 },
    { x: W / 2, y: H + 9, r: 22, ax: W / 2, ay: H - 1, side: true }, { x: W + 2, y: H + 2, r: 24, ax: W - 15, ay: H - 15 },
  ];
  // each cushion: jaw, nose (the line balls bounce off), jaw
  const topC = [
    [[CG - LIP, -LIP], [CG, 0], [W / 2 - SG, 0], [W / 2 - SG + 5, -LIP]],
    [[W / 2 + SG - 5, -LIP], [W / 2 + SG, 0], [W - CG, 0], [W - CG + LIP, -LIP]],
  ];
  const leftC = [[[-LIP, CG - LIP], [0, CG], [0, H - CG], [-LIP, H - CG + LIP]]];
  const CUSHIONS = [...topC, ...topC.map(p => p.map(([x, y]) => [x, H - y])), ...leftC, ...leftC.map(p => p.map(([x, y]) => [W - x, y]))];
  const WALLS = CUSHIONS.flatMap(p => [[p[0], p[1]], [p[1], p[2]], [p[2], p[3]]]).map(([a, b]) => ({ x1: a[0], y1: a[1], dx: b[0] - a[0], dy: b[1] - a[1] }));
  const HEAD = { x: W * .25, y: H / 2 }, FOOT = { x: W * .72, y: H / 2 };
  const COLORS = ['#f4f1e6', '#f2c230', '#2f6fde', '#e0483e', '#7d4fd6', '#f08a2c', '#2f9e5b', '#8f2f3a', '#16171c'];
  /* Table looks. "auto" follows the page theme (neon table on the Neon theme, green otherwise). */
  const TABLES = {
    green: { name: 'Classic green', felt: ['#268a65', '#1c6e50'], bed: '#17573f', cushion: '#2f9d74', wood: ['#5b3b27', '#4a2f1f', '#3a2418'] },
    blue: { name: 'Tournament blue', felt: ['#2f78c2', '#1f5c9a'], bed: '#184a7c', cushion: '#3f8ddb', wood: ['#3b3c42', '#2b2c31', '#1f2023'] },
    red: { name: 'Burgundy', felt: ['#a43b40', '#7f2a2f'], bed: '#5f1f23', cushion: '#bd4b50', wood: ['#6a4630', '#523524', '#3d271a'] },
    grey: { name: 'Slate', felt: ['#6f7885', '#565e69'], bed: '#444b55', cushion: '#848e9c', wood: ['#2a2b2f', '#202124', '#17181a'] },
    black: { name: 'Black and gold', felt: ['#2c2f35', '#1e2024'], bed: '#15161a', cushion: '#3a3e46', wood: ['#1c1c1f', '#141416', '#0d0d0f'], sight: 'rgba(230,195,106,.9)', nose: 'rgba(230,195,106,.45)' },
    purple: { name: 'Purple', felt: ['#6a4bb0', '#523a8c'], bed: '#3e2c6b', cushion: '#8062c8', wood: ['#2f2a3a', '#24202d', '#1a1721'] },
    neon: { name: 'Neon', felt: ['#0d2233', '#081521'], bed: '#07111c', cushion: '#0f2c40', wood: ['#191238', '#150f30', '#0f0a26'], neon: true,
            sight: 'rgba(0,240,255,.7)', nose: 'rgba(0,240,255,.8)', line: 'rgba(0,240,255,.3)', text: 'rgba(0,240,255,.9)' },
  };
  /* Cues. "auto" follows the table (the neon cue on the neon table, maple otherwise). */
  const CUES = {
    maple: { name: 'Maple', shaft: '#d8b98a', butt: '#3a2416', wrap: '#1c1c1c', ring: '#f4f1e6' },
    ebony: { name: 'Ebony', shaft: '#c9ac80', butt: '#111114', wrap: '#2b2b30', ring: '#c9a94b' },
    rosewood: { name: 'Rosewood', shaft: '#dcc097', butt: '#6b2b22', wrap: '#3b1512', ring: '#e6c36a' },
    ocean: { name: 'Blue', shaft: '#d6c3a0', butt: '#1f4e9c', wrap: '#0f2a57', ring: '#f4f1e6' },
    emerald: { name: 'Green', shaft: '#d6c3a0', butt: '#1f6b47', wrap: '#0f3a26', ring: '#e6c36a' },
    wine: { name: 'Wine', shaft: '#d6c3a0', butt: '#7a1f2b', wrap: '#2a0c11', ring: '#f4f1e6' },
    carbon: { name: 'Carbon', shaft: '#3a3d44', butt: '#17181b', wrap: '#0c0c0e', ring: '#d0342c' },
    ivory: { name: 'White', shaft: '#efe9da', butt: '#f4f1e6', wrap: '#c9c2b0', ring: '#16171c' },
    neon: { name: 'Neon', shaft: '#00f0ff', butt: '#ff2bd6', wrap: '#7a1fa0', ring: '#ffffff', glow: true },
  };
  let skin = 'auto', stick = 'auto';
  const colorOf = n => (n === 0 ? COLORS[0] : n <= 8 ? COLORS[n] : COLORS[n - 8]);
  const groupOf = n => (n === 0 || n === 8 ? null : n < 8 ? 'solids' : 'stripes');
  const other = g => (g === 'solids' ? 'stripes' : 'solids');

  const stage = el('div', 'game-stage');
  const canvas = el('canvas');
  canvas.setAttribute('role', 'img');
  stage.append(canvas);
  host.append(stage);
  const ctx = canvas.getContext('2d');

  /* ---- game state ---- */
  let balls, tray, turn, groups, inHand, winner, breakShot, mode = 'cpu', note = '';
  let shot = null;                 // while balls are rolling: { first, potted, ownBefore, wasBreak }
  let stroke = null;               // the cue moving: { angle, power, spin, t } (t < 0 = winding up)
  let aim = 0, power = 0, spin = 0, charging = null, placing = false, hover = null;
  let aiTimer = 0, frame = 0, last = 0, acc = 0, view = { s: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };

  const mk = (n, x, y, on = true) => ({ n, x, y, vx: 0, vy: 0, sx: 0, sy: 0, in: on, sink: null, p: [0, 0, 1], a: [0, 1, 0] });
  const cue = () => balls[0];
  const live = () => balls.filter(b => b.in);
  const left = g => balls.filter(b => b.in && groupOf(b.n) === g).length;
  const names = () => (mode === 'cpu' ? ['You', 'Computer'] : ['Player 1', 'Player 2']);
  const busy = () => !!(shot || stroke || balls.some(b => b.sink));
  const humanTurn = () => winner == null && !shot && !stroke && (mode !== 'cpu' || turn === 0);

  function newGame() {
    const d = 2 * R + .6, spots = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j <= i; j++) spots.push({ x: FOOT.x + i * d * .866, y: FOOT.y + (j - i / 2) * d, i, j });
    const solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
    const pick = a => a.splice(Math.floor(Math.random() * a.length), 1)[0];
    const corners = Math.random() < .5 ? [pick(solids), pick(stripes)] : [pick(stripes), pick(solids)];
    const rest = [...solids, ...stripes];
    balls = [mk(0, HEAD.x, HEAD.y)];
    for (const s of spots) {
      const n = s.i === 2 && s.j === 1 ? 8 : s.i === 4 && s.j === 0 ? corners[0] : s.i === 4 && s.j === 4 ? corners[1] : pick(rest);
      balls.push(mk(n, s.x, s.y));
    }
    balls.sort((a, b) => a.n - b.n);
    tray = []; turn = 0; groups = [null, null]; inHand = true; winner = null; breakShot = true; shot = stroke = null;
    note = 'break';
    aim = 0; power = 0; spin = 0; charging = null;
  }
  function snapshot() {
    return {
      balls: balls.map(b => [b.n, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.in ? 1 : 0]),
      tray, turn, groups, inHand, winner, breakShot, mode, skin, stick,
    };
  }
  function restore(s) {
    try {
      if (!s || !Array.isArray(s.balls) || s.balls.length !== 16) return false;
      const list = s.balls.map(([n, x, y, on]) => mk(+n, +x, +y, !!on)).sort((a, b) => a.n - b.n);
      if (!list.every((b, i) => b.n === i && isFinite(b.x) && isFinite(b.y))) return false;
      balls = list;
      tray = Array.isArray(s.tray) ? s.tray.map(Number).filter(n => n > 0 && n < 16 && !balls[n].in)
           : balls.filter(b => b.n && !b.in).map(b => b.n);
      turn = s.turn === 1 ? 1 : 0;
      const g = Array.isArray(s.groups) ? s.groups : [];
      groups = g[0] === 'solids' || g[0] === 'stripes' ? [g[0], other(g[0])] : [null, null];
      inHand = !!s.inHand; winner = s.winner === 0 || s.winner === 1 ? s.winner : null; breakShot = !!s.breakShot;
      mode = s.mode === '2p' ? '2p' : 'cpu';
      shot = stroke = null; note = '';
      return true;
    } catch { return false; }
  }
  const remember = () => { try { onChange(snapshot()); } catch { /* host gone */ } };
  if (saved && (saved.skin === 'auto' || TABLES[saved.skin])) skin = saved.skin;
  if (saved && (saved.stick === 'auto' || CUES[saved.stick])) stick = saved.stick;

  /* ---- physics ---- */
  function roll(b, dx, dy) {                        // turn the ball's markings as it rolls by (dx, dy)
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    const ax = -dy / d, ay = dx / d, th = d / R, c = Math.cos(th), s = Math.sin(th);
    for (const p of [b.p, b.a]) {
      const dot = ax * p[0] + ay * p[1], cx = ay * p[2], cy = -ax * p[2], cz = ax * p[1] - ay * p[0];
      p[0] = p[0] * c + cx * s + ax * dot * (1 - c);
      p[1] = p[1] * c + cy * s + ay * dot * (1 - c);
      p[2] = p[2] * c + cz * s;
    }
  }
  function pot(b, hole) {
    b.in = false;
    b.sink = { t: 0, x: b.x, y: b.y, hx: hole.x, hy: hole.y };
    b.vx = b.vy = b.sx = b.sy = 0;
    if (shot) shot.potted.push(b.n);
    if (b.n) tray.push(b.n);
  }
  function step(dt) {
    let moving = false;
    for (const b of balls) {
      if (!b.in) continue;
      let ux = b.vx - b.sx, uy = b.vy - b.sy;        // slip between ball and cloth
      const u = Math.hypot(ux, uy);
      if (u > 5) {                                    // sliding: friction trades slide for roll
        const k = SLIDE * dt;
        if (3.5 * k >= u) { b.vx -= 2 / 7 * ux; b.vy -= 2 / 7 * uy; b.sx = b.vx; b.sy = b.vy; }
        else { ux /= u; uy /= u; b.vx -= k * ux; b.vy -= k * uy; b.sx += 2.5 * k * ux; b.sy += 2.5 * k * uy; }
      } else {                                        // rolling
        const sp = Math.hypot(b.vx, b.vy);
        const ns = sp - (ROLL_F + ROLL_D * sp) * dt;
        if (ns <= 3) { b.vx = b.vy = b.sx = b.sy = 0; continue; }
        b.vx *= ns / sp; b.vy *= ns / sp; b.sx = b.vx; b.sy = b.vy;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      roll(b, b.sx * dt, b.sy * dt);
      moving = true;
    }
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.in) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.in) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (2 * R - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {                                 // speed is exchanged along the line of centres; each ball keeps its own roll
          const k = -(1 + E_BALL) / 2 * rv;
          a.vx -= k * nx; a.vy -= k * ny; b.vx += k * nx; b.vy += k * ny;
        }
        if (shot && a.n === 0 && shot.first == null) shot.first = b.n;
      }
    }
    for (const b of balls) {
      if (!b.in) continue;
      const hole = HOLES.find(p => (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < p.r * p.r);
      if (hole) { pot(b, hole); continue; }
      if (b.x < -3 || b.x > W + 3 || b.y < -3 || b.y > H + 3) {     // through a pocket mouth
        pot(b, HOLES.reduce((m, p) => ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.x - m.x) ** 2 + (b.y - m.y) ** 2 ? p : m)));
        continue;
      }
      if (b.x > 40 && b.x < W - 40 && b.y > 40 && b.y < H - 40) continue;
      for (const w of WALLS) {
        const t = clamp(((b.x - w.x1) * w.dx + (b.y - w.y1) * w.dy) / (w.dx * w.dx + w.dy * w.dy), 0, 1);
        const qx = w.x1 + w.dx * t, qy = w.y1 + w.dy * t, ox = b.x - qx, oy = b.y - qy, d2 = ox * ox + oy * oy;
        if (d2 >= R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = ox / d, ny = oy / d;
        b.x = qx + nx * R; b.y = qy + ny * R;
        const vn = b.vx * nx + b.vy * ny;
        if (vn >= 0) continue;
        b.vx -= (1 + E_CUSH) * vn * nx; b.vy -= (1 + E_CUSH) * vn * ny;
        const vt = -b.vx * ny + b.vy * nx;            // the cushion also grips a little
        b.vx += .06 * vt * ny; b.vy -= .06 * vt * nx;
        const sn = b.sx * nx + b.sy * ny;
        if (sn < 0) { b.sx -= 1.5 * sn * nx; b.sy -= 1.5 * sn * ny; }
      }
    }
    return moving;
  }

  const free = (x, y, skip) => x >= R && x <= W - R && y >= R && y <= H - R &&
    !balls.some(b => b.in && b.n !== skip && (b.x - x) ** 2 + (b.y - y) ** 2 < 4 * R * R + 1);
  function spot(ball, at) {                         // put a ball back on the table near `at`
    for (let k = 0; k < 400; k++) {
      const x = at.x - (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3;
      if (free(x, at.y, ball.n)) { ball.x = x; ball.y = at.y; break; }
    }
    ball.in = true; ball.sink = null; ball.vx = ball.vy = ball.sx = ball.sy = 0;
    tray = tray.filter(n => n !== ball.n);
  }

  /* shoot = start the cue's stroke; the ball leaves when the tip arrives */
  function shoot(angle, pw, sp = 0, windup = 0) {
    stroke = { angle, power: clamp(pw, 0, 1), spin: clamp(sp, -1, 1), t: -windup, windup };
    aim = angle; charging = null; power = 0; note = '';
    refresh();
  }
  function launch(st) {
    const v = MIN_SPEED + st.power * (MAX_SPEED - MIN_SPEED), c = cue();
    c.vx = Math.cos(st.angle) * v; c.vy = Math.sin(st.angle) * v;
    c.sx = c.vx * st.spin * .9; c.sy = c.vy * st.spin * .9;     // top spin rolls with the shot, back spin against it
    shot = { first: null, potted: [], ownBefore: groups[turn] ? left(groups[turn]) : null, wasBreak: breakShot };
    inHand = false; breakShot = false;
  }

  /* ---- rules, applied once everything has stopped ---- */
  function settle() {
    const s = shot, me = turn, g = groups[me], who = names();
    shot = null;
    const scratch = s.potted.includes(0), eight = s.potted.includes(8);
    const objects = s.potted.filter(n => n !== 0 && n !== 8);
    let why = scratch ? 'scratch' : s.first == null ? 'no ball hit' : '';
    if (!why && !s.wasBreak) {
      const wrong = g ? (s.ownBefore === 0 ? s.first !== 8 : groupOf(s.first) !== g) : s.first === 8;
      if (wrong) why = 'wrong ball first';
    }
    const foul = !!why;
    if (scratch) spot(cue(), HEAD);

    if (eight && s.wasBreak) spot(balls[8], FOOT);
    else if (eight) {
      winner = g && s.ownBefore === 0 && !foul ? me : 1 - me;
      note = winner === me ? '8 ball down' : (foul && g && s.ownBefore === 0 ? `${why} on the 8` : '8 ball potted too early');
      refresh(); remember();
      return;
    }

    let keep = false;
    if (!foul) {
      if (s.wasBreak) keep = objects.length > 0;
      else if (!g && objects.length) { groups[me] = groupOf(objects[0]); groups[1 - me] = other(groups[me]); keep = true; }
      else if (g) keep = objects.some(n => groupOf(n) === g);
    }
    const sunk = objects.length ? `potted ${objects.join(', ')}` : '';
    if (foul) {
      turn = 1 - me; inHand = true;
      note = `foul (${why}): ${who[turn] === 'You' ? 'you have' : who[turn] + ' has'} ball in hand`;
    } else {
      if (!keep) turn = 1 - me;
      note = sunk;
    }
    refresh(); remember();
    if (mode === 'cpu' && turn === 1) thinkLater();
  }

  /* ---- computer player ---- */
  function travel(v0, dist) {                        // roll a struck ball along a line: how far it gets, and its speed at `dist`
    let v = v0, s = 0, d = 0;
    const dt = 1 / 120;
    for (let i = 0; i < 4000; i++) {
      const u = v - s;
      if (u > 5) { const k = SLIDE * dt; if (3.5 * k >= u) { v -= 2 / 7 * u; s = v; } else { v -= k; s += 2.5 * k; } }
      else { v -= (ROLL_F + ROLL_D * v) * dt; if (v <= 3) return { d, v: 0 }; s = v; }
      d += v * dt;
      if (d >= dist) return { d, v };
    }
    return { d, v };
  }
  function solve(test) {                             // smallest launch speed that satisfies `test`
    let lo = 0, hi = 6000;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (test(mid)) hi = mid; else lo = mid; }
    return hi;
  }
  function clearPath(x1, y1, x2, y2, skip) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
    return !balls.some(b => {
      if (!b.in || skip.includes(b.n)) return false;
      const t = clamp(((b.x - x1) * dx + (b.y - y1) * dy) / len2, 0, 1);
      return (b.x - x1 - dx * t) ** 2 + (b.y - y1 - dy * t) ** 2 < (2 * R - 1) ** 2;
    });
  }
  function targets() {
    const g = groups[turn];
    return live().filter(b => b.n !== 0 && (g ? (left(g) === 0 ? b.n === 8 : groupOf(b.n) === g) : b.n !== 8));
  }
  function bestShot(cx, cy) {
    let best = null;
    for (const t of targets()) for (const p of HOLES) {
      const dx = p.ax - t.x, dy = p.ay - t.y, d2 = Math.hypot(dx, dy), ux = dx / d2, uy = dy / d2;
      if (p.side && Math.abs(uy) < .55) continue;                        // too shallow for a side pocket
      const gx = t.x - ux * 2 * R, gy = t.y - uy * 2 * R;               // where the cue ball must be at contact
      if (gx < R || gx > W - R || gy < R || gy > H - R) continue;
      const ax = gx - cx, ay = gy - cy, d1 = Math.hypot(ax, ay);
      if (d1 < 1) continue;
      const cos = (ax * ux + ay * uy) / d1;                              // 1 = straight in, 0 = impossible cut
      if (cos < .34) continue;
      if (!clearPath(cx, cy, gx, gy, [0, t.n]) || !clearPath(t.x, t.y, p.ax, p.ay, [t.n])) continue;
      const score = cos ** 3 / (1 + (d1 + d2) / 700) * (p.side ? .85 : 1);
      if (!best || score > best.score) best = { score, angle: Math.atan2(ay, ax), d1, d2, cos };
    }
    return best;
  }
  function think() {
    aiTimer = 0;
    if (winner != null || shot || stroke || mode !== 'cpu' || turn !== 1 || !canvas.isConnected) return;
    const c = cue();
    if (breakShot) { shoot(Math.atan2(FOOT.y - c.y + (Math.random() - .5) * 8, FOOT.x - c.x), 1, 0, .7); return; }
    if (inHand) {                                   // ball in hand: try a handful of spots, keep the best
      let top = bestShot(c.x, c.y), at = null;
      for (let i = 0; i < 60; i++) {
        const x = R + Math.random() * (W - 2 * R), y = R + Math.random() * (H - 2 * R);
        if (!free(x, y, 0)) continue;
        const s = bestShot(x, y);
        if (s && (!top || s.score > top.score)) { top = s; at = { x, y }; }
      }
      if (at) { c.x = at.x; c.y = at.y; }
    }
    const s = bestShot(c.x, c.y);
    if (s) {
      const need = solve(v => travel(v, s.d2 + 160).d >= s.d2 + 160);     // object ball: reach the pocket with pace to spare
      const hit = need / (s.cos * (1 + E_BALL) / 2);                      // cue-ball speed wanted at contact
      const v = clamp(solve(v0 => travel(v0, s.d1).v >= hit), 420, MAX_SPEED);
      shoot(s.angle + (Math.random() - .5) * .034, (v - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0, .7);
    } else {                                        // nothing on: just make a legal hit
      const t = targets().sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0] || balls[8];
      shoot(Math.atan2(t.y - c.y, t.x - c.x) + (Math.random() - .5) * .03, .3, 0, .7);
    }
  }
  function thinkLater() { clearTimeout(aiTimer); aiTimer = setTimeout(think, 700); }

  /* ---- drawing ---- */
  function layout() {
    const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (!w || !h) return false;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const s = Math.min(w / (W + 2 * RAIL), h / (H + 2 * RAIL));
    view = { s, ox: (w - (W + 2 * RAIL) * s) / 2 + RAIL * s, oy: (h - (H + 2 * RAIL) * s) / 2 + RAIL * s, w, h, dpr };
    return true;
  }
  function rayFromCue(angle) {                      // first thing the cue ball meets along `angle`
    const c = cue(), dx = Math.cos(angle), dy = Math.sin(angle);
    let t = Infinity, hit = null;
    for (const b of balls) {
      if (!b.in || b.n === 0) continue;
      const px = b.x - c.x, py = b.y - c.y, along = px * dx + py * dy;
      if (along <= 0) continue;
      const off2 = px * px + py * py - along * along;
      if (off2 >= 4 * R * R) continue;
      const tt = along - Math.sqrt(4 * R * R - off2);
      if (tt < t) { t = tt; hit = b; }
    }
    if (!hit) {
      const tx = dx > 0 ? (W - R - c.x) / dx : dx < 0 ? (R - c.x) / dx : Infinity;
      const ty = dy > 0 ? (H - R - c.y) / dy : dy < 0 ? (R - c.y) / dy : Infinity;
      t = Math.min(tx, ty);
    }
    return { x: c.x + dx * t, y: c.y + dy * t, hit };
  }
  function drawBall(b, x, y, r, fade) {
    const col = colorOf(b.n), P = b.p, A = b.a;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    ctx.fillStyle = b.n > 8 || b.n === 0 ? '#f4f1e6' : col; ctx.fill();
    ctx.clip();
    if (b.n > 8) {                                   // stripe: the great circle that carries the number
      const Q = [A[1] * P[2] - A[2] * P[1], A[2] * P[0] - A[0] * P[2], A[0] * P[1] - A[1] * P[0]];
      ctx.strokeStyle = col; ctx.lineWidth = r * 1.08; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 36; i++) {
        const t = i / 36 * 6.2832, c = Math.cos(t), s = Math.sin(t);
        if (c * P[2] + s * Q[2] < -.03) { pen = false; continue; }
        const px = x + (c * P[0] + s * Q[0]) * r, py = y + (c * P[1] + s * Q[1]) * r;
        if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.stroke();
    }
    for (const side of [1, -1]) {                     // the number spot (or the cue ball's dot), one each side
      const z = P[2] * side;
      if (z <= .06) continue;
      const cx = x + P[0] * side * r, cy = y + P[1] * side * r;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(Math.atan2(P[1] * side, P[0] * side)); ctx.scale(z, 1);
      ctx.beginPath(); ctx.arc(0, 0, b.n ? r * .54 : r * .16, 0, 7);
      ctx.fillStyle = b.n ? '#f4f1e6' : '#d0342c'; ctx.fill();
      ctx.restore();
      if (b.n && z > .5) {
        ctx.globalAlpha = fade * Math.min(1, (z - .5) * 5);
        ctx.fillStyle = '#16171c'; ctx.fillText(String(b.n), cx, cy + .6);
        ctx.globalAlpha = fade;
      }
    }
    const shine = ctx.createRadialGradient(x - r * .4, y - r * .45, r * .08, x, y, r);
    shine.addColorStop(0, 'rgba(255,255,255,.55)'); shine.addColorStop(.3, 'rgba(255,255,255,0)'); shine.addColorStop(1, 'rgba(0,0,0,.3)');
    ctx.fillStyle = shine; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
  }
  function drawCue(angle, pull, neon) {
    const q = CUES[stick] || (neon ? CUES.neon : CUES.maple);
    const c = cue(), dx = Math.cos(angle), dy = Math.sin(angle), back = R + 4 + pull * 130, len = 360;
    const seg = (from, to, color, w, cap) => {      // a stretch of the cue, measured back from the tip
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = cap || 'butt';
      ctx.beginPath(); ctx.moveTo(c.x - dx * (back + from), c.y - dy * (back + from)); ctx.lineTo(c.x - dx * (back + to), c.y - dy * (back + to)); ctx.stroke();
    };
    ctx.save(); ctx.translate(3, 5); seg(0, len, 'rgba(0,0,0,.25)', 8, 'round'); ctx.restore();
    if (q.glow) { ctx.shadowColor = q.shaft; ctx.shadowBlur = 10; }
    seg(12, len - 140, q.shaft, 6.5);
    seg(len - 140, len, q.butt, 8, 'round');
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    seg(len - 100, len - 40, q.wrap, 8);
    seg(len - 140, len - 135, q.ring, 8);
    seg(3, 13, '#f4f1e6', 6);
    seg(0, 3, '#3d7fd6', 5.5);
  }
  /* Choosing a cue: they stand in a rack; scroll along it and take one. */
  function openRack() {
    const { box, close } = modal('cue-rack', 'Choose a cue');
    const wall = el('div', 'rack-wall'), row = el('div', 'rack-row');
    for (const [id, q] of [['auto', { ...CUES.maple, name: 'Match the table' }], ...Object.entries(CUES)]) {
      const slot = el('button', 'rack-slot' + (stick === id ? ' on' : '') + (q.glow ? ' glow' : ''));
      slot.type = 'button'; slot.title = q.name; slot.dataset.cue = id;
      const wood = el('div', 'rack-cue');
      for (const k of ['shaft', 'butt', 'wrap', 'ring']) wood.style.setProperty('--' + k, q[k]);
      slot.append(wood, el('span', 'rack-tag', q.name));
      slot.addEventListener('click', () => { stick = id; refresh(); remember(); close(); });
      row.append(slot);
    }
    row.addEventListener('wheel', e => { if (!e.deltaX) { e.preventDefault(); row.scrollLeft += e.deltaY; } }, { passive: false });
    wall.append(row, el('div', 'rack-bar top'), el('div', 'rack-bar bottom'));
    box.append(wall, el('div', 'hb-modal-tip', 'Scroll along the rack. Click a cue to play with it.'));
    row.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function draw() {
    if (!layout()) return;
    const pal = TABLES[skin] || (document.body.dataset.theme === 'neon' ? TABLES.neon : TABLES.green);
    const neon = !!pal.neon;
    const { s, ox, oy, dpr } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);

    // frame, bed, cushions, pockets
    const wood = ctx.createLinearGradient(0, -RAIL, 0, H + RAIL);
    pal.wood.forEach((c, i) => wood.addColorStop(i / (pal.wood.length - 1), c));
    ctx.shadowColor = neon ? '#ff2bd6' : 'rgba(0,0,0,.5)'; ctx.shadowBlur = neon ? 22 : 18; ctx.shadowOffsetY = neon ? 0 : 6;
    ctx.fillStyle = wood;
    ctx.beginPath(); ctx.roundRect(-RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 30); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = 'transparent';
    if (neon) { ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 2.5; ctx.stroke(); }
    ctx.fillStyle = pal.bed;
    ctx.beginPath(); ctx.roundRect(-LIP - 2, -LIP - 2, W + 2 * LIP + 4, H + 2 * LIP + 4, 12); ctx.fill();
    const felt = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * .62);
    felt.addColorStop(0, pal.felt[0]); felt.addColorStop(1, pal.felt[1]);
    ctx.fillStyle = felt; ctx.fillRect(-LIP, -LIP, W + 2 * LIP, H + 2 * LIP);
    ctx.fillStyle = neon ? '#000' : '#08090b';
    for (const p of HOLES) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    for (const c of CUSHIONS) {
      ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]);
      ctx.closePath();
      ctx.fillStyle = pal.cushion; ctx.fill();
      ctx.strokeStyle = pal.nose || 'rgba(255,255,255,.16)'; ctx.lineWidth = neon ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(c[1][0], c[1][1]); ctx.lineTo(c[2][0], c[2][1]); ctx.stroke();
    }
    ctx.fillStyle = pal.sight || 'rgba(240,225,190,.55)';                       // sights on the rail
    for (let i = 1; i < 8; i++) if (i !== 4) for (const y of [-28, H + 28]) { ctx.beginPath(); ctx.arc(W * i / 8, y, 2.6, 0, 7); ctx.fill(); }
    for (let i = 1; i < 4; i++) for (const x of [-28, W + 28]) { ctx.beginPath(); ctx.arc(x, H * i / 4, 2.6, 0, 7); ctx.fill(); }
    ctx.strokeStyle = pal.line || 'rgba(255,255,255,.1)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(HEAD.x, 0); ctx.lineTo(HEAD.x, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(FOOT.x, FOOT.y, 2.5, 0, 7); ctx.fillStyle = ctx.strokeStyle; ctx.fill();

    // potted balls, lined up in the bottom rail
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 7px "Segoe UI", system-ui, sans-serif';
    tray.forEach((n, i) => {
      const x = 62 + i * 19, y = H + 28, col = colorOf(n);
      ctx.beginPath(); ctx.arc(x, y, 7.5, 0, 7); ctx.fillStyle = n > 8 ? '#f4f1e6' : col; ctx.fill();
      if (n > 8) { ctx.save(); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(x - 8, y - 4, 16, 8); ctx.restore(); }
      ctx.fillStyle = n > 8 || n === 1 ? '#16171c' : '#f4f1e6'; ctx.fillText(String(n), x, y + .5);
    });

    // aiming aids, then the cue
    const c = cue();
    const aiming = humanTurn() && c.in && (hover || charging) && !placing;
    if ((aiming || stroke) && c.in) {
      const a = stroke ? stroke.angle : aim, r = rayFromCue(a), dx = Math.cos(a), dy = Math.sin(a);
      ctx.strokeStyle = `rgba(255,255,255,${stroke ? .3 : .55})`; ctx.lineWidth = 1.5; ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.moveTo(c.x + dx * R, c.y + dy * R); ctx.lineTo(r.x, r.y); ctx.stroke();
      ctx.setLineDash([]);
      if (aiming) {
        ctx.beginPath(); ctx.arc(r.x, r.y, R, 0, 7); ctx.stroke();
        if (r.hit) {                                   // where the object ball heads, and where the cue ball glances off
          const nx = r.hit.x - r.x, ny = r.hit.y - r.y, n = Math.hypot(nx, ny) || 1, ux = nx / n, uy = ny / n;
          ctx.beginPath(); ctx.moveTo(r.hit.x, r.hit.y); ctx.lineTo(r.hit.x + ux * 80, r.hit.y + uy * 80); ctx.stroke();
          const side = dx * -uy + dy * ux >= 0 ? 1 : -1;
          ctx.strokeStyle = 'rgba(255,255,255,.28)';
          ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - uy * side * 45, r.y + ux * side * 45); ctx.stroke();
        }
      }
      let pull = power;
      if (stroke) pull = stroke.t < 0 ? stroke.power * (1 - (-stroke.t / stroke.windup) ** 2) : stroke.power * (1 - stroke.t / STRIKE);
      drawCue(a, Math.max(0, pull), neon);
    }

    // balls (sinking ones first, so they pass under the others)
    ctx.font = '700 10.5px "Segoe UI", system-ui, sans-serif';
    for (const b of balls) {
      if (!b.sink) continue;
      const t = Math.min(1, b.sink.t), e = t * t;
      drawBall(b, b.sink.x + (b.sink.hx - b.sink.x) * e, b.sink.y + (b.sink.hy - b.sink.y) * e, R * (1 - .45 * t), 1 - e);
    }
    for (const b of balls) {
      if (!b.in) continue;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + 4.5, R, R * .92, 0, 0, 7); ctx.fill();
      if (neon) { ctx.shadowColor = b.n === 8 ? '#fff' : colorOf(b.n); ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(b.x, b.y, R - 1, 0, 7); ctx.fillStyle = colorOf(b.n); ctx.fill(); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
      drawBall(b, b.x, b.y, R, 1);
    }
    if (humanTurn() && inHand && c.in) {             // "you may move me"
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(c.x, c.y, R + 7, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }

    // power, spin
    if (charging) {
      const bw = 240, x = W / 2 - bw / 2, y = H + 23;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.roundRect(x, y, bw, 9, 4.5); ctx.fill();
      ctx.fillStyle = power > .8 ? '#f0717d' : power > .45 ? '#f5c84c' : '#6fd08c';
      ctx.beginPath(); ctx.roundRect(x, y, Math.max(9, bw * power), 9, 4.5); ctx.fill();
    }
    if (spin && humanTurn()) {
      const x = W - 62, y = H + 28;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fillStyle = '#f4f1e6'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - spin * 5.5, 2.4, 0, 7); ctx.fillStyle = '#d0342c'; ctx.fill();
    }
    if (winner != null) {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-LIP, -LIP, W + 2 * LIP, H + 2 * LIP);
      ctx.fillStyle = '#fff'; ctx.font = '700 46px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(mode === 'cpu' ? (winner === 0 ? 'You win' : 'Computer wins') : `${names()[winner]} wins`, W / 2, H / 2 - 8);
      ctx.font = '500 17px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText('right-click for a new game', W / 2, H / 2 + 30);
    }

    // one quiet line of status on the top rail, drawn at screen size so it stays readable
    const px = Math.max(9, Math.min(13, RAIL * s * .42));
    if ((RAIL - LIP) * s >= px) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `600 ${px}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = pal.text || 'rgba(244,236,220,.72)';
      ctx.fillText(statusLine(), ox + 30 * s, oy - (LIP + (RAIL - LIP) / 2) * s, (W / 2 - 70) * s);   // left half: the card's pin sits at top centre
    }
  }

  function statusLine() {
    const who = names();
    if (winner != null) return `${who[winner]} ${who[winner] === 'You' ? 'win' : 'wins'}${note ? ' · ' + note : ''}`;
    const tag = who[turn] + (groups[turn] ? ` · ${groups[turn]}` : '');
    const doing = stroke || shot ? '' : mode === 'cpu' && turn === 1 ? ' · thinking…' : breakShot ? ' · break: aim, hold and pull back' : inHand ? ' · drag the white ball, then shoot' : '';
    return tag + doing + (note && note !== 'break' ? `   ·   ${note}` : '');
  }
  function refresh() {
    canvas.setAttribute('aria-label', 'Pool table. ' + statusLine());
    kick();
  }

  /* ---- loop: only runs while something is moving or being aimed ---- */
  function tick(now) {
    frame = 0;
    if (!canvas.isConnected) { clearTimeout(aiTimer); observer.disconnect(); return; }
    const dt = Math.min(.05, (now - last) / 1000 || 0);
    last = now;
    if (stroke) {
      stroke.t += dt;
      if (stroke.t >= STRIKE) { const st = stroke; stroke = null; launch(st); acc = 0; }
    } else if (shot) {
      acc += dt;
      let moving = true;
      while (acc >= STEP && moving) { moving = step(STEP); acc -= STEP; }
      if (!moving) { acc = 0; settle(); }
    }
    for (const b of balls) if (b.sink && (b.sink.t += dt / .32) >= 1) b.sink = null;
    draw();
    if (busy()) kick();
  }
  function kick() { if (!frame) { if (!busy()) last = performance.now(); frame = requestAnimationFrame(tick); } }

  /* ---- input ---- */
  function toTable(e) {
    const r = canvas.getBoundingClientRect();        // already includes the board's zoom
    const px = (e.clientX - r.left) / (r.width || 1) * view.w, py = (e.clientY - r.top) / (r.height || 1) * view.h;
    return { x: (px - view.ox) / view.s, y: (py - view.oy) / view.s };
  }
  const onCloth = p => p.x > -LIP && p.x < W + LIP && p.y > -LIP && p.y < H + LIP;
  canvas.addEventListener('pointermove', e => {
    const p = toTable(e), c = cue();
    hover = onCloth(p) || charging || placing ? p : null;
    canvas.style.cursor = hover ? (humanTurn() ? 'crosshair' : 'default') : 'grab';
    if (placing) { if (free(p.x, p.y, 0)) { c.x = p.x; c.y = p.y; } }
    else if (charging) {
      const pull = (charging.x - p.x) * Math.cos(aim) + (charging.y - p.y) * Math.sin(aim);
      power = clamp(pull / 170, 0, 1);
    } else if (humanTurn() && hover) aim = Math.atan2(p.y - c.y, p.x - c.x);
    kick();
  });
  canvas.addEventListener('pointerdown', e => {
    const p = toTable(e), c = cue();
    if (e.button !== 0 || !onCloth(p) || !humanTurn()) return;
    e.preventDefault();
    hover = p;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    if (inHand && Math.hypot(p.x - c.x, p.y - c.y) < R * 2.2) placing = true;
    else { aim = Math.atan2(p.y - c.y, p.x - c.x); charging = p; power = 0; }
    kick();
  });
  const release = e => {
    if (placing) { placing = false; remember(); }
    else if (charging) {
      const pw = power;
      charging = null; power = 0;
      if (pw > .03 && e.type === 'pointerup') shoot(aim, pw, spin);
    }
    kick();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (!charging && !placing) { hover = null; kick(); } });
  canvas.addEventListener('wheel', e => {            // scroll while aiming: top spin (up) or back spin (down)
    if (e.ctrlKey || e.metaKey || !humanTurn()) return;
    e.preventDefault(); e.stopPropagation();
    spin = clamp(Math.round((spin - Math.sign(e.deltaY) * .25) * 4) / 4, -1, 1);
    kick();
  }, { passive: false });

  const observer = new ResizeObserver(kick);
  observer.observe(stage);
  if (!restore(saved)) newGame();
  refresh();
  if (mode === 'cpu' && turn === 1 && winner == null) thinkLater();

  return {
    grab: e => !onCloth(toTable(e)),                 // the wooden rail moves the card; the cloth is the game
    menu: () => [
      { info: statusLine() },
      { label: 'New game', icon: 'reload', action() { clearTimeout(aiTimer); newGame(); refresh(); remember(); } },
      {
        label: 'Play against the computer', checked: mode === 'cpu',
        action() {
          mode = mode === 'cpu' ? '2p' : 'cpu';
          clearTimeout(aiTimer); refresh(); remember();
          if (mode === 'cpu' && turn === 1 && !busy() && winner == null) thinkLater();
        },
      },
      { label: 'Choose a cue', icon: 'layers', action: openRack },
      {
        label: 'Change table', icon: 'layers',
        items: [{ label: 'Match the page theme', checked: skin === 'auto', action() { skin = 'auto'; refresh(); remember(); } },
          ...Object.entries(TABLES).map(([id, t]) => ({ label: t.name, checked: skin === id, action() { skin = id; refresh(); remember(); } }))],
      },
      { info: 'Aim with the mouse, hold and pull back for power. Scroll for top or back spin.' },
    ],
  };
}

/* ================================================================== *
 *  Cigarette pack: a flip-top pack that counts what is left in the real one.
 *  Click to open, click the cigarettes to take one, click that to light it
 *  (or hold, in "burn only while I hold it" mode); double-click finishes it.
 *  Everything else is on the right-click menu.
 * ================================================================== */
const SERIF = `font-family="Georgia, 'Times New Roman', serif"`;
const SANS = `font-family="Arial, Helvetica, sans-serif"`;
const SLAB = `font-family="Rockwell, 'Roboto Slab', Georgia, serif"`;
const T = (x, y, text, attrs) => `<text x="${x}" y="${y}" text-anchor="middle" ${attrs}>${text}</text>`;
/* The health warning that takes the top of every current pack: picture area, text, quit line. */
const warning = lines => `<rect width="120" height="112" fill="#141414"/><rect width="120" height="54" fill="#242424"/>`
  + `<path d="M0 54Q28 22 58 38T120 16V54Z" fill="#303030"/><path d="M0 54Q40 40 70 48T120 36V54Z" fill="#3a3a3a"/>`
  + lines.map((l, i) => T(60, 92 - (lines.length - 1 - i) * 11.5, l, `fill="#fff" font-size="9.200" font-weight="700" ${SANS}`)).join('')
  + `<rect y="98" width="120" height="14" fill="#f4d21f"/>`
  + T(60, 103.6, 'Para deixar de fumar:', `fill="#111" font-size="4.300" font-weight="700" ${SANS}`)
  + T(60, 109.2, '808 24 24 24 ou www.dgs.pt', `fill="#111" font-size="4.300" font-weight="700" ${SANS}`);
const lines = (x0, x1, step, y, h, color, w) => { let d = ''; for (let x = x0; x <= x1; x += step) d += `M${x} ${y}v${h}`; return `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none"/>`; };

/* Pack faces, 120 x 190, redrawn as simple vector art (top 54 = the lid). */
const SKINS = {
  portugues: { name: 'Português', art: () => warning(['Os filhos de', 'fumadores têm maior', 'propensão para fumar'])
    + `<rect y="112" width="120" height="78" fill="#c4161c"/><rect y="180" width="120" height="10" fill="#141414"/>`
    + `<path d="M82 132h12v-8h-2v-3h-2v3h-1.500v-5h-2v5H85v-3h-2v3h-1z" fill="#fff" opacity=".92"/>`
    + T(60, 162, 'PORTUGUÊS', `fill="#fff" font-size="15.500" font-weight="700" letter-spacing=".3" ${SERIF}`) },
  marlboro: { name: 'Marlboro', art: () => warning(['Fumar reduz', 'a fertilidade'])
    + `<rect y="112" width="120" height="78" fill="#fbfaf6"/><path d="M0 112h120v38L60 124 0 150z" fill="#c8171e"/>`
    + T(60, 177, 'Marlboro', `fill="#1a1a1a" font-size="20" font-weight="700" ${SERIF}`) },
  sgventil: { name: 'SG Ventil', art: () => `<rect width="120" height="190" fill="#f3c531"/><rect y="118" width="120" height="72" fill="#cfd8ea"/>`
    + lines(3, 117, 4, 118, 72, '#8ea0c6', .8)
    + T(60, 97, 'SG', `fill="#c4161c" stroke="#fff" stroke-width="1.400" paint-order="stroke" font-size="44" font-weight="700" ${SLAB}`)
    + T(60, 111, 'VENTIL', `fill="#1d2f6f" font-size="8.500" font-weight="700" letter-spacing="2.500" ${SANS}`)
    + `<rect x="51" y="138" width="18" height="22" rx="3" fill="#1d2f6f"/><circle cx="60" cy="149" r="4.500" fill="#f3c531"/>`
    + T(60, 181, 'CIGARROS COM FILTRO', `fill="#1d2f6f" font-size="4.400" font-weight="700" letter-spacing=".8" ${SANS}`) },
  sggigante: { name: 'SG Gigante', art: () => `<rect width="120" height="190" fill="#a8141b"/><rect y="46" width="120" height="2" fill="#e6c36a"/>`
    + `<rect x="37" y="76" width="46" height="46" rx="3" fill="none" stroke="#fff" stroke-width="3"/>`
    + T(60, 108, 'SG', `fill="#fff" font-size="24" font-weight="700" ${SLAB}`)
    + T(60, 148, 'gigante', `fill="#fff" font-size="14" font-style="italic" ${SERIF}`) },
  ct: { name: 'CT', art: () => `<rect width="120" height="190" fill="#f8f5ec"/><rect width="120" height="46" fill="#c4161c"/><rect y="152" width="120" height="38" fill="#c4161c"/>`
    + T(60, 124, 'CT', `fill="#c4161c" stroke="#7c0d12" stroke-width=".9" font-size="64" font-weight="700" ${SLAB}`)
    + T(60, 143, 'KING SIZE', `fill="#555" font-size="5.500" letter-spacing="1.800" ${SANS}`) },
  suave: { name: 'Português Suave', art: () => `<rect width="120" height="190" fill="#f7f3e8"/><rect x="6" y="6" width="108" height="178" fill="none" stroke="#b8943f" stroke-width="1.200"/>`
    + `<ellipse cx="60" cy="102" rx="22" ry="27" fill="#1f5d3a" stroke="#b8943f" stroke-width="2"/>`
    + `<path d="M60 86l4.500 9 10 1.500-7.200 7 1.700 10-9-4.700-9 4.700 1.700-10-7.200-7 10-1.500z" fill="#e6c36a"/>`
    + T(60, 150, 'português', `fill="#222" font-size="11" font-weight="700" ${SANS}`)
    + T(60, 167, 'SUAVE', `fill="#1f5d3a" font-size="13" font-weight="700" letter-spacing="3" ${SERIF}`) },
  porto: { name: 'Porto', art: () => `<rect width="120" height="190" fill="#f8f5ec"/><rect y="114" width="120" height="76" fill="#1f4e9c"/><rect x="50" y="10" width="20" height="20" fill="#c9a94b"/>`
    + T(60, 86, 'PORTO', `fill="#1b2b55" font-size="23" font-weight="700" letter-spacing="1" ${SERIF}`)
    + T(60, 104, 'gigante', `fill="#1f4e9c" font-size="14" font-style="italic" ${SERIF}`)
    + `<path d="M8 170h104M14 170v-16M106 170v-16M14 157q46-36 92 0" fill="none" stroke="#fff" stroke-width="2.200"/>`
    + `<path d="M29 170v-23M44 170v-30M60 170v-32M76 170v-30M91 170v-23" stroke="#fff" stroke-width="1.200"/>` },
  estoril: { name: 'Estoril', art: () => `<rect width="120" height="190" fill="#f6f2e7"/><path d="M53 60h14v9q0 8-7 11-7-3-7-11z" fill="#c4161c"/>`
    + `<ellipse cx="60" cy="110" rx="49" ry="21" fill="#1f3f8f" stroke="#c9a94b" stroke-width="1.500"/>`
    + T(60, 117, 'Estoril', `fill="#fff" font-size="21" font-weight="700" ${SERIF}`)
    + T(60, 148, 'CIGARROS', `fill="#333" font-size="5.500" letter-spacing="2" ${SANS}`)
    + T(60, 163, 'Extra Longos', `fill="#1f3f8f" font-size="11" font-style="italic" ${SERIF}`) },
  sagres: { name: 'Sagres', art: () => `<rect width="120" height="190" fill="#d3201f"/><rect y="10" width="120" height="2.500" fill="#8f1414"/><rect y="17" width="120" height="2.500" fill="#8f1414"/><rect y="24" width="120" height="2.500" fill="#8f1414"/>`
    + `<g transform="rotate(-4 60 108)">` + T(60, 116, 'SAGRES', `fill="#2a0b0b" font-size="24" font-weight="700" letter-spacing="1" ${SERIF}`) + `</g>`
    + `<rect y="130" width="120" height="1.500" fill="#f3c531"/>` + T(60, 178, 'CIGARROS', `fill="#f6d9a0" font-size="5" letter-spacing="2" ${SANS}`) },
  kart: { name: 'Kart', art: () => `<rect width="120" height="190" fill="#6f87ba"/><path d="M-5 152Q60 74 125 122V150Q60 112 -5 178z" fill="#fff"/>`
    + `<g transform="rotate(-8 60 84)">` + T(58, 92, 'KART', `fill="#fff" font-size="31" font-weight="700" font-style="italic" ${SANS}`) + `</g>`
    + T(92, 104, 'FILTRO', `fill="#fff" font-size="6" letter-spacing="1.500" ${SANS}`)
    + `<path d="M96 150l2 5 5 .500-4 3.500 1.200 5-4.200-2.800-4.200 2.800 1.200-5-4-3.500 5-.500z" fill="#c4161c"/>` },
  definitivos: { name: 'Definitivos', art: () => `<rect width="120" height="190" fill="#f6f2e7"/><rect y="46" width="120" height="3" fill="#c4161c"/><path d="M60 70 114 106 60 142 6 106z" fill="#c4161c"/>`
    + T(60, 109.5, 'DEFINITIVOS', `fill="#fff" font-size="10" font-weight="700" letter-spacing=".4" ${SANS}`)
    + T(60, 164, 'CIGARROS', `fill="#c4161c" font-size="6" letter-spacing="2" ${SANS}`) },
  provisorios: { name: 'Provisórios', art: () => { let s = ''; for (let x = 0; x < 120; x += 16) s += `<rect x="${x}" y="100" width="8" height="90" fill="#c4161c"/>`;
    return `<rect width="120" height="190" fill="#f6f2e7"/>${s}<rect x="8" y="62" width="104" height="26" fill="#f6f2e7" stroke="#c4161c" stroke-width="1.500"/>`
      + T(60, 79.5, 'PROVISÓRIOS', `fill="#c4161c" font-size="11.500" font-weight="700" ${SERIF}`); } },
  tresvintes: { name: 'Três Vintes', art: () => `<rect width="120" height="190" fill="#f2c019"/><rect x="48" width="24" height="30" fill="#3f8f5a" opacity=".85"/>`
    + T(60, 70, 'TRÊS VINTES', `fill="#7a1512" font-size="9" font-weight="700" letter-spacing="1.500" ${SANS}`)
    + `<ellipse cx="60" cy="106" rx="51" ry="23" fill="#151515"/>` + T(60, 113, '20·20·20', `fill="#f6f2e7" font-size="20" font-weight="700" ${SANS}`)
    + T(60, 148, 'A TABAQUEIRA', `fill="#7a1512" font-size="6" letter-spacing="1.500" ${SANS}`) },
  classico: { name: 'Plain', art: () => `<rect width="120" height="190" fill="#b3261e"/><rect y="40" width="120" height="5" fill="#e9c46a"/><rect y="54" width="120" height="46" fill="#f6f1e4"/>`
    + T(60, 82, 'TABACO', `fill="#2a2118" font-size="15" font-weight="700" letter-spacing="2.400" ${SERIF}`)
    + T(60, 93, '20 CIGARROS', `fill="#2a2118" font-size="5.500" letter-spacing="1" opacity=".75" ${SERIF}`)
    + `<rect x="8" y="150" width="104" height="30" fill="#fff" stroke="#111" stroke-width="3"/>` + T(60, 170, 'Fumar mata', `fill="#111" font-size="13" font-weight="700" ${SANS}`) },
};
const PICTURE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/* Where the tobacco machine stands. Drawn, not photographed; 1600 x 900, cropped to fill the screen. */
const stars = n => Array.from({ length: n }, (_, i) => `<circle cx="${(i * 397) % 1600}" cy="${(i * 211) % 330}" r="${1 + (i % 3) * .5}" fill="#fff" opacity="${.35 + (i % 5) * .12}"/>`).join('');
const planks = (y, h, step, color) => { let d = ''; for (let x = 0; x <= 1600; x += step) d += `M${x} ${y}v${h}`; return `<path d="${d}" stroke="${color}" stroke-width="2"/>`; };
const SCENES = {
  'cafe-night': { name: 'Café at night', art: () => `
    <defs>
      <filter id="cnGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .7" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .12  0 0 0 0 .06  0 0 0 0 .02  0 0 0 1.1 -.25"/></filter>
      <filter id="cnBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>
      <filter id="cnSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="20"/></filter>
      <filter id="cnDof" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter>
      <linearGradient id="cnWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a4426"/><stop offset="1" stop-color="#3b2413"/></linearGradient>
      <linearGradient id="cnStreet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1330"/><stop offset=".45" stop-color="#27262f"/><stop offset="1" stop-color="#5a4433"/></linearGradient>
      <linearGradient id="cnFrame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a6240"/><stop offset="1" stop-color="#4a301c"/></linearGradient>
      <linearGradient id="cnCopper" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e3415"/><stop offset=".45" stop-color="#e09a5c"/><stop offset="1" stop-color="#7a3a18"/></linearGradient>
      <linearGradient id="cnBrass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b4f1e"/><stop offset=".5" stop-color="#e2c070"/><stop offset="1" stop-color="#6b4f1e"/></linearGradient>
      <radialGradient id="cnLamp" cx="87%" cy="10%" r="75%"><stop offset="0" stop-color="#ffbe6e" stop-opacity=".8"/><stop offset=".4" stop-color="#c8702a" stop-opacity=".24"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="cnVig" cx="50%" cy="46%" r="76%"><stop offset=".42" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></radialGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#cnWood)"/><rect width="1600" height="900" filter="url(#cnGrain)"/>${planks(0, 600, 132, '#1c1009')}
    <!-- window onto a lit street, out of focus -->
    <rect x="96" y="112" width="512" height="428" fill="url(#cnStreet)"/>
    <g filter="url(#cnBlur)"><path d="M96 540V180l150 80v280zM608 540V160l-170 110v270z" fill="#3a332e"/><path d="M246 540l96-150 96 150z" fill="#6b5a48"/>
      <path d="M96 300h150M96 400h150M438 320h170M438 430h170" stroke="#241f1b" stroke-width="10"/>
      <circle cx="150" cy="300" r="14" fill="#ffcf7a" opacity="0.78"/><circle cx="200" cy="360" r="9" fill="#ffcf7a" opacity="0.70"/><circle cx="250" cy="330" r="18" fill="#ffcf7a" opacity="0.85"/><circle cx="300" cy="395" r="11" fill="#ffcf7a" opacity="0.73"/><circle cx="345" cy="350" r="22" fill="#ffcf7a" opacity="0.92"/><circle cx="395" cy="300" r="12" fill="#ffcf7a" opacity="0.75"/><circle cx="440" cy="372" r="16" fill="#ffcf7a" opacity="0.82"/><circle cx="500" cy="330" r="10" fill="#ffcf7a" opacity="0.72"/><circle cx="540" cy="395" r="19" fill="#ffcf7a" opacity="0.87"/><circle cx="230" cy="440" r="8" fill="#ffcf7a" opacity="0.68"/><circle cx="470" cy="450" r="9" fill="#ffcf7a" opacity="0.70"/><circle cx="360" cy="460" r="13" fill="#ffcf7a" opacity="0.77"/></g>
    <path d="M96 112h512v428H96zM352 112v428M96 326h512" fill="none" stroke="url(#cnFrame)" stroke-width="26"/>
    <path d="M84 100h536M84 100v452" fill="none" stroke="#a37a52" stroke-width="3" opacity=".7"/>
    <rect x="66" y="548" width="572" height="24" fill="#7a5636"/><rect x="66" y="570" width="572" height="10" fill="#1c1009" opacity=".7"/>
    <!-- plant on the sill -->
    <path d="M128 548l10-64h74l10 64z" fill="#a4562f"/><path d="M134 484h82v12h-82z" fill="#c26a3c"/>
    <g fill="#c8702a"><circle cx="150" cy="452" r="24"/><circle cx="188" cy="436" r="28"/><circle cx="214" cy="462" r="20"/><circle cx="170" cy="470" r="20"/></g>
    <g fill="#e39a45"><circle cx="160" cy="440" r="11"/><circle cx="196" cy="424" r="12"/><circle cx="208" cy="452" r="9"/><circle cx="178" cy="456" r="9"/></g>
    <!-- sign -->
    <g font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="700" font-size="124" text-anchor="middle">
      <text x="1262" y="300" fill="#ff8a3a" filter="url(#cnSoft)" opacity=".85">Café</text><text x="1268" y="308" fill="#1c0e06" opacity=".75">Café</text>
      <text x="1262" y="300" fill="#ffe9d2" stroke="#b8763c" stroke-width="3">Café</text></g>
    <!-- copper lamp -->
    <path d="M1392 0v52" stroke="#140c07" stroke-width="7"/><path d="M1310 132q8-86 82-86t82 86z" fill="url(#cnCopper)"/><ellipse cx="1392" cy="132" rx="82" ry="13" fill="#ffe3b0"/>
    <ellipse cx="1392" cy="150" rx="130" ry="46" fill="#ffb45e" filter="url(#cnSoft)" opacity=".8"/>
    <!-- lower wall, floor -->
    <rect y="596" width="1600" height="200" fill="#2b1a0f"/><rect y="596" width="1600" height="200" filter="url(#cnGrain)" opacity=".7"/>${planks(604, 192, 132, '#150c06')}
    <rect y="586" width="1600" height="18" fill="#5a3a22"/><rect y="586" width="1600" height="3" fill="#9a6e44" opacity=".8"/>
    <rect y="796" width="1600" height="104" fill="#6a3523"/>
    <path d="M0 796h1600M0 836h1600M-260 900 420 796M120 900 600 796M520 900 740 796M800 900V796M1080 900 860 796M1480 900 1000 796M1860 900 1180 796" stroke="#2c140c" stroke-width="4" fill="none"/>
    <ellipse cx="800" cy="850" rx="520" ry="46" fill="#ffb45e" filter="url(#cnSoft)" opacity=".22"/>
    <!-- counter with cup, pot, candle, books -->
    <rect x="1150" y="652" width="450" height="248" fill="#2f1c10"/><rect x="1150" y="652" width="450" height="248" filter="url(#cnGrain)" opacity=".6"/>
    <rect x="1126" y="630" width="474" height="26" fill="#7a5232"/><rect x="1126" y="630" width="474" height="4" fill="#b98a5a" opacity=".8"/>
    <path d="M1196 630v-44h58v44zM1254 598h16v20h-16" fill="#8d9298" stroke="#5b6066" stroke-width="3"/>
    <path d="M1316 630v-52q0-22 22-22t22 22v52zM1326 556h24l-6-22h-12zM1360 588q26 2 22 26" fill="url(#cnBrass)" stroke="#5a431a" stroke-width="2"/>
    <path d="M1432 630h44l-8-14h-28z" fill="url(#cnBrass)"/><rect x="1446" y="560" width="16" height="58" fill="#f3ead6"/>
    <circle cx="1454" cy="540" r="34" fill="#ffc46a" filter="url(#cnSoft)" opacity=".75"/><ellipse class="hb-flame" cx="1454" cy="544" rx="7" ry="15" fill="#ffe3a0"/>
    <path d="M1510 630v-16h84v16zM1516 614v-14h78v14zM1504 600v-12h90v12z" fill="#6b2a22" stroke="#2c110d" stroke-width="2"/>
    <!-- armchair in the foreground, out of focus -->
    <g filter="url(#cnDof)"><path d="M-60 900V690q0-96 118-96h150q104 0 104 104v202z" fill="#3b2216"/><path d="M-60 900V760q170-44 372 0v140z" fill="#51301d"/>
      <path d="M-20 640q120-44 232 4l-26 120q-104-34-196-2z" fill="#8c7b48"/><path d="M-10 668q110-34 206 2M-6 706q104-30 196 0" stroke="#5e5230" stroke-width="7" fill="none"/></g>
    <rect width="1600" height="900" fill="url(#cnLamp)"/><rect width="1600" height="900" fill="url(#cnVig)"/>` },
  'cafe-morning': { name: 'Café in the morning', art: () => `
    <defs><linearGradient id="cmS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc7ff"/><stop offset=".7" stop-color="#ffe2b0"/><stop offset="1" stop-color="#ffc98a"/></linearGradient></defs>
    <rect width="1600" height="900" fill="#e8dcc4"/>
    <rect x="110" y="120" width="470" height="400" fill="url(#cmS)"/><circle cx="250" cy="400" r="46" fill="#fff3c4"/>
    <path d="M110 520h470v-50h-70v-40h-60v30h-90v-70h-80v50h-90v40h-80z" fill="#b9c4cf"/>
    <path d="M110 120h470v400H110zM345 120v400M110 320h470" fill="none" stroke="#7a5a3c" stroke-width="16"/>
    <path d="M110 520 345 320l-40 580H-200zM345 320l235 200 700 380H500z" fill="#fff6d8" opacity=".28"/>
    <g font-family="Georgia, serif" font-style="italic" font-weight="700" font-size="92" text-anchor="middle"><text x="1270" y="250" fill="#5a3d2b">Café</text></g>
    <path d="M1120 300h300" stroke="#5a3d2b" stroke-width="5"/>
    <rect y="560" width="1600" height="210" fill="#c9b08a"/>${planks(560, 210, 80, '#b89d76')}<rect y="552" width="1600" height="12" fill="#8a6a48"/>
    <rect y="770" width="1600" height="130" fill="#b99973"/><path d="M0 770h1600M0 815h1600M-200 900 300 770M200 900 560 770M600 900 720 770M1000 900 880 770M1400 900 1040 770M1800 900 1300 770" stroke="#a48560" stroke-width="3" fill="none"/>
    <rect x="1180" y="610" width="420" height="290" fill="#7a5a3c"/><rect x="1160" y="596" width="440" height="20" fill="#a07a52"/>
    <path d="M1250 596v-34h44v34zM1250 570h-12v14h12M1340 596v-50h30v50zM1420 596v-26h60v26z" fill="#fff" opacity=".9"/>
    <path d="M60 770c-10-60 10-110 0-150M60 700c-30-20-50-50-52-84M60 680c26-22 44-52 44-88M60 640c-16-22-22-46-18-72" stroke="#3f8f5a" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M30 770h60l-8 70H38z" fill="#b5653f"/>` },
  gas: { name: 'Gas station', art: () => `
    <defs><linearGradient id="gsS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040816"/><stop offset="1" stop-color="#10224a"/></linearGradient>
      <linearGradient id="gsG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#gsS)"/>${stars(40)}
    <rect x="-20" y="110" width="1640" height="86" fill="#e9edf2"/><rect x="-20" y="170" width="1640" height="26" fill="#c4161c"/>
    <path d="M200 196h160l110 520H90zM760 196h160l110 520H650zM1320 196h160l110 520H1210z" fill="url(#gsG)"/>
    <ellipse cx="280" cy="198" rx="70" ry="9" fill="#fff"/><ellipse cx="840" cy="198" rx="70" ry="9" fill="#fff"/><ellipse cx="1400" cy="198" rx="70" ry="9" fill="#fff"/>
    <rect x="520" y="196" width="26" height="520" fill="#9aa3ad"/><rect x="1054" y="196" width="26" height="520" fill="#9aa3ad"/>
    <rect x="1140" y="330" width="460" height="386" fill="#1a2233"/><rect x="1170" y="370" width="400" height="250" fill="#ffd98a"/>
    <path d="M1170 430h400M1170 500h400M1170 560h400M1270 370v250M1370 370v250M1470 370v250" stroke="#b8862f" stroke-width="5"/><rect x="1140" y="330" width="460" height="34" fill="#c4161c"/>
    <text x="1370" y="355" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="24" fill="#fff" letter-spacing="6">LOJA</text>
    <g fill="#c9ccd1"><rect x="150" y="470" width="120" height="250" rx="12"/><rect x="330" y="470" width="120" height="250" rx="12"/></g>
    <g fill="#c4161c"><rect x="150" y="470" width="120" height="54" rx="12"/><rect x="330" y="470" width="120" height="54" rx="12"/></g>
    <g fill="#0c1018"><rect x="170" y="540" width="80" height="50"/><rect x="350" y="540" width="80" height="50"/></g>
    <path d="M270 600q40 10 30 80M450 600q40 10 30 80" stroke="#0c1018" stroke-width="8" fill="none"/>
    <rect x="40" y="250" width="16" height="470" fill="#9aa3ad"/><rect x="-10" y="240" width="130" height="190" rx="8" fill="#0c1018" stroke="#e9edf2" stroke-width="5"/>
    <g font-family="Consolas, monospace" font-weight="700" font-size="30" fill="#ff453a"><text x="6" y="290">1.789</text><text x="6" y="340">1.659</text><text x="6" y="390">0.989</text></g>
    <rect y="716" width="1600" height="184" fill="#0d1014"/><path d="M0 760h1600" stroke="#f2c230" stroke-width="5" stroke-dasharray="60 50" opacity=".5"/>
    <path d="M210 716h140l60 184H150zM770 716h140l60 184H710zM1330 716h140l60 184H1270z" fill="#fff" opacity=".05"/>` },
};
const SCENE_IDS = ['auto', ...Object.keys(SCENES), 'photo', 'none'];

function pack(host, saved, onChange) {
  const SIZE = 20, BURN = 45, PUFF = 14, PAPER = 112;     // BURN: seconds left alone; PUFF: seconds of holding
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  /* out: the cigarette taken from the pack = { lit, p, at }
     p = share burned up to `at`; at = when it last started burning (0 while it is not burning) */
  const MACHINES = ['classic', 'modern', 'retro'];
  const st = { count: SIZE, open: false, out: null, day: today(), smoked: 0, skin: 'portugues', hold: false, custom: '', machine: 'classic', scene: 'auto', room: '' };
  if (saved && typeof saved === 'object') {
    st.count = saved.count == null ? SIZE : clamp(Math.round(+saved.count) || 0, 0, SIZE);
    st.open = !!saved.open;
    st.hold = !!saved.hold;
    if (MACHINES.includes(saved.machine)) st.machine = saved.machine;
    if (SCENE_IDS.includes(saved.scene)) st.scene = saved.scene;
    st.room = typeof saved.room === 'string' && PICTURE.test(saved.room) ? saved.room : '';
    if (st.scene === 'photo' && !st.room) st.scene = 'auto';
    st.custom = typeof saved.custom === 'string' && PICTURE.test(saved.custom) ? saved.custom : '';
    st.skin = SKINS[saved.skin] || (saved.skin === 'custom' && st.custom) ? saved.skin : st.skin;
    if (saved.day === st.day) st.smoked = Math.max(0, Math.round(+saved.smoked) || 0);
    const o = saved.out;
    if (o && typeof o === 'object') {
      st.out = typeof o.lit === 'number' && o.lit > 1 ? { lit: true, p: 0, at: o.lit }       // older saves: lit = start time
             : { lit: !!o.lit, p: clamp(+o.p || 0, 0, 1), at: +o.at || 0 };
    }
  }
  const dur = () => (st.hold ? PUFF : BURN);
  const burned = () => (st.out ? clamp(st.out.p + (st.out.at ? (Date.now() - st.out.at) / 1000 / dur() : 0), 0, 1) : 0);
  if (st.out && st.out.at) {
    if (st.hold) st.out.at = 0;                      // nobody is holding it after a reload
    else if (burned() >= 1) st.out = null;           // it burned down while the page was closed
  }
  const keep = () => { try { onChange({ ...st, out: st.out && { ...st.out } }); } catch { /* host gone */ } };

  const root = el('div', 'pack-widget');
  const rig = el('div', 'pack-rig');
  const box = el('div', 'pack');
  const tips = el('div', 'pack-tips');
  for (let i = 0; i < SIZE; i++) tips.append(el('i', 'pack-tip row' + (i < 7 ? 0 : i < 13 ? 1 : 2)));
  const front = el('div', 'pack-front'), lid = el('div', 'pack-lid');
  box.append(el('div', 'pack-back'), tips, front, lid);
  const slot = el('div', 'pack-slot');
  const count = el('div', 'pack-count');
  rig.append(box, slot, count);
  root.append(rig);
  host.append(root);

  function dress() {
    const art = st.skin === 'custom' && st.custom
      ? `<image href="${st.custom}" width="120" height="190" preserveAspectRatio="xMidYMid slice"/>`
      : (SKINS[st.skin] || SKINS.portugues).art();
    const svg = box2 => `<svg viewBox="${box2}" preserveAspectRatio="none" aria-hidden="true">${art}</svg>`;
    lid.innerHTML = svg('0 0 120 54');
    front.innerHTML = svg('0 54 120 136');
    box.dataset.skin = st.skin;
  }

  /* ---- the cigarette ---- */
  let cig = null, paper = null, finishing = false;
  function sync() {
    if (!st.out) { if (cig && !finishing) { slot.replaceChildren(); cig = paper = null; } return; }
    if (!cig) {
      cig = el('div', 'cig'); paper = el('div', 'cig-burn');
      paper.append(el('i', 'cig-ember'), el('i', 'smoke'), el('i', 'smoke s2'), el('i', 'smoke s3'));
      cig.append(paper, el('div', 'cig-filter'));
      cig.addEventListener('pointerdown', e => {
        e.stopPropagation();                         // never drags the card
        if (!st.hold || e.button !== 0) return;
        try { cig.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        light();
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) cig.addEventListener(ev, () => { if (st.hold) pause(); });
      cig.addEventListener('click', () => { if (!st.hold) light(); });
      cig.addEventListener('dblclick', finish);
      paper.addEventListener('animationend', e => { if (e.target === paper && st.out && !finishing) { st.out = null; update(); keep(); } });
      slot.append(cig);
    }
    const o = st.out, d = dur();
    cig.classList.toggle('lit', o.lit);
    cig.classList.toggle('puff', !!o.at);
    cig.title = !o.lit ? (st.hold ? 'Hold to smoke' : 'Click to light') : st.hold ? 'Hold to smoke · double-click to finish' : 'Double-click to finish';
    if (o.lit) {
      paper.style.animation = `pack-burn ${d}s linear forwards`;
      paper.style.animationDelay = `${-burned() * d}s`;                 // pick up exactly where it is
      paper.style.animationPlayState = o.at ? 'running' : 'paused';
    } else paper.style.animation = 'none';
  }
  function firstLight() {
    if (st.out.lit) return;
    st.out.lit = true;
    if (st.day !== today()) { st.day = today(); st.smoked = 0; }
    st.smoked++;
  }
  function light() {
    if (!st.out || finishing || st.out.at) return;
    firstLight();
    st.out.at = Date.now();
    update(); keep();
  }
  function pause() {
    if (!st.out || !st.out.at || finishing) return;
    st.out.p = burned(); st.out.at = 0;
    update(); keep();
  }
  function finish() {                                 // burn the rest down quickly
    if (!st.out || finishing) return;
    firstLight();
    const p = burned();
    st.out = null; finishing = true;
    keep();
    cig.classList.add('lit', 'puff');
    paper.style.animation = 'none';
    paper.style.height = (1 - p) * PAPER + 'px';
    void paper.offsetHeight;
    paper.style.transition = 'height .9s ease-in';
    paper.style.height = '0px';
    setTimeout(() => { finishing = false; update(); }, 1000);
    update();
  }
  function takeOne() {
    if (!st.open || st.out || finishing || st.count < 1) return;
    st.count--; st.out = { lit: false, p: 0, at: 0 };
    update(); keep();
  }
  const flip = () => { st.open = !st.open; update(); keep(); };
  lid.addEventListener('click', flip);
  front.addEventListener('click', flip);
  tips.addEventListener('click', takeOne);

  function update() {
    box.classList.toggle('open', st.open);
    lid.title = front.title = st.open ? 'Close the pack' : 'Open the pack';
    tips.title = st.count ? 'Take one out' : 'Empty';
    [...tips.children].forEach((t, i) => { t.hidden = i >= st.count; });
    count.textContent = String(st.count);
    count.title = `${st.count} left in the pack · ${st.smoked} smoked today`;
    sync();
  }

  function pickPicture() {
    const input = el('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const bmp = await createImageBitmap(file);
        const cv = el('canvas');
        cv.width = 360; cv.height = 570;
        const k = Math.max(360 / bmp.width, 570 / bmp.height);          // cover the pack face
        cv.getContext('2d').drawImage(bmp, (360 - bmp.width * k) / 2, (570 - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
        st.custom = cv.toDataURL('image/jpeg', .85);
        st.skin = 'custom';
        dress(); keep();
      } catch { /* not a picture the browser can read */ }
    });
    input.click();
  }

  /* Choosing a pack: a café tobacco machine. Press a button and the pack drops into the tray. */
  function openMachine() {
    const { box, close: shut } = modal('vend', 'Choose a pack');
    box.dataset.look = st.machine;
    // the room the machine stands in, and a machine big enough to fill the screen
    const back = box.parentElement, room = el('div', 'vend-scene'), chips = el('div', 'vend-scenes');
    back.classList.add('vend-room');
    back.prepend(room);
    const size = () => { box.style.zoom = clamp(Math.min(innerHeight * .9 / 640, innerWidth * .5 / 430), .7, 3); };
    const close = () => { removeEventListener('resize', size); shut(); };
    addEventListener('resize', size);
    size();
    const paint = () => {
      const id = st.scene === 'auto' ? (new Date().getHours() >= 7 && new Date().getHours() < 19 ? 'cafe-morning' : 'cafe-night') : st.scene;
      back.dataset.scene = id;
      room.innerHTML = SCENES[id] ? `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${SCENES[id].art()}</svg>` : '';
      room.style.backgroundImage = id === 'photo' && st.room ? `url("${st.room}")` : '';
      [...chips.children].forEach(b => b.classList.toggle('on', b.dataset.scene === st.scene));
    };
    const chip = (id, text, fn) => {
      const b = el('button', 'vend-chip', text);
      b.type = 'button'; b.dataset.scene = id;
      b.addEventListener('click', fn || (() => { st.scene = id; paint(); keep(); }));
      chips.append(b);
    };
    chip('auto', 'By the clock');
    for (const [id, sc] of Object.entries(SCENES)) chip(id, sc.name);
    chip('photo', 'My own place…', () => {
      const input = el('input');
      input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', async () => {
        try {
          const bmp = await createImageBitmap(input.files[0]);
          const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), cv = el('canvas');
          cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
          cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
          st.room = cv.toDataURL('image/jpeg', .82); st.scene = 'photo';
          paint(); keep();
        } catch { /* not a readable picture */ }
      });
      input.click();
    });
    chip('none', 'No room');
    back.append(chips);
    paint();
    const led = el('div', 'vend-led', 'ESCOLHA O MAÇO');
    const other = el('button', 'vend-other', 'other machine');
    other.type = 'button'; other.title = 'Machines come in different shapes';
    other.addEventListener('click', () => { st.machine = MACHINES[(MACHINES.indexOf(st.machine) + 1) % MACHINES.length]; box.dataset.look = st.machine; keep(); });
    const top = el('div', 'vend-top'), win = el('div', 'vend-window'), tray = el('div', 'vend-tray');
    top.append(el('span', 'vend-brand', 'TABACO'), led, other);
    const thumb = art => `<svg viewBox="0 0 120 190" preserveAspectRatio="none" aria-hidden="true">${art}</svg>`;
    let busy = false;
    const slot = (id, name, art, price, n) => {
      const b = el('button', 'vend-slot' + (st.skin === id ? ' on' : ''));
      b.type = 'button'; b.title = name; b.dataset.skin = id;
      const face = el('span', 'vend-pack');
      if (art) face.innerHTML = thumb(art); else face.textContent = '+';
      b.append(el('span', 'vend-num', String(n)), face, el('span', 'vend-price', price), el('span', 'vend-key'));
      b.addEventListener('pointerenter', () => { if (!busy) led.textContent = name.toUpperCase(); });
      win.append(b);
      return b;
    };
    Object.entries(SKINS).forEach(([id, sk], i) => {
      slot(id, sk.name, sk.art(), (5 + (i * 7 % 9) / 10).toFixed(2), 11 + i).addEventListener('click', () => {
        if (busy) return;
        busy = true;
        led.textContent = sk.name.toUpperCase();
        const drop = el('div', 'vend-drop');
        drop.innerHTML = thumb(sk.art());
        tray.replaceChildren(drop);                  // the pack falls into the tray, then it is yours
        setTimeout(() => { st.skin = id; dress(); keep(); close(); }, 850);
      });
    });
    slot('custom', 'My own picture', st.custom ? `<image href="${st.custom}" width="120" height="190" preserveAspectRatio="xMidYMid slice"/>` : '', 'FOTO', 11 + Object.keys(SKINS).length)
      .addEventListener('click', () => { close(); pickPicture(); });
    const panel = el('div', 'vend-panel');
    panel.append(el('b', null, 'Tabaco'), el('small', null, 'É proibida a venda de produtos de tabaco a menores de 18 anos.'));
    const glass = el('div', 'vend-glass');           // the products sit behind glass, lit from above
    glass.append(win);
    box.append(top, glass, panel, tray, el('i', 'vend-coin'));
  }

  const fit = () => {                                // scale with the card
    const k = clamp(Math.min(root.clientWidth / 230, root.clientHeight / 245), .3, 4);
    rig.style.transform = `scale(${k})`;
  };
  const observer = new ResizeObserver(() => { if (root.isConnected) fit(); else observer.disconnect(); });
  observer.observe(root);
  dress();
  update();

  return {
    grab: e => !(e.target.closest && e.target.closest('.cig')),
    menu() {
      const o = st.out;
      const set = fn => () => { fn(); update(); keep(); };
      const items = [{ info: `${st.count} left in the pack · ${st.smoked} smoked today` }];
      if (o) {
        items.push(o.lit ? { label: 'Finish it', icon: 'check', action: finish } : { label: 'Light it', icon: 'play', action: light });
        items.push(o.lit ? { label: 'Stub it out', icon: 'x', action: set(() => { st.out = null; }) }
                         : { label: 'Put it back', icon: 'arrow', action: set(() => { st.out = null; st.count = Math.min(SIZE, st.count + 1); }) });
      } else if (st.count) items.push({ label: 'Take one out', icon: 'plus', action() { st.open = true; takeOne(); } });
      items.push(
        { label: st.open ? 'Close the pack' : 'Open the pack', icon: 'copy', action: flip },
        { sep: true },
        { label: 'One more in the pack', icon: 'plus', action: set(() => { st.count = Math.min(SIZE, st.count + 1); }) },
        { label: 'One fewer in the pack', icon: 'minus', action: set(() => { st.count = Math.max(0, st.count - 1); }) },
        { label: 'New pack of 20', icon: 'reload', action: set(() => { st.count = SIZE; st.open = false; st.out = null; }) },
        { sep: true },
        {
          label: 'Burn only while I hold it', checked: st.hold,
          action: set(() => { const p = burned(); st.hold = !st.hold; if (st.out) { st.out.p = p; st.out.at = !st.hold && st.out.lit ? Date.now() : 0; } }),
        },
        { label: 'Change pack', icon: 'layers', action: openMachine });
      return items;
    },
  };
}

window.HomeboardWidgets = {
  pool: { label: '8-ball pool', menu: 'Pool table', w: 760, h: 408, ratio: 1080 / 580, bare: true, create: pool },
  pack: { label: 'Cigarette pack', menu: 'Cigarette pack', w: 207, h: 220, ratio: 230 / 245, bare: true, create: pack },
};

})();
