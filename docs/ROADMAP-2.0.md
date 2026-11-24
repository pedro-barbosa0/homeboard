# Homeboard 2.0 — cleaning and polish (prepared during 1.10 / 1.11)

> **Status (2.0.0): done.** This was the brief written ahead of 2.0. What was built, the decisions and the bugs
> found are in [NOTES-2.0.md](NOTES-2.0.md); the code map is now [ARCHITECTURE.md](ARCHITECTURE.md) (`app.js` became
> `app/00-core.js` … `app/08-main.js`); performance work is in [PERFORMANCE.md](PERFORMANCE.md). Kept below as written.

2.0 adds nothing big. It makes what exists feel finished: consistent, fast, calm, nothing that
annoys. This file is the brief, written ahead so the 2.0 session goes straight to work.
Rule for 2.0 (from the user): review every earlier request against what was built; keep what is
good, tweak what is close, redo with research what is weak. Look at how existing products solve
each thing first (see "Research to reuse"), and check every visual change in a screenshot.

---------------------------------------------------------------------------------------------------

## 1. Code map (sizes at 1.10)

| File | Lines | What it holds | 2.0 note |
| --- | --- | --- | --- |
| `app.js` | ~4740 | Everything of the board: state, themes, looks, materials, overlay, ambient, lens (refraction), commands, style kits, menus, canvas (pan/zoom), views + view map, cards (note, to-do, links, peek, finder, helper client, files, console, website, media, widgets), strings, boards tree, Now playing, wiring | **Split into modules** (plain `<script>` files sharing one namespace, as `apps.js` does with `window.HomeboardApps(kit)`): `look.js` (themes, looks, materials, kits, lens, overlay, ambient), `canvas.js` (pan/zoom/views/map), `cards/*.js` (one per type), `boards.js`, `media.js` (Now playing, keep-alive), `finder.js` (search + commands). Keep load order explicit in `index.html`. Do it first, with the full suite green after each move. |
| `widgets.js` | ~1170 | Pool table, cigarette pack (+ tobacco machine, scenes) | The smoking simulator (see §5) should live in its own file (`widgets-smoke.js`, started in 1.11). |
| `widgets-more.js` | ~800 | Clock, 2048, Minesweeper, Sudoku, sliding puzzle, sound visualiser, **audio hub** (`HomeboardAudio`) | The visualiser widget still has its own copy of the tap logic: make it use `HomeboardAudio`. |
| `widgets-music.js` | ~325 | **Music hub** (`HomeboardMusic`: song, cover, palette, send), YouTube Music widget (8 looks), picture frame | Fine. Widget still keeps its own player map next to the hub's — fold into the hub. |
| `apps.js` | ~420 | Apps card, Workspace card | Never driven end to end from the UI in a test (only the helper API is, in `appstest.js`). |
| `style.css` / `extras.css` / `widgets*.css` / `fileview.css` | ~1460 | Styles; `extras.css` became a catch-all | Regroup by component when splitting `app.js`; remove dead `.term-out/.term-in/.term-line` rules (old console). |
| `helper/server.js` | ~410 | Files, backups, console sessions (ConPTY), apps/windows bridge | Fine. Consider a `/health` with versions so the board can say "update the helper". |
| `helper/winbridge.ps1`, `helper/conpty.ps1` | ~300 | Windows calls (C# compiled once, cached in TEMP) | Cache DLL names carry a version (`homeboard-conpty-v1.dll`): bump when the C# changes. |
| `frame.js`, `tap.js`, `ytm.js`, `mdview.js` | small | Content scripts | Fine. |
| `vendor/xterm/` | — | xterm.js 6.0.0 + fit add-on (MIT) | Keep pinned; note the version in README. |
| `dev/*.js` | 21 suites | Headless Edge tests (CDP pipe + Extensions.loadUnpacked), one per area | See §4. |

## 2. Review: every request so far, and where it stands

Legend: ✅ good · 🟡 works, needs polish · 🔴 weak / redo with research

**Boards & canvas**
- ✅ Board tree, drag to reorder/nest, copy/paste boards, board links, Tab+arrows tree keys.
- 🟡 Moving around (tldraw/Figma-style wheel latching, eased wheel, pinch, Space-drag, glide):
  tune constants on a real touchpad + mouse with the user; test with 40+ cards and many iframes.
- ✅ Saved views, start view, lock view, Ctrl+←/→, view map (Ctrl+M) with direction travel.
  🟡 View map: grid area shows an empty border row/column and scrolls; fit it to the window,
  add a live mini-preview of the current position, keyboard arrows inside the map.
- 🟡 Expand (F / double-click top edge): add a smooth zoom transition from the card's place (FLIP).
- ✅ Undo/redo. 🟡 Undo of view-only changes is skipped on purpose — check style kits / material
  changes all undo as one step each.

**Cards**
- ✅ Notes (Markdown), export, linked notes, to-dos, links, peek, file drops onto the board.
- 🟡 Card text size / "grows with the card": confirm the console font follows (`hb-zoom` event).
- 🟡 Console (xterm.js + ConPTY): 🔴 mouse selection is offset when the board is zoomed
  (xterm reads screen coordinates; the world is CSS-scaled). Fix options: render consoles in a
  non-scaled layer positioned over the card (like the expanded layer), or compensate by patching
  `getBoundingClientRect` for the terminal element. Also: copy on right-click, paste on
  right-click (Windows Terminal style), a scrollback search (xterm search add-on).
- 🟡 Website windows: zoom + resume work. 🔴 Live mirror of an own window needs Edge's picker
  every time (`getDisplayMedia`); no API avoids it — say so in the UI, or drop the feature.
  Self-healing reload exists; YouTube crash cause unknown (could not reproduce headless).
- 🔴 Apps in cards (user asked twice): live picture of an app window from the helper
  (PrintWindow → JPEG frames over the existing stream route) + click to bring the real window
  exactly over the card. Planned design is in the 1.7–1.8 notes; not started.
- 🟡 Apps / Workspace cards: polish the picker (icons load slowly the first time — prefetch
  the Start-menu icons in the helper once and cache to disk), and "Capture" naming.

**Media & music**
- ✅ Keeps playing across boards, Now playing panel, casting paths, YouTube Music widget, picture
  frame, music hub, cover colours.
- 🟡 Now playing: the "media on your boards" list shows sound visualisers and pictures with
  camera file names (e.g. `497842438_2696…jpg`) — show nicer names (card title / "Picture"),
  group by board, and only list things that can play or be seen (hide visualisers). (Partly done
  in 1.11: visualisers hidden.)
- 🟡 Sound visualiser widget: uses its own tap client; move to `HomeboardAudio`.
- ✅ Music overlay (1.10) with styles/looks/colours; picker moved into Now playing in 1.11.
  🟡 Visual quality pass with the user: bars look thin at 100 % zoom on big screens; add
  "reflection", "mirror" and "round" (ring around the screen centre) variants; GPU path (WebGL)
  only if Canvas2D is not smooth on the user's machine.

**Looks**
- ✅ Themes, saved looks, style kits, Shuffle, materials, glass colours, backdrops (reduced in
  1.10 after feedback).
- 🟡 Liquid glass refraction: checked in screenshots only; check on the user's real board for
  speed (many cards + iframes). If slow, refract only bars/menus/dock and keep cards blurred.
- 🟡 Kit previews in Customize are small swatches; show a mini board preview per kit (render a
  tiny static mock with the kit's CSS variables).
- 🟡 Light themes (Paper, Cork) with glass materials: contrast check of muted text.

**System**
- ✅ Daily copy install, rollback, backups, helper pairing, offline.
- 🟡 Edge still loads the *working folder* for the user (path-derived ID). Walk the user
  through moving to `%LOCALAPPDATA%\Homeboard` (fixed ID) once, so updates never touch their
  data path again.

## 3. Polish checklist (apply to every feature)

1. Every action has feedback within 100 ms (hud/toast), and every destructive one has Undo.
2. Nothing jumps: transitions 120–220 ms, `prefers-reduced-motion` respected.
3. Keyboard: every panel opens/closes with keys; Esc always backs out one level.
4. Empty states explain what to do in one sentence.
5. Names in menus are short, verbs first; no technical words (helper, iframe, DNR…) in the UI.
6. Light and dark themes both checked; glass materials checked over Cover art and None.
7. Performance budget: board with 40 cards + 4 website windows pans at 60 fps on the user's PC.
8. One screenshot per changed view in the test run, looked at before shipping.

## 4. Tests

- 21 suites; the full run takes ~25 min (`scratchpad/runall.ps1` pattern: one after another).
- Flaky ones and why: `musictest` (real YouTube Music; volume step races the player),
  `webzoomtest` crash-heal (timing ~40 s; now waits), `linkstest` "Keep them the same" (toast
  timing). For 2.0: make toasts' buttons stable targets (data attributes), and give flaky waits
  a polling helper (`until(fn, ms)`), shared in `dev/lib.js` (all suites copy the same CDP code
  today — factor it out).
- Tests always need the page in front (`Page.bringToFront`) before anything drawn with
  requestAnimationFrame (xterm, overlay, visualiser).

## 5. Smoking simulator (prototype started in 1.11 — `widgets-smoke.js`)

User's idea (kept in memory too): an animated arm holds what you smoke; a lighter in the other
hand. Space: strike (random number of tries), hold to keep the flame and light it; then Space is a
draw (ember glows, burns faster, smoke on release). Ash grows and sometimes falls. Lighters run out
of gas (sparks only) → refill or change. Many things to smoke: cigarettes, Cuban-style cigars,
cigarillos, heated tobacco (holder + sticks, ~12 puffs, no flame), pipes, hand-rolled (rolling
step), vapes. A tobacco shop to choose them, with scenes: kiosk, airport, gas station, café,
supermarket. Keep all drawings original (no real brand names/logos).

2.0 work on it: hand-drawn quality (SVG with gradients and soft shadows), smoke as particles with
curl noise, the rolling step as a small drag game, sounds (optional), shop as a proper scene with
shelves and prices.

## 6. Research to reuse

- Liquid glass on the web: kube.io "Liquid Glass in the Browser: Refraction with CSS and SVG";
  LogRocket "How to create liquid glass effects with CSS and SVG"; DEV "6 ways to build it".
- Canvas spectrum/overlays: audioMotion-analyzer (options: bar outlines, reflection, overlay).
- Canvas UX: tldraw (gesture handling), Excalidraw, Figma (Space-drag), d3-zoom (wheel delta).
- Command palettes: VS Code, Raycast, Linear (⌘K) — fuzzy ranking, recent commands first.
- Now playing: Chrome's Global Media Controls, macOS Now Playing.
- Terminal: VS Code's integrated terminal (xterm.js + node-pty/ConPTY).
