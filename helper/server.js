/* Homeboard helper.
 *
 * A web page is not allowed to move files, start programs or run a console, so this small
 * program does those things for the board. It only listens on this computer (127.0.0.1) and
 * only answers:
 *   - a browser-extension page (never an ordinary website),
 *   - that knows the secret key in helper/token.txt (only Homeboard's own pages can read it),
 *   - and, after the first time, only the same extension that paired with it.
 *
 *   node helper/server.js          start it (tools/start-helper.ps1 starts it without a window)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = +process.env.HB_HELPER_PORT || 8767, HOST = '127.0.0.1';   // another port only for tests
const here = __dirname, root = path.resolve(here, '..');
const tokenFile = path.join(here, 'token.txt'), originFile = path.join(here, 'paired-with.txt');
const backups = path.join(root, 'backups');

let token = '';
try { token = fs.readFileSync(tokenFile, 'utf8').trim(); } catch { /* first run */ }
if (!/^[0-9a-f]{64}$/.test(token)) { token = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(tokenFile, token); }
let paired = '';
try { paired = fs.readFileSync(originFile, 'utf8').trim(); } catch { /* not paired yet */ }

/* ---------- who may talk to us ---------- */
function check(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return 'wrong host';          // stops DNS-rebinding tricks
  const origin = String(req.headers.origin || '');
  if (!/^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin)) return 'only the Homeboard extension may call the helper';
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (given.length !== token.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token))) return 'wrong key';
  if (!paired) { paired = origin; try { fs.writeFileSync(originFile, origin); } catch { /* keep going unpaired */ } }
  if (origin !== paired) return 'this helper is paired with another copy of Homeboard (delete helper/paired-with.txt to pair again)';
  return '';
}

/* ---------- files ---------- */
const DRIVE = /^[a-zA-Z]:\\/, UNC = /^\\\\[^\\]+\\[^\\]+/;
function clean(p) {
  if (typeof p !== 'string' || !p || p.includes('\0')) throw new Error('not a path');
  const full = path.resolve(p.replace(/\//g, '\\'));
  if (!DRIVE.test(full) && !UNC.test(full)) throw new Error('not a full path: ' + p);
  return full;
}
/* Things that must never be moved or deleted from a board: drive roots, Windows itself, a whole user profile. */
function precious(p) {
  const low = p.toLowerCase().replace(/\\+$/, '');
  const guarded = [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData, os.homedir(), path.dirname(os.homedir())]
    .filter(Boolean).map(x => x.toLowerCase().replace(/\\+$/, ''));
  return /^[a-z]:$/.test(low) || /^\\\\[^\\]+\\[^\\]+$/.test(low) || guarded.includes(low) || guarded.slice(0, 4).some(g => low.startsWith(g + '\\'));
}
const TEXT_EXT = /.(txt|md|markdown|json|js|mjs|cjs|ts|tsx|jsx|css|scss|less|html?|xml|csv|tsv|log|ini|cfg|conf|ya?ml|toml|ps1|bat|cmd|sh|py|rb|java|c|h|cpp|cs|go|rs|php|sql|svg|env|gitignore)$/i;
const exists = p => fsp.access(p).then(() => true, () => false);
async function freeName(dir, name) {                 // "report.pdf" -> "report (2).pdf" when taken
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  for (let i = 1; i < 500; i++) {
    const candidate = path.join(dir, i === 1 ? name : `${stem} (${i})${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('too many files with that name');
}
async function transfer(from, to, move) {
  const dir = clean(to), done = [];
  if (!(await fsp.stat(dir)).isDirectory()) throw new Error('the destination is not a folder');
  for (const item of [].concat(from)) {
    const src = clean(item);
    if (move && precious(src)) throw new Error('that folder is protected: ' + src);
    if ((dir + '\\').toLowerCase().startsWith((src + '\\').toLowerCase())) throw new Error('a folder cannot go inside itself');
    if (move && path.dirname(src).toLowerCase() === dir.toLowerCase()) { done.push(src); continue; }       // already there
    const dest = await freeName(dir, path.basename(src));
    if (move) {
      try { await fsp.rename(src, dest); }
      catch (e) { if (e.code !== 'EXDEV') throw e; await fsp.cp(src, dest, { recursive: true, errorOnExist: true, force: false }); await fsp.rm(src, { recursive: true, force: true }); }
    } else await fsp.cp(src, dest, { recursive: true, errorOnExist: true, force: false });
    done.push(dest);
  }
  return { done };
}
function run(file, args, env) {                       // run a program to the end, quietly
  return new Promise((res, rej) => {
    const p = spawn(file, args, { windowsHide: true, env: { ...process.env, ...env } });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', rej);
    p.on('exit', code => (code ? rej(new Error(err.trim().split('\n')[0] || `${file} failed`)) : res()));
  });
}
const RECYCLE = `Add-Type -AssemblyName Microsoft.VisualBasic
foreach ($p in @($env:HB_PATHS | ConvertFrom-Json)) {
  if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }
  elseif (Test-Path -LiteralPath $p) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }
}`;

/* ---------- console sessions: a real pseudo-console (helper/conpty.ps1), drawn on the board by xterm.js ----------
   A console card keeps one session whichever tab shows it; a tab that opens later gets the recent output replayed.
   Sessions keep running while no board looks at them (a long job or Claude Code may be working), up to 8 hours. */
const terms = new Map();
const SHELLS = new Set(['powershell', 'pwsh', 'cmd']);
function cleanEnv() {                                  // a console of yours, not of whatever started the helper
  const env = { ...process.env, COLORTERM: 'truecolor', TERM_PROGRAM: 'Homeboard' };
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'ELECTRON_RUN_AS_NODE') delete env[k];
  return env;
}
function startTerm(o) {
  const key = typeof o.key === 'string' ? o.key.slice(0, 80) : '';
  if (key) for (const t of terms.values()) if (t.key === key) { resizeTerm(t, o.cols, o.rows); return { id: t.id, joined: true }; }
  if (terms.size >= 12) throw new Error('Too many consoles are running. Close some console cards (the ✕ ends a console), or restart the helper.');
  let dir = os.homedir();
  try { const c = clean(o.cwd); if (fs.statSync(c).isDirectory()) dir = c; } catch { /* the home folder */ }
  const shell = SHELLS.has(o.shell) ? o.shell : 'powershell';
  const cols = Math.max(20, Math.min(400, +o.cols || 100)), rows = Math.max(5, Math.min(200, +o.rows || 30));
  const id = crypto.randomBytes(8).toString('hex');
  const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'conpty.ps1'),
    '-Shell', shell, '-Cwd', dir, '-Cols', String(cols), '-Rows', String(rows)], { cwd: dir, windowsHide: true, env: cleanEnv() });
  const t = { id, key, proc, log: [], logSize: 0, readers: new Set(), idle: Date.now(), cols, rows };
  const emit = msg => {
    const line = JSON.stringify(msg) + '\n';
    if (msg.b) { t.log.push(line); t.logSize += line.length; while (t.logSize > 600000 && t.log.length > 1) t.logSize -= t.log.shift().length; }
    else t.log.push(line);
    for (const res of t.readers) res.write(line);
  };
  proc.stdout.on('data', chunk => emit({ b: chunk.toString('base64') }));
  let err = '';
  proc.stderr.on('data', d => { err += d; });
  proc.on('exit', code => { if (code && err.trim() && !t.log.length) emit({ b: Buffer.from('\r\n' + err.trim().split('\n')[0] + '\r\n').toString('base64') }); emit({ x: code }); for (const res of t.readers) res.end(); terms.delete(id); });
  proc.on('error', () => { emit({ b: Buffer.from('The console could not be started.\r\n').toString('base64') }); });
  terms.set(id, t);
  return { id };
}
function frame(t, kind, payload) {
  const head = Buffer.alloc(5);
  head[0] = kind.charCodeAt(0);
  head.writeInt32LE(payload.length, 1);
  try { t.proc.stdin.write(Buffer.concat([head, payload])); } catch { /* ended */ }
}
function resizeTerm(t, cols, rows) {
  cols = Math.max(20, Math.min(400, +cols || 0)); rows = Math.max(5, Math.min(200, +rows || 0));
  if (!+cols || !+rows || (cols === t.cols && rows === t.rows)) return;
  t.cols = cols; t.rows = rows;
  const b = Buffer.alloc(4); b.writeInt16LE(cols, 0); b.writeInt16LE(rows, 2);
  frame(t, 'r', b);
}
function stopTerm(t) { try { spawn('taskkill', ['/PID', String(t.proc.pid), '/T', '/F'], { windowsHide: true }); } catch { /* already gone */ } }
setInterval(() => {                                   // a console nobody has looked at for 8 hours is closed
  for (const t of terms.values()) { if (t.readers.size) t.idle = Date.now(); else if (Date.now() - t.idle > 8 * 3600e3) stopTerm(t); }
}, 60000).unref();

/* ---------- apps and windows (helper/winbridge.ps1, one PowerShell kept running) ---------- */
let bridge = null;
function bridgeAsk(req, ms = 20000) {
  if (!bridge) {
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'winbridge.ps1')], { windowsHide: true });
    const b = bridge = { proc, buf: '', queue: [], ready: false, used: Date.now() };
    proc.stdout.on('data', d => {
      b.buf += d.toString('utf8');
      let i;
      while ((i = b.buf.indexOf('\n')) >= 0) {
        const line = b.buf.slice(0, i).trim(); b.buf = b.buf.slice(i + 1);
        const m = /^<<HBR:(.*)>>$/.exec(line);
        if (!m) continue;
        let msg; try { msg = JSON.parse(m[1]); } catch { msg = { error: 'unreadable answer' }; }
        if (msg.ready) { b.ready = true; continue; }
        const w = b.queue.shift();
        if (w) { clearTimeout(w.timer); msg.error ? w.rej(new Error(msg.error)) : w.res(msg); }
      }
    });
    proc.stderr.on('data', () => { /* PowerShell's own noise; answers come on stdout */ });
    const gone = () => { if (bridge === b) bridge = null; for (const w of b.queue.splice(0)) { clearTimeout(w.timer); w.rej(new Error('the window helper stopped')); } };
    proc.on('exit', gone);
    proc.on('error', gone);
  }
  const b = bridge;
  b.used = Date.now();
  return new Promise((res, rej) => {
    const w = { res, rej, timer: setTimeout(() => { rej(new Error('Windows took too long to answer')); try { b.proc.kill(); } catch { /* gone */ } }, ms) };
    b.queue.push(w);
    // one line of plain ASCII: anything else is written as \u escapes so the console encoding cannot spoil it
    b.proc.stdin.write(JSON.stringify(req).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
  });
}
setInterval(() => { if (bridge && !bridge.queue.length && Date.now() - bridge.used > 600000) { try { bridge.proc.kill(); } catch { /* gone */ } bridge = null; } }, 60000).unref();

let startApps = null;                                  // { at, list }
async function appList(fresh) {
  if (!fresh && startApps && Date.now() - startApps.at < 300000) return startApps.list;
  const { apps } = await bridgeAsk({ op: 'apps' }, 30000);
  startApps = { at: Date.now(), list: apps.filter(a => a && a.id && a.name) };
  return startApps.list;
}
/* App icons: in memory, and on disk (TEMPhomeboard-icons) so a restart of the helper does not start Windows'
   icon reading again for icons it already has. A missing icon is remembered too (as an empty file). */
const icons = new Map();
const iconDir = path.join(os.tmpdir(), 'homeboard-icons');
const iconFile = key => path.join(iconDir, require('crypto').createHash('sha1').update(key).digest('hex') + '.png');
async function iconsFor(targets, size) {
  const want = [...new Set(targets)].filter(t => typeof t === 'string' && t && t.length < 600).slice(0, 60);
  for (const t of want) {
    const key = size + '|' + t;
    if (icons.has(key)) continue;
    try { icons.set(key, (await fsp.readFile(iconFile(key))).toString('base64')); } catch { /* not on disk yet */ }
  }
  const missing = want.filter(t => !icons.has(size + '|' + t));
  if (missing.length) {
    const { icons: got } = await bridgeAsk({ op: 'icons', targets: missing, size }, 30000);
    await fsp.mkdir(iconDir, { recursive: true }).catch(() => {});
    for (const t of missing) {
      const key = size + '|' + t, b64 = (got && got[t]) || '';
      icons.set(key, b64);
      fsp.writeFile(iconFile(key), Buffer.from(b64, 'base64')).catch(() => {});
    }
    if (icons.size > 2000) icons.clear();
  }
  return Object.fromEntries(want.map(t => [t, icons.get(size + '|' + t) ? 'data:image/png;base64,' + icons.get(size + '|' + t) : '']));
}
/* What may be started: a Start-menu app, or a program, file or folder that exists. */
async function launchable(item) {
  if (item.appId) {
    const id = String(item.appId);
    if (!(await appList()).some(a => a.id === id) && !(await appList(true)).some(a => a.id === id)) throw new Error('that app is not in the Start menu any more');
    return { appId: id };
  }
  const p = clean(item.path);
  if (!(await exists(p))) throw new Error('that does not exist any more: ' + p);
  const args = typeof item.args === 'string' ? item.args.slice(0, 2000) : '';
  return { path: p, args };
}
const base = p => String(p || '').split('\\').pop().toLowerCase();
/* Which window belongs to an item. strict: only sure signs (its program file, its folder). */
function belongs(w, item, strict) {
  if (item.kind === 'folder' || (item.path && !path.extname(item.path))) return !!w.folder && w.folder.toLowerCase().replace(/\\+$/, '') === String(item.path).toLowerCase().replace(/\\+$/, '');
  if (w.folder) return false;
  const exe = base(w.exe);
  if (item.exe && exe === base(item.exe)) return true;
  if (item.path && /\.exe$/i.test(item.path) && exe === base(item.path)) return true;
  if (item.appId) {
    const id = String(item.appId);
    if (/\.exe$/i.test(id) && exe === base(id)) return true;
    const fam = /^([^_!\\]+)_[a-z0-9]+!/i.exec(id);       // packaged app: Name_publisher!App lives in ...\WindowsApps\Name_...
    if (fam && String(w.exe).toLowerCase().includes('\\windowsapps\\' + fam[1].toLowerCase() + '_')) return true;
  }
  if (strict) return false;
  return !!item.name && String(w.title).toLowerCase().includes(String(item.name).toLowerCase());
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let screenCache = null;                               // { at, list }: screens change rarely; asked again after 30 s
async function screens() {
  if (screenCache && Date.now() - screenCache.at < 30000) return screenCache.list;
  const list = (await bridgeAsk({ op: 'screens' })).screens;
  screenCache = { at: Date.now(), list };
  return list;
}
function zoneRect(scr, item) {                         // a zone is a part of a screen's work area, in fractions
  const s = scr[Math.min(scr.length - 1, Math.max(0, +item.screen || 0))] || scr[0];
  const z = item.zone || { x: 0, y: 0, w: 1, h: 1 }, f = v => Math.min(1, Math.max(0, +v || 0));
  const x = Math.round(s.wx + f(z.x) * s.ww), y = Math.round(s.wy + f(z.y) * s.wh);
  return { x, y, w: Math.max(200, Math.round(s.wx + f(z.x + z.w) * s.ww) - x), h: Math.max(150, Math.round(s.wy + f(z.y + z.h) * s.wh) - y) };
}
async function place(hwnd, r, front) { return (await bridgeAsk({ op: 'place', hwnd, ...r, front: !!front })).ok; }
/* Start an item (or find it already open) and put its window in its zone. */
async function openInZone(item, scr, reuse) {
  const r = zoneRect(scr, item);
  const before = (await bridgeAsk({ op: 'windows' })).windows;
  if (reuse !== false) {
    const open = before.find(w => belongs(w, item, true));
    if (open) return { hwnd: open.hwnd, exe: open.exe, reused: true, placed: await place(open.hwnd, r, true) };
  }
  const known = new Set(before.map(w => w.hwnd));
  await bridgeAsk({ op: 'launch', ...(await launchable(item)) });
  let found = null, at = 0;
  const start = Date.now();
  while (Date.now() - start < 25000) {
    await sleep(found ? 500 : 350);
    const now = (await bridgeAsk({ op: 'windows' })).windows, waited = Date.now() - start;
    const fresh = now.filter(w => !known.has(w.hwnd));
    let w = fresh.find(x => belongs(x, item, false));
    if (!w && !found && waited > 4000) w = now.find(x => belongs(x, item, false));   // an app that was already open brings that window forward
    if (!w && !found && waited > 6000 && fresh.length === 1) w = fresh[0];          // nothing recognisable: the one new window
    if (w && (!found || w.hwnd !== found.hwnd)) { found = w; at = Date.now(); await place(w.hwnd, r, true); known.add(w.hwnd); }
    if (found && Date.now() - at > 3000) break;          // a splash screen may hand over to the real window: keep watching a little
  }
  if (found) await place(found.hwnd, r, true);           // again: some apps move themselves while starting
  return found ? { hwnd: found.hwnd, exe: found.exe, placed: true } : { placed: false };
}

/* ---------- requests ---------- */
const routes = {
  '/ping': async () => ({ ok: true, version: 3, apps: true, pty: true, home: os.homedir(), backups }),
  '/fs/copy': async b => transfer(b.from, b.to, false),
  '/fs/move': async b => transfer(b.from, b.to, true),
  '/fs/rename': async b => {
    const src = clean(b.path), name = String(b.name || '').trim();
    if (!name || /[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') throw new Error('that name is not allowed');
    if (precious(src)) throw new Error('that folder is protected');
    const dest = path.join(path.dirname(src), name);
    if (dest.toLowerCase() !== src.toLowerCase() && await exists(dest)) throw new Error('there is already something with that name');
    await fsp.rename(src, dest);
    return { done: [dest] };
  },
  /* Text files, for editing: read with what is needed to write them back the same way (line endings, BOM),
     and refuse to write if the file changed since it was read, unless asked to. Only existing text files. */
  '/fs/read': async b => {
    const p = clean(b.path), st = await fsp.stat(p);
    if (!st.isFile()) throw new Error('that is not a file');
    if (st.size > 5e6) throw new Error('that file is too big to edit here');
    let buf = await fsp.readFile(p);
    const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    if (bom) buf = buf.subarray(3);
    const text = buf.toString('utf8');
    return { text: text.replace(/\r\n/g, '\n'), mtime: st.mtimeMs, eol: /\r\n/.test(text) ? '\r\n' : '\n', bom };
  },
  '/fs/write': async b => {
    const p = clean(b.path);
    if (precious(p)) throw new Error('that place is protected');
    if (!TEXT_EXT.test(p)) throw new Error('only text files can be saved from Homeboard');
    if (typeof b.text !== 'string' || b.text.length > 5e6) throw new Error('nothing to save');
    const st = await fsp.stat(p);
    if (!st.isFile()) throw new Error('that is not a file');
    if (b.mtime != null && Math.abs(st.mtimeMs - +b.mtime) > 1) throw Object.assign(new Error('the file changed since it was opened'), { code: 'changed' });
    const body = (b.bom ? '﻿' : '') + (b.eol === '\r\n' ? b.text.replace(/\r?\n/g, '\r\n') : b.text);
    const tmp = p + '.homeboard-saving';
    await fsp.writeFile(tmp, body, 'utf8');
    await fsp.rename(tmp, p);                         // whole file at once: never half-written
    return { mtime: (await fsp.stat(p)).mtimeMs };
  },
  '/fs/mkdir': async b => { const dest = await freeName(clean(b.dir), 'New folder'); await fsp.mkdir(dest); return { done: [dest] }; },
  '/fs/trash': async b => {
    const list = [].concat(b.paths).map(clean);
    const bad = list.find(precious);
    if (bad) throw new Error('that folder is protected: ' + bad);
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', RECYCLE], { HB_PATHS: JSON.stringify(list) });
    return { done: list };
  },
  '/open': async b => {                               // with whatever Windows normally uses for it (File Explorer for folders)
    const p = clean(b.path);
    if (!(await exists(p))) throw new Error('that does not exist any more');
    spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  },
  '/backup': async b => {
    if (typeof b.data !== 'string' || !b.data.startsWith('{')) throw new Error('nothing to back up');
    await fsp.mkdir(backups, { recursive: true });
    const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const tag = /^before-\d+\.\d+\.\d+$/.test(String(b.tag || '')) ? b.tag : '';   // a copy taken just before an update
    const file = path.join(backups, `homeboard-${tag || stamp}.json`);
    await fsp.writeFile(file, b.data);
    const all = await fsp.readdir(backups);
    const old = [...all.filter(n => /^homeboard-\d{4}-\d\d-\d\d\.json$/.test(n)).sort().slice(0, -14)];   // two weeks of daily copies
    const updates = await Promise.all(all.filter(n => /^homeboard-before-/.test(n)).map(async n => [n, (await fsp.stat(path.join(backups, n))).mtimeMs]));
    old.push(...updates.sort((x, y) => x[1] - y[1]).slice(0, -5).map(x => x[0]));                        // and the last five updates
    for (const n of old) await fsp.rm(path.join(backups, n), { force: true });
    return { file };
  },
  '/term/start': async b => startTerm(b),
  '/term/write': async b => {                         // keys and pasted text, as the terminal sends them
    const t = terms.get(b.id);
    if (!t) throw new Error('that console has ended');
    const data = Buffer.from(String(b.data ?? ''), 'utf8');
    if (data.length > 4e6) throw new Error('too much at once');
    frame(t, 'd', data);
    return { ok: true };
  },
  '/term/resize': async b => { const t = terms.get(b.id); if (t) resizeTerm(t, b.cols, b.rows); return { ok: true }; },
  '/term/stop': async b => {                          // by session, or by the card it belongs to
    const t = terms.get(b.id) || (typeof b.key === 'string' && b.key ? [...terms.values()].find(x => x.key === b.key) : null);
    if (t) stopTerm(t);
    return { ok: true };
  },
  '/apps/list': async b => ({ apps: await appList(!!b.fresh) }),
  '/apps/icons': async b => ({ icons: await iconsFor([].concat(b.targets || []), Math.min(256, Math.max(16, +b.size || 48))) }),
  '/apps/launch': async b => { await bridgeAsk({ op: 'launch', ...(await launchable(b)) }); return { ok: true }; },
  '/win/screens': async () => ({ screens: await screens() }),
  '/win/list': async () => ({ windows: (await bridgeAsk({ op: 'windows' })).windows }),
  '/win/front': async b => ({ ok: (await bridgeAsk({ op: 'front', hwnd: +b.hwnd })).ok }),
  /* A workspace: each item opened (or found open) and put in its zone, one after another so windows are not mixed up. */
  '/win/open': async b => {
    const scr = await screens(), results = [];
    for (const item of [].concat(b.items || []).slice(0, 20)) {
      try { results.push({ id: item.id, ...(await openInZone(item, scr, b.reuse)) }); }
      catch (e) { results.push({ id: item.id, error: String(e.message || e) }); }
    }
    return { results };
  },
};

const server = http.createServer((req, res) => {
  const origin = String(req.headers.origin || '');
  const cors = /^(chrome|moz)-extension:\/\//i.test(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST', Vary: 'Origin' } : {};
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors }); res.end(JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const refused = check(req);
  if (refused) { send(403, { error: refused }); return; }
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/term/stream') {       // the console's output, as it happens
    req.resume();                                                         // (POST, because browsers only name the caller on POST)
    const t = terms.get(url.searchParams.get('id'));
    if (!t) { send(404, { error: 'that console has ended' }); return; }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', ...cors });
    res.flushHeaders();
    for (const line of t.log) res.write(line);                           // what it showed lately, for a tab that opens it now
    t.readers.add(res);
    res.on('close', () => { t.readers.delete(res); t.idle = Date.now(); });   // the board stopped listening
    return;
  }
  const route = req.method === 'POST' && routes[url.pathname];
  if (!route) { send(404, { error: 'unknown request' }); return; }
  const parts = [];
  let size = 0;
  req.on('data', c => { size += c.length; if (size > 400e6) { send(413, { error: 'too large' }); req.destroy(); } else parts.push(c); });
  req.on('end', async () => {
    try {
      const body = parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {};
      send(200, await route(body || {}));
    } catch (e) { send(e && e.code === 'changed' ? 409 : 400, { error: String(e && e.message || e).replace(/^E[A-Z]+: /, ''), code: e && e.code === 'changed' ? 'changed' : undefined }); }
  });
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'The Homeboard helper is already running.' : e.message); process.exit(e.code === 'EADDRINUSE' ? 0 : 1); });
server.listen(PORT, HOST, () => console.log(`Homeboard helper listening on http://${HOST}:${PORT} (this computer only)`));
for (const sig of ['SIGINT', 'SIGTERM', 'exit']) process.on(sig, () => { for (const t of terms.values()) stopTerm(t); if (bridge) try { bridge.proc.kill(); } catch { /* gone */ } if (sig !== 'exit') process.exit(0); });
