/* .md files opened directly in Edge (file:///…/something.md) show formatted, with pictures from the same
   folder or the web; the bar at the top switches to the plain text, or to editing. Saving goes through
   Homeboard's background and the helper, and only ever writes the file shown in this tab. */
(() => {
'use strict';
if (window.__hbMdView) return;
window.__hbMdView = true;
const api = globalThis.browser ?? globalThis.chrome;
const pre = document.body && document.body.children.length === 1 && document.querySelector('body > pre');
if (!pre) return;                                    // not Edge's plain-text view of the file

const name = decodeURIComponent(location.pathname.split('/').pop() || 'Markdown');
const original = pre.textContent;
document.title = name;
document.documentElement.classList.add('hbmd');
const page = document.createElement('div');
page.className = 'hbmd-page';
pre.replaceWith(page);

const ask = (type, extra) => api.runtime.sendMessage({ homeboard: type, ...extra }).then(r => {
  if (!r || r.error) throw Object.assign(new Error(r ? r.error : 'Homeboard did not answer.'), { code: r && r.code });
  return r;
});
api.storage.local.get('homeboard:mdview').then(r => {
  window.HomeboardFileView.mount(page, {
    isMd: true, page: true, base: location.href, mode: r['homeboard:mdview'] || 'formatted',
    load: async () => ({ text: original }),
    open: () => ask('file-read'),
    save: d => ask('file-write', d),
    onMode: m => { if (m !== 'edit') api.storage.local.set({ 'homeboard:mdview': m }); },
  });
}, () => {});
})();
