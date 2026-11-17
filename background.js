/* Homeboard background script.
 *
 * The board page adds a session rule, keyed to its own tab id, that strips the
 * "do not embed me" response headers for frames inside that tab (see
 * setupUnblock in app.js). This script makes sure that rule never outlives the
 * board: it is dropped when the tab closes or navigates to an ordinary site.
 */
const api = globalThis.browser ?? globalThis.chrome;

function dropRule(tabId) {
  api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] }).catch(() => {});
}

api.tabs.onRemoved.addListener(dropRule);
api.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url && /^https?:/i.test(info.url)) dropRule(tabId);
});

// Toolbar button: open the board in a tab.
api.action.onClicked.addListener(() => {
  api.tabs.create({ url: api.runtime.getURL('index.html') });
});

/* .md files opened in Edge (mdview.js) can be edited: the tab asks here, and this asks the helper.
   The file is always the one the asking tab shows — a page cannot name some other file. */
async function helperCall(route, body) {
  let key = '';
  try { key = (await (await fetch(api.runtime.getURL('helper/token.txt'), { cache: 'no-store' })).text()).trim(); } catch { /* never started */ }
  let where = '';
  try { where = (await (await fetch(api.runtime.getURL('install-path.txt'), { cache: 'no-store' })).text()).trim(); } catch { /* working copy */ }
  const hint = `Saving needs the Homeboard helper. Open ${where || 'the Homeboard folder'}\\tools, right-click start-helper.ps1 and choose “Run with PowerShell”.`;
  if (!key) throw new Error(hint);
  let r;
  try { r = await fetch('http://127.0.0.1:8767' + route, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error(hint); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'The helper could not do that.'), { code: j.code });
  return j;
}
api.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || (msg.homeboard !== 'file-read' && msg.homeboard !== 'file-write')) return;
  let path = '';
  try {
    const u = new URL(sender.url || '');
    if (u.protocol !== 'file:' || !/\.(md|markdown)$/i.test(u.pathname)) throw new Error();
    const p = decodeURIComponent(u.pathname).replace(/\//g, '\\');
    path = u.host ? `\\\\${u.host}${p}` : p.replace(/^\\/, '');
  } catch { reply({ error: 'Only a Markdown file open in this tab can be edited.' }); return; }
  const call = msg.homeboard === 'file-read'
    ? helperCall('/fs/read', { path })
    : helperCall('/fs/write', { path, text: msg.text, mtime: msg.mtime, eol: msg.eol, bom: msg.bom });
  call.then(reply, e => reply({ error: e.message, code: e.code }));
  return true;
});
