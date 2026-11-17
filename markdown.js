/* Markdown for Homeboard notes: a small, safe renderer (everything is escaped; only known tags are
   produced and only web/mail links and images are allowed), HTML -> Markdown for older notes,
   and a tiny zip writer for exporting many .md files at once. No outside code, works offline. */
(() => {
'use strict';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* The address of the file being shown, so "images/x.png" or "../notes.md" can be found; null for board notes. */
let base = null;
const safeUrl = (u, image) => {
  const raw = u.trim().replace(/^<(.*)>$/, '$1').replace(/&amp;/g, '&');
  if (image && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(raw)) return esc(raw);
  let url;
  try { url = base ? new URL(raw, base) : new URL(raw); } catch { return null; }
  const fromFile = base && base.startsWith('file:');
  if (/^(https?|mailto):$/i.test(url.protocol) || (url.protocol === 'file:' && fromFile)) return esc(url.href);
  if (!image && url.protocol === 'homeboard:' && /^homeboard:board\/[\w-]+(\/(view|card)\/[\w-]+)?\/?$/.test(raw)) return esc(raw);   // a board, view or card of Homeboard
  return null;
};
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

/* ---------- inline: code, images, links, bold, italic, strike, highlight ---------- */
function inline(text) {
  const keep = [];
  const stash = html => `\u0000${keep.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`\n]+)`/g, (m, c) => stash(`<code>${esc(c)}</code>`));
  const target = u => (/^(file|homeboard):/i.test(u) ? '' : ' target="_blank" rel="noopener noreferrer"');
  // Obsidian: ![[picture.png]] embeds, [[Other note]] links (to "Other note.md" beside this file)
  s = s.replace(/!\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g, (m, name) => {
    const u = base && safeUrl(encodeURI(name.trim()), true);
    return u && IMAGE.test(name.trim()) ? stash(`<img src="${u}" alt="${esc(name.trim())}">`) : stash(`<span class="wikilink">${esc(name.trim())}</span>`);
  });
  s = s.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (m, name, alias) => {
    const label = esc((alias || name).trim()), file = name.trim().replace(/#.*$/, '');
    const u = base && file && safeUrl(encodeURI(/\.[a-z0-9]{1,6}$/i.test(file) ? file : file + '.md'));
    return stash(u ? `<a class="wikilink" href="${u}"${target(u)}>${label}</a>` : `<span class="wikilink">${label}</span>`);
  });
  const LINK = '(<[^>\\n]+>|[^)\\s]+)(?:\\s+"[^"\\n]*")?';
  s = s.replace(new RegExp(`!\\[([^\\]\\n]*)\\]\\(${LINK}\\)`, 'g'), (m, alt, url) => { const u = safeUrl(url, true); return u ? stash(`<img src="${u}" alt="${esc(alt)}">`) : m; });
  // forgiving: picture paths with plain spaces, as many exports write them
  s = s.replace(/!\[([^\]\n]*)\]\(([^)\n<>]+?\.(?:png|jpe?g|gif|webp|avif|bmp|svg))\)/gi, (m, alt, url) => { const u = safeUrl(url, true); return u ? stash(`<img src="${u}" alt="${esc(alt)}">`) : m; });
  s = s.replace(new RegExp(`\\[([^\\]\\n]+)\\]\\(${LINK}\\)`, 'g'), (m, t, url) => { const u = safeUrl(url); return u ? stash(`<a href="${u}"${target(u)}>${emphasis(esc(t))}</a>`) : m; });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g, (m, pre, url) => pre + stash(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`));
  s = emphasis(esc(s));
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
}
function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w])__(?=\S)([^_]+?)__(?=[^\w]|$)/g, '$1<strong>$2</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^\w])_(?=\S)([^_]+?)_(?=[^\w]|$)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([^~]+?)~~/g, '<del>$1</del>').replace(/==(?=\S)([^=]+?)==/g, '<mark>$1</mark>');
}

/* ---------- blocks ---------- */
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^ {0,3}([-*_])( *\1){2,} *$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const indentOf = s => s.match(/^\s*/)[0].replace(/\t/g, '    ').length;
const cells = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

/* lines: [{ t: text, n: line number in the note }] — the numbers let a click on a checkbox find its line */
function blocks(lines) {
  const out = [];
  let i = 0;
  const startsBlock = t => /^#{1,6}\s/.test(t) || FENCE.test(t) || RULE.test(t) || /^\s*>/.test(t) || LIST.test(t);
  while (i < lines.length) {
    const { t } = lines[i];
    if (!t.trim()) { i++; continue; }
    if (FENCE.test(t)) {
      const mark = t.trim().slice(0, 3), code = [];
      for (i++; i < lines.length && !lines[i].t.trim().startsWith(mark); i++) code.push(lines[i].t);
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    let m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(t);
    if (m) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (RULE.test(t)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(t)) {
      const inner = [];
      for (; i < lines.length && /^\s*>/.test(lines[i].t); i++) inner.push({ t: lines[i].t.replace(/^\s*>\s?/, ''), n: lines[i].n });
      out.push(`<blockquote>${blocks(inner)}</blockquote>`);
      continue;
    }
    if (t.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1].t)) {
      const head = cells(t), align = cells(lines[i + 1].t).map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${tag}>`;
      let html = `<table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>`;
      for (i += 2; i < lines.length && lines[i].t.includes('|') && lines[i].t.trim(); i++) html += `<tr>${cells(lines[i].t).map((c, k) => td('td', c, k)).join('')}</tr>`;
      out.push(html + '</tbody></table>');
      continue;
    }
    if (LIST.test(t)) { const r = list(lines, i); out.push(r.html); i = r.next; continue; }
    const para = [];
    for (; i < lines.length && lines[i].t.trim() && !(para.length && startsBlock(lines[i].t)); i++) para.push(inline(lines[i].t.trim()));
    out.push(`<p>${para.join('<br>')}</p>`);
  }
  return out.join('');
}
function list(lines, i) {
  const first = LIST.exec(lines[i].t), base = indentOf(lines[i].t), ordered = /\d/.test(first[2]);
  let html = ordered ? `<ol${+first[2].replace(/\D/g, '') !== 1 ? ` start="${+first[2].replace(/\D/g, '')}"` : ''}>` : '<ul>';
  while (i < lines.length) {
    const m = LIST.exec(lines[i].t);
    if (!m || indentOf(lines[i].t) !== base || /\d/.test(m[2]) !== ordered) break;
    const n = lines[i].n, kids = [];
    let text = m[3], box = '';
    const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
    if (task) { box = `<input type="checkbox" data-line="${n}"${task[1] !== ' ' ? ' checked' : ''}> `; text = task[2]; }
    for (i++; i < lines.length; i++) {                 // everything indented under the item belongs to it
      const l = lines[i];
      if (!l.t.trim()) { if (i + 1 < lines.length && indentOf(lines[i + 1].t) > base && lines[i + 1].t.trim()) { kids.push(l); continue; } break; }
      if (indentOf(l.t) <= base) break;
      kids.push({ t: l.t.replace(new RegExp(`^\\s{0,${base + 2}}`), ''), n: l.n });
    }
    html += `<li${task ? ' class="task"' : ''}>${box}${inline(text)}${kids.length ? blocks(kids) : ''}</li>`;
  }
  return { html: html + (ordered ? '</ol>' : '</ul>'), next: i };
}
function render(src, opts) {
  base = (opts && opts.base) || null;
  try { return blocks(String(src || '').replace(/\r/g, '').split('\n').map((t, n) => ({ t, n }))); }
  finally { base = null; }
}

/* tick a "- [ ]" box in the source */
function toggleTask(src, line) {
  const rows = String(src).split('\n');
  if (rows[line] != null) rows[line] = rows[line].replace(/^(\s*(?:[-*+]|\d{1,9}[.)])\s+)\[([ xX])\]/, (m, pre, v) => `${pre}[${v === ' ' ? 'x' : ' '}]`);
  return rows.join('\n');
}

/* ---------- HTML -> Markdown (for notes written before Markdown) ---------- */
function fromHtml(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || ''), 'text/html');
  const walk = (node, ctx) => {
    let out = '';
    for (const k of node.childNodes) {
      if (k.nodeType === 3) { out += k.textContent.replace(/ /g, ' '); continue; }
      if (k.nodeType !== 1) continue;
      const tag = k.tagName, inner = () => walk(k, ctx);
      if (tag === 'BR') out += '\n';
      else if (tag === 'B' || tag === 'STRONG') out += `**${inner()}**`;
      else if (tag === 'I' || tag === 'EM') out += `*${inner()}*`;
      else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out += `~~${inner()}~~`;
      else if (tag === 'CODE') out += '`' + k.textContent + '`';
      else if (tag === 'A') out += `[${inner()}](${k.getAttribute('href') || ''})`;
      else if (/^H[1-6]$/.test(tag)) out += `\n${'#'.repeat(+tag[1])} ${inner().trim()}\n`;
      else if (tag === 'PRE') out += '\n```\n' + k.textContent.replace(/\n$/, '') + '\n```\n';
      else if (tag === 'BLOCKQUOTE') out += '\n' + inner().trim().split('\n').map(l => '> ' + l).join('\n') + '\n';
      else if (tag === 'UL' || tag === 'OL') {
        let n = 1;
        out += '\n' + [...k.children].filter(li => li.tagName === 'LI').map(li => (tag === 'OL' ? `${n++}. ` : '- ') + walk(li, ctx).trim().replace(/\n/g, '\n  ')).join('\n') + '\n';
      } else if (tag === 'DIV' || tag === 'P' || tag === 'LI') { const t = inner(); out += (out && !out.endsWith('\n') ? '\n' : '') + t + (tag === 'P' ? '\n' : ''); }
      else out += inner();
    }
    return out;
  };
  return walk(doc.body, {}).replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- zip (stored, no compression; UTF-8 names) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = bytes => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {                                 // files: [{ name: 'folder/file.md', text }]
  const enc = new TextEncoder(), parts = [], dir = [];
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([at, v, size]) => (size === 4 ? head.setUint32(at, v, true) : head.setUint16(at, v, true)));
    parts.push(head, name, data);
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([at, v, size]) => (size === 4 ? cen.setUint32(at, v, true) : cen.setUint16(at, v, true)));
    dir.push(cen, name);
    offset += 30 + name.length + data.length;
  }
  const size = dir.reduce((n, p) => n + (p.byteLength ?? p.length), 0), end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([at, v, s]) => (s === 4 ? end.setUint32(at, v, true) : end.setUint16(at, v, true)));
  return new Blob([...parts, ...dir, end], { type: 'application/zip' });
}

window.HomeboardMd = { render, toggleTask, fromHtml, zip };
})();
