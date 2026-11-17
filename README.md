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
`backups\` in this folder (two weeks are kept). The helper also starts apps and
places windows for the **Apps** and **Workspace** cards (through
`helper\winbridge.ps1`, which only lists, starts and moves windows — it never
closes or types into anything).

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
| Drag a board | Move it, as in OneNote: onto the top or bottom of another board to put it before or after, onto the middle to put it inside (resting on a closed board opens it), onto "New board" for the top level |
| Drag a card by its top edge onto a board in the tree | Move the card to that board (**Go there** follows it) |
| The + on a row, or "New board" | Add a board inside another, or at the top level |
| Double-click a name (or F2) | Rename |
| Right-click a board | Icon, colour, move up/down/inside, delete, and: |
| …"Copy link to this board" | A link to paste into a note or a Links card (see **Links to boards** below) |
| …"Copy board", "Duplicate board", "Paste board inside / after this one" | Copy a board with the boards inside it (also **Ctrl+C** / **Ctrl+D** on a focused board row). **Ctrl+V** on the board pastes a copied board, even one copied in another Homeboard |
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
| Drag the background, scroll, Ctrl + scroll | Pan and zoom (see **Moving around** below) |
| The ⤢ button on a card's top edge, **F**, or double-click the top edge (not the title's words) | **Expand**: the card big in the middle of the screen over a dimmed board, to read and write without scrolling. **Esc** or a click on the board puts it back. Website windows, pictures and widgets zoom the board to themselves instead |
| Ctrl + scroll over the selected card, or right-click → **Text size** | Bigger / smaller text in that card only (notes, to-dos, links, files, console, websites). **Grows with the card** makes the text follow the card's size when you resize it |
| **Ctrl+Z** / **Ctrl+Y** (or Ctrl+Shift+Z) | Undo / redo anything on the boards: moving, resizing, deleting, adding, renaming, boards, looks. Inside a note or field, they undo the typing as usual |
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

**Markdown files in Edge** — open any `.md` file in Edge (e.g. `file:///C:/…/notes.md`) and it shows formatted, with its pictures and `[[links]]`, and a bar to switch to **Text** or **Edit**; saving needs the helper and only ever writes the file shown in that tab. (Edge must have “Allow access to file URLs” switched on for Homeboard.)

**Notes are Markdown.** Write `# heading`, `**bold**`, `*italic*`, `- list`, `- [ ] task`, `[link](https://…)`, tables and code; leaving the note shows it formatted, a click opens the text again, and ticking a task box in the formatted view ticks it in the text. Enter carries a list on (an empty item ends it), Tab / Shift+Tab indent. Older notes: right-click → **Markdown** converts them. Drop `.md` or `.txt` files on the board to make notes of them; the file browser shows `.md` files formatted.

**Export** — right-click a note or to-do list → **Export as Markdown (.md)**; right-click a board → **Export notes as Markdown (.zip)** (that board and the boards inside it); Customize → Your data → **Export notes as Markdown** (everything). The zip has a folder per board; strings between cards become `[[links]]` as in Obsidian. Locked notes are never exported in bulk.

**Moving around** — built after how tldraw, Figma, Miro and d3-zoom handle it:
a scroll that starts on the board keeps moving the board even when the pointer
passes over cards; over a card, its contents scroll only if they can (else the
board moves); a mouse wheel's steps are eased, a touchpad is used as it comes,
and a touchpad pinch zooms. Hold **Space** (or the middle button) and drag
anywhere to pan, even over cards; a quick flick of the background glides on.
Arrow keys pan (Shift for more), **+** / **-** zoom. Zoom goes from 10 % to 300 %.

**Apps** (the Apps button at the bottom → App launcher) — tiles for programs with
their real icons: **Add** lists the Start menu apps (search as you type), or
type any program, file or folder path; files dragged from a file browser card
work too. Click a tile to start it; right-click to rename, add arguments, move
or remove. Needs the helper.

**Workspaces** (Apps button → Workspace) — a set of apps, folders and websites
with a place on the screen each, drawn as a small picture of your screen(s).
**Open** starts whatever is not open yet and puts every window in its place;
what is already open is only moved (so it also tidies up). Click an item for its
place (halves, thirds, two thirds, quarters, middle, whole screen), its screen,
"Open just this", rename or remove. **Capture** takes the windows on your screen
right now — Edge windows as websites, Explorer windows as folders, other
programs as apps — with their places (Undo is offered). Websites open as Edge
windows (popups, or with tabs when ticked) and work without the helper; apps and
folders need it. A workspace remembers which program each app opened as, so the
next time it finds its window even when the app changed its title.

**Links to boards, views and cards** — right-click a board → **Copy link to
this board**; in the views menu, a view → **Copy link to this view**; right-click
a card → **Copy link to this card**. Paste the link into a note (it shows as a
link with ↗) or into a Links card (it shows as the board's chip); a click opens
that board, at that view, or centred on that card. The Links card's Add form
also has **Or pick a board or view** to choose one without copying.

**Linked notes** — the same note (or to-do list) in several places, on one
board or on many: change any of them and all of them change. Make one with
right-click → **Linked copy (stays the same)** → here or on another board; or
copy a card (Ctrl+C) and paste it with **Ctrl+Shift+V**. A plain Ctrl+V pastes a
separate copy and offers **Keep them the same**. Linked cards carry a ⛓ mark with
the number of places; click it to go to the others or **Make this one
separate**. Colour, size and place stay each copy's own. (Pasting a note's text
inside another note pastes just the text, as before.)

**Saved views** — the bookmark button next to the zoom: **Save this view**, jump to saved views, **Back to the start view** (also the **Home** key, or right-click the bookmark button), make any view the start view, and **Lock the view** so the board cannot be moved or zoomed by accident. Keys **1–9** jump to saved views in order. Each board keeps its own.

**To-do lists** — the small arrow on a task opens its details: steps, notes, a
link to open later, a due date and a star.

**Links** — an address can be a website or a folder/file on this computer; for
those you choose "Open in a browser tab" or "Open in File Explorer".

**Website windows** — they get what a normal tab gets (downloads, dialogs, casting, camera and microphone when the site asks), except replacing the board. If a site does not show within a few seconds, the window offers to open it **in its own window**: a real Edge window placed over the card, where every site works; **Always** keeps that choice for the window (also in its right-click menu, **Always open in its own window**). Once its own window is open, the card offers **Show it live here**: Edge asks once which tab to share (pick the one named in the message) and the card then shows that window live, like a screen share in a call — the window keeps the card's size and keeps drawing behind the board. Click the picture to use the site: the real window comes exactly over the card. The ✕ on the picture stops showing it live. When a site sends you to a sign-in page that refuses to be inside another page (Google, Microsoft, Apple), the window offers **Sign in** in a real window and reloads when you close it. Right-click its top edge → **Show only the website (no frame)** hides the title and address bar, and the site’s own scroll bars (scroll with the wheel or touchpad; **Hide the scroll bars** turns this on or off for any website window): drag the site to move it until you click into it, then the thin strip along its top edge moves it and opens the menu. The window button opens a site in its own window beside the board, for sites that will not show inside it. Type an address, a `.pdf` link, a folder such as
`C:\Users\you\Downloads\`, or just words to search. An empty window offers
Google, Wikipedia, YouTube, YouTube Music, Bing, DuckDuckGo and Maps: click one
to open it, or type first and click to search that site.

**File browser** — each file carries a coloured mark for its type. Text files (`.md`, `.txt`, `.css`, `.json`, code…) preview with **Formatted** (Markdown) / **Text** / **Edit**: edits are kept while switching views, **Save** (or Ctrl+S) writes the file through the helper, keeping its line endings, and asks first if the file was changed elsewhere meanwhile. Markdown shows pictures from the same folder (paths with spaces too), from the web, and Obsidian `![[picture.png]]`; `[[Note]]` links open the note beside it. Type a folder path; click a file for a preview at the side
(pictures, video, audio, PDF, text), the ⤢ button for a big preview, double-click
to open it in a tab.

**Widgets** — no frame, no buttons: drag them by any part that isn't a control,
and **right-click for all options**.

| Widget | Notes |
| --- | --- |
| YouTube Music | Shows what YouTube Music is playing — artwork, title, artist, progress — and controls it: previous, play/pause, next, jump (click the bar), volume (slider, or scroll over the controls), like. Works with YouTube Music open anywhere in Edge: a normal or pinned tab, or a website window on a board. Right-click: go to the player, open YouTube Music in a pinned tab, pick a player when several are open, three looks. Needs the installed extension. |
| Sound visualiser | Moves by itself with whatever plays in Edge — a tab, a pinned tab, or a website window on a board — with no sharing dialog and no sharing bar (`tap.js` listens inside the page that plays and sends only the levels). If a tab started playing on its own, the widget may ask you to click once in that tab first. Click the widget to pause it. Right-click → "Listen to" can switch to a microphone-type input. The bars keep their size and spacing at any width; four shapes, four colourings. |
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
| `fileview.js`, `fileview.css` | A text or Markdown file with Formatted / Text / Edit and Save, used by the file browser and the Edge viewer |
| `mdview.js`, `mdview.css` | Shows `.md` files opened in Edge formatted (runs only on local `.md` files) |
| `tap.js` | Runs in pages but stays idle until a board's sound visualiser asks: then it reads the loudness of what that page plays (the sound itself keeps playing as before) |
| `frame.js`, `noscroll.css` | Runs inside Homeboard website windows only: tells the board a site loaded or went to a sign-in page, and hides the site’s scroll bars when asked |
| `markdown.js` | Markdown rendering, HTML-to-Markdown, and the zip writer for exports |
| `widgets.js`, `widgets.css` | Pool table and cigarette pack |
| `widgets-more.js`, `widgets-more.css` | Clock, 2048, Minesweeper, Sudoku, sliding puzzle, sound visualiser, YouTube Music styles |
| `widgets-music.js`, `ytm.js` | The YouTube Music widget, and the small script Homeboard runs inside YouTube Music pages to read and control the player |
| `extras.css` | Looks list, hidden/locked cards, cue rack and tobacco machine, apps and workspaces |
| `apps.js` | The Apps and Workspace cards |
| `manifest.json`, `background.js` | The extension wrapper |
| `tools/install.ps1`, `tools/rollback.ps1` | Install or update the daily copy; go back one version |
| `tools/` (other scripts) | Start the helper, start it with Windows, the File Explorer link helper |
| `helper/` | The helper program (see above); `token.txt` and `paired-with.txt` are its key and pairing |
| `icons/` | The extension's icons |
| `dev/exttest.js` | Automated check: `node dev/exttest.js C:\Users\Pedro\Homeboard <new-empty-profile-folder>` |
| `dev/helpertest.js`, `dev/soundtest.js` | Checks for the helper (files, console, backup) and the sound visualiser |
| `dev/taptest.js` | Checks the visualiser hearing another tab by itself, at two sizes |
| `dev/linkstest.js` | Checks dragging boards, dropping cards on boards, links to boards / views / cards, linked notes |
| `dev/navtest.js` | Checks moving around (real wheel, pinch, flick, Space-drag), Expand, text size, the Apps and Workspace cards, and live own windows |
| `dev/appstest.js` | Checks the helper's apps and windows on the real desktop (opens and closes Character Map and a test folder) |
| `dev/webtest.js` | Checks website windows: permissions, the not-showing notice, the Google sign-in hand-off, own windows |
| `dev/filestest.js` | Checks the Edge Markdown viewer, editing and saving files, and hidden scroll bars (needs the helper running) |
| `dev/boardstest.js` | Checks undo/redo and copying, pasting and duplicating boards |
| `dev/musictest.js` | Checks the YouTube Music widget against the real site (needs the internet; skips steps the test browser cannot play) |
| `dev/notestest.js` | Checks Markdown notes, export, dropped .md files, saved views and frameless website windows |
| `dev/updatetest.js` | Checks install, live update, the pre-update copy, undo and rollback in throwaway folders |

New widgets register themselves as `HomeboardWidgets[id] = { label, menu, w, h,
bare, create(host, saved, onChange) }`; `create` may return `{ menu(), grab(e) }`
for right-click options and for saying which parts drag the card.
