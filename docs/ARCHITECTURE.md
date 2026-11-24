# How Homeboard is built

Homeboard is a Manifest V3 browser extension that replaces the new tab page. There is no build step and no framework:
plain HTML, CSS and JavaScript that the browser loads as they are, so the folder you cloned is the extension.

## The page

`index.html` is the board. It loads, in this order:

| Files | What |
|---|---|
| `style.css`, `extras.css`, `widgets*.css`, `fileview.css`, `vendor/xterm/xterm.css` | the look |
| `markdown.js`, `fileview.js` | Markdown rendering and the text / Markdown file view (each wrapped in its own scope) |
| `widgets.js`, `widgets-more.js`, `widgets-music.js`, `widgets-smoke.js`, `widgets-custom.js` | widgets; each registers itself in `window.HomeboardWidgets` |
| `vendor/xterm/` | xterm.js and its fit add-on (MIT), for the console card |
| `apps.js` | the Apps and Workspace cards |
| `app/00-core.js` … `app/08-main.js` | the board itself (below) |

### `app/`: the board, in nine parts

Classic scripts that share one scope, loaded in order. Everything they define is visible to the parts after them;
code that runs while the page loads only uses what earlier parts defined (checked when the files were split).

| Part | What it holds |
|---|---|
| `00-core.js` | environment, saving (`store`; pictures kept apart in IndexedDB: `pics`), DOM helpers (`h`, `icon`), themes, settings, the state and its clean-up (`normalize`), undo, addresses |
| `01-look.js` | applying the look (`applySettings`), Intensity (`VIBES`), the screen visuals (`fx`), ambient mode, liquid glass (`lens`), commands, style kits, card and board CSS |
| `02-ui.js` | menus, messages (`toast`, `hud`), renaming, moving around (pan, zoom, glide), views, the view map |
| `03-cards.js` | building cards (`buildCard`), placing, dragging, resizing, expanding, linked cards, strings, the on-screen observer |
| `04-content.js` | notes, Markdown export, to-do lists, quick links, peek, the search finder |
| `05-helper.js` | the local helper's client, the file browser, the console |
| `06-web.js` | website windows, media cards, widget cards |
| `07-media.js` | clipboard, drag and drop, what plays where, Now playing, the frame unblocking for website windows |
| `08-main.js` | wiring (keys, buttons, other tabs, updates) and start-up (`init`) |

## Shared services (`window.Homeboard*`)

| Name | Where | What |
|---|---|---|
| `HomeboardWidgets` | widgets files | the widget registry: `id → { label, menu, w, h, bare, create(host, saved, onChange) }` |
| `HomeboardMusic` | `widgets-music.js` | one copy of every YouTube Music player: state, the shared clock (`onClock`), the shared animation loop (`onFrame`), cover colours (`palette`) |
| `HomeboardAudio` | `widgets-more.js` | one receiver for the sound levels of every tab (from `tap.js`), started and stopped by whoever listens |
| `HomeboardHalo` | `widgets-more.js` | draws a music halo (bars out of a circle or a box) for the widgets that wear one |
| `HomeboardVibe` | `app/01-look.js` | the current Intensity step, for widgets |

## Scripts in other pages

| File | Runs in | Does |
|---|---|---|
| `frame.js` | Homeboard website windows only (frames named `hb:<card>` inside a Homeboard page) | reports load / sign-in pages, zoom keys, where you are; keeps a port open so a crash is noticed |
| `tap.js` | any page, idle until a board asks | reads the loudness of what that page plays (Web Audio) and sends bands to the board |
| `ytm.js` | YouTube Music | reads and controls the player; reports changes only |
| `mdview.js` | local `.md` files | shows them formatted with Text / Edit |
| `component.html` + `component-runtime.js` | a sandboxed page | runs a custom component (see [COMPONENTS.md](COMPONENTS.md)) |
| `background.js` | the extension's service worker | the toolbar button, the frame unblocking rules' clean-up |

## Saving

- The boards are one record in `chrome.storage.local` (`homeboard:v1`), written 250 ms after a change.
- Where each board is looked at is a separate small record (`homeboard:views`), so moving around writes only that.
- Pictures are kept once each in IndexedDB (`homeboard-media`, `pic-<hash>`); the record holds `hbpic:<hash>`.
  Backups (Export, the helper's daily backup) carry the pictures inside.
- Other Homeboard tabs get the change through `storage.onChanged` and merge it into the open board
  (`adopt` / `patchBoard`): untouched cards keep running.
- Undo keeps whole-state snapshots (with pictures as references), up to 60 steps.

## The helper (optional)

`helper/server.js` (Node) listens on `127.0.0.1:8767` only, answers only requests with the key in
`helper/token.txt`, and does what a page may not: move and open files, run consoles (`helper/conpty.ps1`, Windows'
pseudo-console), write daily backups, list and place windows and start apps (`helper/winbridge.ps1`).

## Tests

`dev/*.js` drive a headless Edge through the DevTools protocol (no test framework). Each takes the Homeboard folder
and an empty profile folder, prints `PASS` / `FAIL` lines and a total:

```
node dev/exttest.js <Homeboard folder> <new empty folder>
```

`dev/perftest.js` measures a busy board (messages, timers, main-thread time, what is written).
