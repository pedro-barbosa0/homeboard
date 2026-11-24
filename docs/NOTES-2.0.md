# Homeboard 2.0: working notes

A running log of how 2.0 was made: what was decided and why, the bugs found and how, what was left for later.
Newest at the bottom of each section.

## The brief

- First public release. Clean, polished, easy to use, and it should feel good: a personal start page and board that
  can look and behave the way each person likes (calm or loud, plain or playful).
- Widgets must sit well next to each other (clocks and others were hard to fit on a board).
- Make your own components and looks: with CSS, or with full components, alone or with an AI's help, without leaving
  Homeboard's own folder (use any AI coding app pointed at it). Looks can follow data (the time, the music…).
- Find and fix bugs. Nothing personal in the public repository.

## Decisions

- **Custom components run in a sandbox.** An extension page cannot run code it did not ship (Manifest V3 forbids
  inline and evaluated scripts), and code written by someone else must not reach your boards, your files or the
  extension's powers. MV3's answer is a *sandboxed page* (`manifest.sandbox.pages`): it may run any script, has no
  extension APIs, and talks only through `postMessage`. Each custom component is an iframe of `component.html`; the
  board sends it the component's code and a live feed (time, theme colours, music, sound levels) and nothing else.
- **Two places a component can live:** inside the board (written in the in-app editor, saved with the board, travels
  in backups) or as files in the Homeboard folder's `components/` (what an AI coding app writes; Homeboard reloads
  them when they change). Same API for both.
- **Styles:** a card can carry its own CSS, scoped to that card (`@scope`), so a look can be changed without touching
  Homeboard's code. Board-wide CSS too, for whole looks.
- **AI help without an AI inside Homeboard:** "Design with AI" writes a complete brief (what you described + the
  component API + where the files go + the rules) to copy into Claude Code, or any assistant, opened in the Homeboard
  folder. No keys, nothing sent anywhere by Homeboard.
- **Licence:** MIT (simple, permissive; the usual choice for a utility people may fork). Vendored xterm.js keeps its
  own MIT licence.

## Bugs found and fixed

- **Website cards unreadable on Liquid glass.** Reproduced with a headless test (a website card on a liquid board:
  blurred and smeared even before any zoom). The liquid "lens" puts an SVG displacement filter in the card's
  `backdrop-filter`; Edge draws an embedded page through it. Cards holding a page (website, component, PDF) now keep
  the plain glass and never get the lens. Frosted and solid were never affected.
- **Frost's edge blur covered text.** It could reach far into the screen with loud music. Now a soft 3 px blur, and
  it stays in the outer band whatever the ice does.
- **The player's Wave bar ignored the music while the visualiser moved.** A tab's sound levels go out on one
  connection; anything that started listening after it opened never received them. A board that hears nothing from
  a playing tab now asks it to open the stream again (all listeners get it).
- **"false" printed in Customize and Now playing.** `replaceChildren(a && b)` writes the word `false`. Fixed, and
  searched for everywhere else.
- **Button rows showing "[object HTMLButtonElement]"** in the new component picker (a helper given elements where it
  expected text). Searched the other widgets for the same mistake: none.
- **Console: the mouse picked the wrong letters when the board was zoomed.** xterm works out positions without
  knowing the page is scaled. The terminal now undoes the board's zoom (it draws at the screen's own size), so the
  mouse is right and the text is crisp at any zoom.
- **Lint pass** (ESLint 9, recommended rules, every script): one invisible no-break space written into a regex, seven
  unused names (an unused function among them). All cleaned; the lint is now clean.
- **Paper cards were see-through with "Clear" glass**, **the cassette's label stripe crossed the artist**, **the
  progress bars made the page lay out every frame** (a width animation restarted by every clock tick): fixed late in
  1.12 / early 2.0, see `docs/PERFORMANCE.md`.
- **The first click on a component only selected the card** (found by trying the AI flow for real: a component an
  assistant wrote, pasted in, did nothing on click). The cover that lets you drag the card now passes the first click
  through and steps aside until the card is deselected. A real-mouse test checks it.
- **"Design with AI" sent the wrong component's code** when opened from another component card: the current code now
  goes into the brief only when "Change this component" is ticked.
- **Colours jumped when the song changed** (a dark orange cover to white in an instant: distracting). The accent and
  the cover backdrop are now registered CSS colours (`@property`) that fade over ~1.6 s; the screen visuals blend
  toward the new cover's colours; the cover art backdrop cross-fades.
- **Component frames showed an opaque black box**: an iframe whose colour scheme differs from the page is painted
  opaque by the browser; the frame no longer sets its own.
- **A sandboxed page cannot reload itself reliably**: new component code now comes with a fresh frame from the card.
- **The Acrylic theme without wallpaper.jpg** (the wallpaper is personal and never published): checked on the public
  copy, it falls back to its blue and purple gradient. Two tests that required the file no longer do.
- **A test wrote leftovers into the Homeboard folder** (appstest read its first argument as a scratch folder; every
  suite gets the Homeboard folder first). Fixed, leftovers removed, and ignored in git.
- **Console cards did not appear at all** (found in the final check, caused by 2.0's zoom fix): the zoom handler read
  a variable before its line had run, so the card failed while being built. A new suite, `typestest`, now puts every
  card type and every widget on one board and fails on any error from the first moment the page loads.
- **The undo history could stop for good.** Steps are not recorded in the middle of a drag; a drag whose mouse
  release never arrived (let go over a website window) kept the board "dragging" forever. Now a drag ends when the
  mouse moves again with no button held, and the history waits 8 seconds at most.
- **The neon pool table changed colour only under the mouse.** It glows in the accent, which fades to each new cover,
  but nothing redrew it. It now redraws while the accent fades (it watches the accent's value only, so other style
  changes cost nothing). `pooltest` plays songs from a second tab and checks both the neon and the album-cover table.
- **Flaky tests, not the app:** exttest sampled the first widget canvas on the page (now the table's); smoketest's
  cigar could run while the headless window had lost focus and stopped drawing (it is brought to the front, as the
  burn test already did).
- **Not reproduced:** a "Smoke break deleted" message seen while smoking. Only the Delete key or the menu delete a
  card, and Undo restores it; nothing in the smoke session sends Delete.

## What else 2.0 changed

- **The board's code** (`app.js`, 5,400 lines in one function) is now nine parts in `app/`, classic scripts sharing one
  scope. Before splitting, a small analysis (espree) checked that no code running at load time would need a part
  that loads later (one place did: the card types table, now looked up lazily), and that none of the 385 top-level
  names clashes with a browser global (none does).
- **Docs for a public project**: a product README, the full guide (`docs/GUIDE.md`), styling, components,
  architecture, privacy, changelog, contributing, MIT licence; screenshots made by `dev/shots.js` with made-up content.
- **Customize reorganised** (your note: "I feel I am setting the same thing in two different places"). It was:
  three kinds of presets (style kits, saved looks, themes), colour set in four places (theme, colours, "colours
  follow the music" under Style, glass colour), the background split between Style and Theme, see-through in two
  (material and card opacity), and the screen visuals and Intensity both in Customize and in Now playing. Now each
  setting has one home: Style (kits + your saved styles, the old "looks", renamed to match), Intensity, Colours
  (theme, accent, *Accent from the album cover*, more colours folded), Cards and panels (material; the glass
  colour only appears for glass), Background, Text, Make it yours, a pointer to Now playing for screen visuals,
  then Board, Website windows, Your data. styletest checks the one-home rule.
- **Now playing lists only what plays outside Homeboard's own controls**: Edge tabs, website windows, videos and
  the media on the boards. The YouTube Music widgets and picture frames are controls for a player that is listed
  already (its tab), so they are left out (you had a dozen identical "YouTube Music controls" rows).
- **Smoke: the breath follows the draw.** A quick drag breathes out a thin wisp, a long draw a big, slow cloud
  (the exhale now lasts as long as the breath, strongest at first). **Closed room** (right-click the widget): the
  smoke slows, rises to the ceiling and builds a haze that thickens with every breath, is kept with the board and
  airs out over ~10 minutes between breaks; **Open the window** clears it in a few seconds. smoketest checks both.
- **Edge glow redone** (your note: a little ball that means nothing, and a glow that feels dead). The ball was a
  bloom drifting on a timer: gone. The glow is now made of the music: light all around the edge with the bass
  along the bottom, the mids up the sides and the highs along the top; the colours flow around, faster when it is
  loud; each beat sends a ripple up both sides. Quiet music gives a quiet edge (it never moves on its own).
- **Galleries**: menus whose options are looks open as a grid of previews (`openGallery`; `widgetPreview` builds the
  real widget, scaled). Music previews pass `__preview` and show a drawn sample song when nothing plays.
- **The disco ball** was a test component made with another assistant, not a 2.0 feature: removed again.
- **First run**: the welcome note and to-do list point at style kits, Intensity and custom components.
- **Tests**: new suites for components (sandbox isolation, settings, levels, links, file reload, the first click,
  card and board CSS), clocks, tab syncing, galleries, the pool table with the music, every card type at once; the console's zoom; the colour fade.

## Left for later

- **The cigarette packs keep their real brand names** (your call; noted by the privacy check).
- **The public copy**: `tools/make-public.ps1` (made in a side session) builds it in a separate folder with one fresh commit under a public
  name (the private history has your full name as the commit author). It scans for your name, e-mail and keys first,
  and pushes nothing.
- A "light mode" suggested to slow machines on first run (report item 4.8): the Intensity dial covers most of it.
- Real-music checks of the halo and the live wave on your own machine (the tests feed a beat; the test browser cannot
  play YouTube Music).
