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
