# Privacy

Homeboard has no servers, no accounts, no analytics and no tracking. It never sends your boards, notes or anything
else anywhere.

## What stays on your computer

- Your boards, notes, settings and pictures: in the browser's extension storage and IndexedDB, on this computer.
- With the optional helper: daily backups in the Homeboard folder's `backups/`, and a key in `helper/token.txt`
  that only the Homeboard extension can read.

## What Homeboard connects to, and only when you use it

| When | What |
|---|---|
| You add a website window or open a link | that website, like any tab |
| Link tiles show icons | the site's own icon (kept on this computer afterwards) |
| You search the web from the search box | the search engine you chose in Customize |
| A YouTube Music widget or Now playing | the YouTube Music tab you have open (through the browser, not the internet) |
| A custom component | whatever that component's own code asks for (components run in a sandbox: they cannot read your boards, files or other sites' data) |

## Why it asks for these permissions

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | to keep your boards and pictures |
| `<all_urls>` (host access) | website windows (removing "do not embed" headers only for frames inside a Homeboard tab), reading the loudness of what plays in a tab for the visuals (`tap.js`, idle until a board asks), YouTube Music control, link icons |
| `declarativeNetRequest` | the frame unblocking rule above, limited to Homeboard's own tab and removed when it closes |
| `scripting` | to add the small scripts above to tabs that were open before Homeboard started |
| `system.display` | the view map and workspaces (the size and place of your screens) |

## Design with AI

Homeboard has no AI inside. "Design with AI" only writes a text brief for you to copy into an assistant of your
choice; what you paste there is up to you.
