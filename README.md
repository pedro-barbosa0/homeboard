# Homeboard

A personal start page: boards of notes, to-do lists, links, website windows,
pictures, a file browser, strings between cards, and widgets (clock, games,
pool table, cigarette-pack counter). Everything saves automatically on this
computer.

## Install in Edge (recommended)

Installing it as an extension is what puts it on every new tab, lets website
windows show sites that normally refuse to be embedded, keeps you signed in
inside those windows, and lets it read folders on this computer.

The copy you use every day lives in its own folder, apart from this one (where
Homeboard is worked on), so unfinished changes never reach your board.

1. Right-click `tools\install.ps1` → **Run with PowerShell**. It copies Homeboard
   to `%LOCALAPPDATA%\Homeboard` (`C:\Users\<you>\AppData\Local\Homeboard`).
2. Open `edge://extensions`, switch on **Developer mode**, click **Load unpacked**
   and choose that folder.
3. Open a new tab. Edge asks whether to keep the new page — choose **Keep changes**.
4. For startup: Settings → *Start, home, and new tabs* → **Open the new tab page**.
5. For folders and local files: on `edge://extensions`, Homeboard → **Details** →
   switch on **Allow access to file URLs**.

The daily copy gets a fixed extension ID (`ighnfalcemcbjacbfpakkkhdbdbbabdm`):
`install.ps1` adds the public key from `tools\extension-key.txt` to its
`manifest.json`, so the board belongs to Homeboard itself, not to a folder. This
working folder carries no key (a store upload must not have one either).

### Updates

Run `tools\install.ps1` again. It is safe while Edge is open:

- your board, pictures, helper key and backups are untouched;
- the version you had is kept in `%LOCALAPPDATA%\Homeboard-previous`;
- the next new tab runs the new version, and before it touches the board it keeps
  a copy of it (in the browser, and as `backups\homeboard-before-<version>.json`
  when the helper runs). No reload in `edge://extensions` is needed, except that
  background parts finish when Edge restarts;
- Customize → Your data shows the version, and **Undo the last update** puts the
  board back as it was;
- `tools\rollback.ps1` puts the earlier program back.

### Optional: open folders in File Explorer

A browser cannot start File Explorer by itself. To make "Open in File Explorer"
links work, right-click `tools\install-explorer-helper.ps1` → **Run with
PowerShell** once. It registers a `homeboard-open:` link type for your Windows
account only; the helper can only show a folder (or highlight a file) in File
Explorer. Run it with `-Remove` to undo.

### Optional: the helper (move files, console, daily backups)

A web page may not move files, open them in their usual program, or run a
console, so a small program in `helper\` does that for the board. It listens on
this computer only and answers only the Homeboard extension (secret key in
`helper\token.txt`).

- Start it now: right-click `tools\start-helper.ps1` → **Run with PowerShell**
  (run it with `-Stop` to stop it).
- Start it with Windows: right-click `tools\install-helper-startup.ps1` →
  **Run with PowerShell** (`-Remove` undoes it).

With it running: in a file browser card, right-click files for Open, Copy, Cut,
Rename, Delete (to the Recycle Bin); right-click empty space for Paste and New
folder; drag a file onto another file browser to move it (hold Ctrl to copy).
The **Console** button adds a PowerShell card (Ctrl+C restarts it; full-screen
terminal programs are not supported). A backup is written once a day to
`backups\` in this folder (two weeks are kept).

## Firefox

- Quick try: `about:debugging` → *This Firefox* → **Load Temporary Add-on** →
  pick `manifest.json`. Firefox removes temporary add-ons when it closes.
- Permanent: Firefox only keeps signed add-ons, so the folder has to be zipped
  and signed through addons.mozilla.org ("on your own" distribution), or used in
  Firefox Developer Edition with signature checks switched off.
- Without an add-on: set `index.html` as the homepage. Local folders and
  blocked sites will not work there. Not tested in Firefox.

## Using it

**Boards** — the rail on the left opens into a tree when you point at it.

| Do this | To |
| --- | --- |
| Click a board | Open it |
| The + on a row, or "New board" | Add a board inside another, or at the top level |
| Double-click a name (or F2) | Rename |
| Right-click a board | Icon, colour, move up/down/inside, delete, and: |
| …"Show a page, PDF or folder instead of cards" | Make the board one full page |
| …"Notes panel on the side" | Keep a notes column for that board |

**Cards**

| Do this | To |
| --- | --- |
| Buttons at the bottom, or right-click empty space | Add a note, to-do list, website window, links, media, file browser, widget |
| Double-click empty space | New note right there |
| Drag a card's top edge / bottom-right corner | Move / resize (pictures and widgets keep their shape; Shift stretches) |
| Drag the pin at the top of a card onto another card | Tie a string (click a string to recolour or cut it) |
| Right-click a card's top edge, or its ⋯ button | Colour, rename, duplicate, move to another board, delete |
| Click a card's top edge, then Ctrl+C / X / V / D | Copy, cut, paste, duplicate the card |
| Ctrl+V on empty board | Text → note; address or folder path → website window; screenshot → picture |
| Drop pictures, videos or PDFs on the board | Decorate; right-click → "Keep behind other cards" |
| Drag the background, scroll, Ctrl + scroll | Pan and zoom |
| `/` · `Delete` | Jump to the search box · remove the selected card (Undo appears) |

**Looks** — in Customize, "Save what you see as a new look" keeps the current
appearance under a name. Click a saved look to wear it everywhere; the pin puts
it on the open board only (also in a board's right-click menu, "Look for this
board"). Right-click the Customize button to switch looks without opening the
panel. While a board wears its own look, the Customize controls edit that look.

**Private cards** — right-click a card's top edge → "Hide the contents": blurred
until you point at it, or until you click it. Notes also have "Lock with a
password…": the text is then saved encrypted and asks for the password each
time the board is opened. A forgotten password cannot be recovered.

**To-do lists** — the small arrow on a task opens its details: steps, notes, a
link to open later, a due date and a star.

**Links** — an address can be a website or a folder/file on this computer; for
those you choose "Open in a browser tab" or "Open in File Explorer".

**Website windows** — type an address, a `.pdf` link, a folder such as
`C:\Users\you\Downloads\`, or just words to search. An empty window offers
Google, Wikipedia, YouTube, YouTube Music, Bing, DuckDuckGo and Maps: click one
to open it, or type first and click to search that site.

**File browser** — each file carries a coloured mark for its type. Type a folder path; click a file for a preview at the side
(pictures, video, audio, PDF, text), the ⤢ button for a big preview, double-click
to open it in a tab.

**Widgets** — no frame, no buttons: drag them by any part that isn't a control,
and **right-click for all options**.

| Widget | Notes |
| --- | --- |
| Sound visualiser | Click it to start or stop. Right-click → "Listen to": this computer's sound (the browser asks what to share each time — pick "Entire screen" or a tab and tick the audio box), or a microphone-type input (allowed once, then it starts by itself). Four shapes, four colourings. |
| Clock | 8 looks (right-click → Change clock), seconds, date, 24-hour |
| 8-ball pool | You vs the computer or 2 players. Aim with the mouse, hold and pull back for power, scroll for top/back spin. "Choose a cue" opens a cue rack; "Change table" lists the tables. Grab the wooden rail to move it. |
| Cigarette pack | Click to open, click the cigarettes to take one, click it to light. Double-click finishes it. "Change pack" opens a full-screen tobacco machine (three machine styles, last slot is your own picture) standing in a scene: café at night, café in the morning, gas station, by the clock, or "My own place…" for any picture of yours; also "Burn only while I hold it", count corrections, new pack. |
| 2048 | Arrow keys (click it first) or drag across the board |
| Minesweeper | Click opens, right-click on a square flags; right-click the top line for options and sizes |
| Sudoku | Click a square and type; N or ✎ for pencil notes; three levels |
| Sliding puzzle | 3×3 to 5×5, numbers or your own picture |

**Customize** (top right) — themes (Graphite, Midnight, Neon, Acrylic, Cork,
Paper), every colour, opacity, roundness, font, background image, search
engine, clock, backup.

## Offline

The page loads nothing from the internet for itself (no web fonts, no hosted
scripts), so the installed extension opens and works with no connection:
boards, notes, to-dos, links, strings, pictures, dropped PDFs, the file browser,
looks and themes, locked notes and every widget.

What needs a connection, and what happens without one:

| Part | Offline |
| --- | --- |
| Website windows and page boards showing a website | Say "You are offline" and reload by themselves when the connection returns. Folders, local files and dropped PDFs still show. |
| The search box | Tells you it is offline instead of leaving the board |
| Link tiles | Still shown with their icons (kept on this computer after the first time online, in the extension); clicking one needs the connection |
| Pictures dragged in from a website | Copied onto this computer the first time they load (in the extension), so they keep showing |

A small "offline" marker appears next to the clock while there is no connection.
To read a PDF offline, drop the file on the board rather than linking to it.

## Good to know

- Website windows: with the extension, the "do not embed me" headers are removed
  only for frames inside a Homeboard tab, and the rule is dropped when that tab
  closes or goes elsewhere. Sign-ins from your normal tabs carry over into the
  windows (checked with ordinary login cookies). A site's own sign-in page may
  still insist on opening in a tab; sign in there once and reload the window.
- The preview address, the page opened as a plain file, and the installed
  extension each keep their own separate data. Export/import moves a board
  between them (pictures and PDFs travel inside the backup; files over 30 MB
  are left out).
- The pack designs are redrawn as simple vector art; they are not the makers'
  artwork. "My own picture…" puts a photo of your choice on the pack.
- The Acrylic theme is an in-page copy of the Windows material: a browser page
  cannot see through its window to the real desktop. `wallpaper.jpg` is a
  snapshot of the desktop wallpaper used as the backdrop; replace that file (or
  pick a background image in Customize) when the wallpaper changes.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The board: cards, boards, menus, themes, storage |
| `widgets.js`, `widgets.css` | Pool table and cigarette pack |
| `widgets-more.js`, `widgets-more.css` | Clock, 2048, Minesweeper, Sudoku, sliding puzzle |
| `extras.css` | Looks list, hidden/locked cards, cue rack and tobacco machine |
| `manifest.json`, `background.js` | The extension wrapper |
| `tools/install.ps1`, `tools/rollback.ps1` | Install or update the daily copy; go back one version |
| `tools/` (other scripts) | Start the helper, start it with Windows, the File Explorer link helper |
| `helper/` | The helper program (see above); `token.txt` and `paired-with.txt` are its key and pairing |
| `icons/` | The extension's icons |
| `dev/exttest.js` | Automated check: `node dev/exttest.js C:\Users\Pedro\Homeboard <new-empty-profile-folder>` |
| `dev/helpertest.js`, `dev/soundtest.js` | Checks for the helper (files, console, backup) and the sound visualiser |
| `dev/updatetest.js` | Checks install, live update, the pre-update copy, undo and rollback in throwaway folders |

New widgets register themselves as `HomeboardWidgets[id] = { label, menu, w, h,
bare, create(host, saved, onChange) }`; `create` may return `{ menu(), grab(e) }`
for right-click options and for saying which parts drag the card.
