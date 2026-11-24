# Homeboard guide

Everything Homeboard does, and how. New here? The [README](../README.md) has the short version.

- [Using it](#using-it)
- [Making it yours](#making-it-yours)
- [Installing, updating, the helper](#install-in-edge-recommended)
- [Firefox](#firefox)
- [Offline](#offline)
- [Good to know](#good-to-know)

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
| **Ctrl+click** or **Shift+click** cards · **Shift+drag** on empty board · **Ctrl+A** | Select several cards (click again to take one out; the box selects every card it touches). Drag any of them to move them all; **Ctrl+C / X / V** copies, cuts and pastes the group where the pointer is, keeping its layout and the strings between them (also onto another board); **Ctrl+D** duplicates it; **Delete** removes it with one Undo; **Esc** clears |
| Ctrl+V on empty board | Text → note; address or folder path → website window; screenshot → picture |
| Drop pictures, videos or PDFs on the board | Decorate; right-click → "Keep behind other cards" |
| Drag the background, scroll, Ctrl + scroll | Pan and zoom (see **Moving around** below) |
| The ⤢ button on a card's top edge, **F**, or double-click the top edge (not the title's words) | **Expand**: the card big in the middle of the screen over a dimmed board, to read and write without scrolling. **Esc** or a click on the board puts it back. Website windows, pictures and widgets zoom the board to themselves instead |
| Ctrl + scroll over the selected card, or right-click → **Text size** | Bigger / smaller text in that card only (notes, to-dos, links, files, console, websites). **Grows with the card** makes the text follow the card's size when you resize it |
| **Ctrl+Z** / **Ctrl+Y** (or Ctrl+Shift+Z) | Undo / redo anything on the boards: moving, resizing, deleting, adding, renaming, boards, looks. Inside a note or field, they undo the typing as usual |
| `/` · `Delete` | Jump to the search box · remove the selected card (Undo appears) |

**Your styles** — in Customize → Style, "Save what you see as a style" keeps the current
appearance under a name. Click one to wear it on every board; the pin puts it on the open
board only. Right-click the Customize button to switch styles without opening the panel.
While a board wears its own style, everything you change in Customize changes that style.

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

**Now playing** — while something plays, a button by the clock shows it (its bars move). Click it for
the list of what plays or was paused: website windows on any board, videos on the boards, and sounds in
your other Edge tabs, each with ⏯ play / pause, 📺 **cast**, and a click to **go there**. Below it, a search
over every piece of media on the boards (videos, pictures, PDFs, media sites such as YouTube or Spotify,
the YouTube Music widget). Right-click the button to pause or play the top one. What plays **keeps
playing when you open another board** (its window is only hidden, not reloaded), and the board list
marks boards that are playing with ♪. A website window whose page crashed (Edge's grey frame with a sad
face) is loaded again by itself, where you were.

**Cast to a TV or box** — a video on a board (right-click → **Play on a TV or box…**, or 📺 in Now playing)
goes straight to a Chromecast / Google TV-type device on your network. Sites such as YouTube, YouTube
Music, Netflix or Spotify play best through **their own cast button** in the player (the TV then streams by
itself); 📺 takes you there. Anything else, or a whole board: Edge's ⋯ menu → More tools → **Cast media to
device** (browsers do not let pages start that one).

**Search** — the search box at the top also finds things on Homeboard as you
type: boards, views, cards by name, the words inside notes and to-do lists,
links, apps and website addresses (accents do not matter). The first row stays
"Search the web", so Enter works as before; ↓ / ↑ (or Tab) pick a Homeboard
result and Enter (or a click) goes there, opening its board and centring the
card. **Ctrl+K** or `/` puts the cursor there.

**Files onto the board** — drag a file from a file browser card onto empty
board and choose what to make of it: a **note with its text** (Markdown and
`.txt` as they are, code in a code block), the **picture / video / PDF on the
board**, a **window showing the file** (stays up to date), a **file browser** for
a folder, or a **link** to it. Several files at once work too.

**Saved views** — the bookmark button next to the zoom: **Save this view**, jump to saved views, **Back to the start view** (also the **Home** key, or right-click the bookmark button), make any view the start view, and **Lock the view** so the board cannot be moved or zoomed by accident. Keys **1–9** jump to saved views in order. Each board keeps its own.

**Keyboard travel** — **Ctrl+← / →** step through this board's saved views.
**Ctrl+↑ / ↓** step through *your list* of views, which can come from any boards:
in the views menu, **Ctrl+↑ / ↓ list** shows it (reorder with Earlier / Later, add
this board's views, clear it); a view's **In the Ctrl+↑ / ↓ list** tick (Manage
views) adds or removes it. Until you make a list, Ctrl+↑ / ↓ go through every
view of every board in the order of the boards. A small label shows where you
landed. **The view map** (views menu → View map…, or **Ctrl+M**) lays your saved views
out in 2D, like the screens in Windows’ display settings: each view is a tile with a
sketch of its cards; drag tiles to arrange them, drag views from the side list onto
it (from any board), right-click a tile to take it off, click one to go there;
**One row per board** fills it in at once. With views on the map, **Ctrl + ← → ↑ ↓**
go to the view in that direction on the map, across boards. **Tab** (when not typing) opens the board tree for the arrows, like a
file tree: **↑ / ↓** the boards on the same level, **→** into the boards inside,
**←** back out to the parent; each board opens as you reach it, and **Enter**,
**Esc** or **Tab** returns to the board.

**To-do lists** — the small arrow on a task opens its details: steps, notes, a
link to open later, a due date and a star.

**Links** — an address can be a website or a folder/file on this computer; for
those you choose "Open in a browser tab" or "Open in File Explorer". **One click
peeks**: the site (or file) shows big over the board, to glance at it and go back
(Esc or a click beside it); from there **Open here**, **New tab** or **Own window**.
**Two clicks open it** straight away; Ctrl-click opens a new tab as usual.
Right-click the card → "One click shows a preview" switches peeking off for it.

**Website windows** — they get what a normal tab gets (downloads, dialogs, casting, camera and microphone when the site asks), except replacing the board. If a site does not show within a few seconds, the window offers to open it **in its own window**: a real Edge window placed over the card, where every site works; **Always** keeps that choice for the window (also in its right-click menu, **Always open in its own window**). Once its own window is open, the card offers **Show it live here**: Edge asks once which tab to share (pick the one named in the message) and the card then shows that window live, like a screen share in a call — the window keeps the card's size and keeps drawing behind the board. Click the picture to use the site: the real window comes exactly over the card. The ✕ on the picture stops showing it live. When a site sends you to a sign-in page that refuses to be inside another page (Google, Microsoft, Apple), the window offers **Sign in** in a real window and reloads when you close it. **Zoom** a website window like a tab: inside the site, Ctrl + scroll, a touchpad pinch, Ctrl + plus / minus, Ctrl + 0 (or, with the window selected, Ctrl + plus / minus / 0 on the board, or right-click → **Zoom** with 50–200 % steps); it keeps its zoom. A window **comes back where you left it**: the page you were on inside it and how far down you were, also after Homeboard is closed (right-click → **Come back where I left it** turns this off; the ↻ button next to the address goes back to the address at its top). Right-click its top edge → **Show only the website (no frame)** hides the title and address bar, and the site’s own scroll bars (scroll with the wheel or touchpad; **Hide the scroll bars** turns this on or off for any website window): drag the site to move it until you click into it, then the thin strip along its top edge moves it and opens the menu. The window button opens a site in its own window beside the board, for sites that will not show inside it. Type an address, a `.pdf` link, a folder such as
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
| YouTube Music | Shows what YouTube Music is playing — artwork, title, artist, progress — and controls it: previous, play/pause, next, jump (click the bar), volume (slider, or scroll over the controls), like. Works with YouTube Music open anywhere in Edge: a normal or pinned tab, or a website window on a board. Right-click: go to the player, open YouTube Music in a pinned tab, pick a player when several are open, eight looks (glass panel, liquid glass tinted by the cover, artwork behind, ambient glow, a vinyl record that spins while playing, framed cover, compact pill, no panel). Needs the installed extension. | It can also be a whole **player** with its own working buttons — a click-wheel player (turn a finger around the wheel for the volume), a car radio, a cassette player or a CD player — and the **progress bar** can be Classic, a burning fuse, a cigarette, a snail, a rocket, a wave, beads or a rainbow (right-click → Progress bar). **Music halo around the cover** (right-click): bars grow out of the cover with the beat, a ring around round covers, a sunburst from square ones, in the cover's colours. |
| Picture frame | Gilded, gallery black, wood, polaroid, thin white or no frame, with or without a white mount — or a **device** (drawn, no brands): a **click-wheel music player** (the cover on its screen with the progress and times; the wheel’s centre plays / pauses, its sides skip, scrolling over it changes the volume), a **wooden retro TV** (channel knob: next song, volume knob: scroll, power: play / pause), a **small CRT monitor** (its front buttons) or an **arcade cabinet** (the song on the lit marquee; its buttons control the music). Old screens get scanlines and a curve. Shows **the cover of what plays** (it changes with the song; double-click to pause or play), your own picture, or the cover and your picture when nothing plays. |
| Smoke break (prototype) | An arm holds what you smoke, the other a lighter, over the whole screen. **Space** strikes the lighter (it takes a few tries), **hold** it to keep the flame on the tip until it lights (cigars take longer); then **hold Space to draw** — the ember glows, it burns faster, smoke comes out when you let go. Ash grows and sometimes falls; it goes out if left too long; lighters run out of gas (sparks only). **Esc** puts it out; Space twice throws it away (the next one is taken from the pack). The cigarette sits between the fingers and the thumb strikes the lighter. The **Tabacaria** sells cigarettes, rolling tobacco (roll it first with Space), cigars, a cigarillo, a pipe, heated tobacco (hold to heat, 12 puffs) and a vape, plus lighters in colours (flint, refillable, petrol flip, torch, matches), in a kiosk, airport, gas station, café or supermarket. The 14 original pack designs are on sale, and you can add, edit and delete packs of your own. Names are made up. The longer you draw, the bigger the cloud you breathe out. **Closed room** (right-click it): the smoke stays, rises and fills the room with haze until you choose **Open the window**. |
| Sound visualiser | Moves by itself with whatever plays in Edge — a tab, a pinned tab, or a website window on a board — with no sharing dialog and no sharing bar (`tap.js` listens inside the page that plays and sends only the levels). If a tab started playing on its own, the widget may ask you to click once in that tab first. Click the widget to pause it. Right-click → "Listen to" can switch to a microphone-type input. The bars keep their size and spacing at any width; four shapes, four colourings. Shapes: bars, mirrored bars, **waves** (three smooth waves, each moving with its part of the sound), sound line (oscilloscope), ring. Colours: theme, **the cover's**, rainbow, fire, white. **Background**: none, card, glass, dark stage, glow from below, or the cover of what plays. |
| Clock | 14 faces: 6 with hands (minimal, theme colours, classic, roman, bold, neon) and 8 digital (digital, LED, flip clock, nixie tubes, LCD watch, dot matrix, thin and big, neon tube); seconds, date, 24-hour. **Music around it**: a ring of bars around a round face or an equaliser behind the digits, in the clock's colour or the cover's |
| Custom component | A card you design (HTML, CSS, JavaScript): from the components folder, written in its editor, or made by an AI from your description. Comes with Day & night sky, Word clock, Beat orb and Countdown. One click on it uses it (the first click also selects the card); drag the card by its edge or the handle on top. See [COMPONENTS.md](COMPONENTS.md) |
| 8-ball pool | You vs the computer or 2 players. Aim with the mouse, hold and pull back for power, scroll for top/back spin. "Choose a cue" opens a cue rack; "Change table" shows the tables, among them one in the colours of the album cover that plays (it fades to each new song) and a neon one that glows in your accent. Grab the wooden rail to move it. |
| Cigarette pack | Click to open, click the cigarettes to take one, click it to light. Double-click finishes it. "Change pack" opens a full-screen tobacco machine (three machine styles, last slot is your own picture) standing in a scene: café at night, café in the morning, gas station, by the clock, or "My own place…" for any picture of yours; also "Burn only while I hold it", count corrections, new pack. |
| 2048 | Arrow keys (click it first) or drag across the board |
| Minesweeper | Click opens, right-click on a square flags; right-click the top line for options and sizes |
| Sudoku | Click a square and type; N or ✎ for pencil notes; three levels |
| Sliding puzzle | 3×3 to 5×5, numbers or your own picture |

**Customize** (top right) — every setting has one place, in this order:
- **Style**: **style kits** set everything below at once so it matches (colours, material, background,
  font, roundness, and the looks of the YouTube Music widgets and picture frames on every board);
  **Shuffle** makes up a fresh combination that still goes together; Undo each time. Under them, **your
  styles** (see above).
- **Intensity**: one dial from **Calm** to **Wild** for how much everything moves, glows and shines.
- **Colours**: the theme (Graphite, Midnight, Neon, Acrylic, Cork, Paper), the accent, and **Accent from
  the album cover** (the accent takes the colour of the cover that plays, fading from song to song).
  **More colours** opens background, cards, panels and text.
- **Cards and panels**: what they are made of (Solid, Frosted glass, **Liquid glass**, which in Edge bends
  what is behind it at the edges like a thick lens, Paper, Neon outline); for the glass ones, the colour of
  the glass (the theme's, **clear**, **from the cover**, or your own); opacity and roundness.
- **Background**: None, Soft colour, **From the cover**, **Cover art** (the cover itself, blurred big),
  Spotlight, Split colour, Film grain; a pattern; or your own picture.
- **Text** (font and size), **Make it yours** (your own CSS, custom components, Design with AI),
  **Screen visuals** (a button to Now playing, where they live), **Board** (snap, search engine, clock,
  the add bar), **Website windows** and **Your data** (backups, export, the version).

**Screen visuals and ambient** — choose them in **Now playing** (the music button by the clock): little moving pictures of each style, then look, colour, strength and opacity, and **Ambient mode**, with a line saying what it hears (or what to do — e.g. click once inside a tab Edge
will not let it hear yet; tabs already playing before Homeboard opened are picked up by themselves). A layer over the whole screen that moves with whatever plays in Edge,
like shaders over a game: bars along the bottom, top and bottom, from the sides, an **edge glow** made of the music (bass along the bottom, mids up the sides, highs along the top, a ripple on every beat), waves,
stars on the beat, **Frost** (ice that grows in from the edges as the music gets louder and melts back
when it is quiet) or **Disco** (a turning mirror ball, its reflections sweeping the screen, coloured spots,
star flares and a floor that lights on the beat); in clear glass, tinted glass, neon or solid; coloured from the cover, the accent,
a rainbow or a colour you pick; with strength and opacity. It never takes a click — every card stays
usable through it. **Ambient mode** fades the bars and buttons away (the pointer hides when still) so you
see the whole screen with the visuals; **Esc** brings everything back.

**Commands** — type **>** in the search box for commands (Enter runs the first): ambient mode, the
overlay and its looks, style kits, Shuffle, materials, glass colours, backdrops, the view map, Now
playing, new cards and boards, lock the view… Words without > also show matching commands among the
results.

**Intensity** (Customize) — one dial from **Calm** to **Wild** for how much
everything moves, glows and shines: the screen visuals, the live wave, the backdrop colours; Lively and Wild
make the music cards glow on the beat. Balanced is the board as designed.

**Backgrounds for frameless cards** — clocks, visualisers, frames and custom components float on the board;
right-click → **Background** gives any of them a card, glass or dark backing so it sits with the cards
around it.

## Making it yours

- **Your own CSS** for the whole board (Customize → Make it yours) or for one card (right-click → Style with CSS…).
  See [STYLING.md](STYLING.md).
- **Custom components**: cards you design in HTML, CSS and JavaScript, or describe to an AI. See
  [COMPONENTS.md](COMPONENTS.md).
- **Design with AI** in both: Homeboard writes a complete brief for Claude Code or any assistant; nothing is sent
  anywhere by Homeboard.

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
The **Console** button adds a real terminal card: the same terminal VS Code uses
(xterm.js, in `vendor\xterm`) on Windows' own pseudo-console (`helper\conpty.ps1`),
so full-screen programs work — **Claude Code**, vim, progress bars, colours —
and it follows the card's size. Ctrl+C copies selected text and otherwise stops
what runs; Ctrl+V pastes; Ctrl + scroll (on the selected card) changes the text
size. Right-click → **Shell** picks Windows PowerShell, PowerShell 7 or Command
Prompt. A console keeps running when the board closes (a long job or Claude Code
can carry on) and shows its recent output when opened again; ↻ starts a fresh one;
unused consoles end after 8 hours. A backup is written once a day to
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
