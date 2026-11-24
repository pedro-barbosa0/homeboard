# Homeboard: running smoothly, wasting nothing

A review of where Homeboard spends the computer's time, memory and messages, and what to change so it stays smooth
on any machine without anyone noticing it running. Written 19 Nov 2026 against 1.12.0 (uncommitted work included).
Line numbers are as of that day.

**Status, 19 Nov 2026: done.** Everything below was carried out the same day except 4.8 (a "light" suggestion for slow
machines; the Intensity dial covers most of it). The sections describe the problem as it was; "What was done" lists
how each was solved. Every test suite passes.

### Measured: a busy board, before and after

`dev/perftest.js` on the same board in both versions: 16 YouTube Music widgets in every look and bar, two device frames,
a framed picture, a note and a clock, with a song playing (a local page with a beat, given Homeboard's YouTube Music
script). Thirty seconds of nobody touching anything, then six seconds of panning.

| Per second, song playing | Before | After |
|---|---|---|
| Main thread busy (all tasks) | 664 ms (two-thirds of every second) | **54 ms** |
| Layouts | 126 | **4** |
| Style recalculations | 198 | **33** |
| Script | 13 ms | **3 ms** |
| Messages handled | 21 | **0.2** |
| Timer callbacks | 74 | **10** |
| Animation frames drawn | 379 | **4** (sound visuals rest until there is sound) |
| **While panning** | | |
| Data written to storage | 0.8 MB | **0** (only the view, a few bytes) |
| **The saved board** | 130 KB | **4 KB** (the picture is kept once, outside it) |

The biggest single cause, found while measuring: every progress bar had a 0.25 s width animation, restarted by every
clock tick, so with many bars on a board the page did a full layout on every frame. Bars now move without animation,
only when they move by about a pixel.

### What was done

- **2.1** Widgets read the shared hub (one listener, one copy, one check-in); one clock (4 a second, nothing while hidden)
  moves every bar and only writes what changed; one shared animation loop draws every live Wave bar; picture frames use
  the same clock.
- **2.2** `ytm.js` sends only changes (song, play / pause, volume, like, a seek or stall) and a 10 s heartbeat.
- **2.3, 2.4** `tap.js` sends the bands packed in a string, the waveform only when asked, the title only when it changes;
  one receiver (`HomeboardAudio`) also serves the Sound visualiser; audible tabs come from `tabs.onUpdated`.
- **2.5** Now playing follows `tabs.onUpdated` / `onRemoved` (20 s safety check, nothing while hidden).
- **2.6** Website windows: address changes from the Navigation API; a port instead of a heartbeat (a crash is noticed at
  once); the media check runs only where there is media.
- **2.7** Blurred backdrops use 600 px covers; the helper keeps app icons on disk and the screens for 30 s.
- **3.1** Another tab's change is merged: untouched cards keep their element (`dev/synctest.js`).
- **3.2** Views are saved in `homeboard:views`; other quiet saves (where you were on a site) use `saveQuiet()`.
- **3.3, 3.4** Pictures are kept once in IndexedDB (`pic-<hash>` in the media store); the saved board, the other tabs and
  every undo step hold `hbpic:<hash>`; backups still carry the pictures; undo keeps 60 steps / 20 MB.
- **3.5** The search index is built once and thrown away on change.
- **4.1** A Homeboard tab hidden for 5 minutes lets its website windows rest while another Homeboard tab is in use
  (never one that plays); they come back where they were when the tab is shown.
- **4.2** An `IntersectionObserver` marks cards outside the window; their animations pause and their widgets skip updates.
- **4.3** Spark, ember, rainbow, wave and the Now playing bars move with transform / opacity, only while playing.
- **4.4** The overlay hides its canvas when it draws nothing, reads the accent once per frame, builds Frost once per
  step, and checks 5 times a second (not every frame) while nothing is heard.
- **4.5** The dot grid is a layer that slides.
- **4.6** Smoke uses one pre-drawn puff.
- **4.7** Liquid-glass bending only on visible cards, plain glass when more than 14 are in view, nothing redone for a
  card whose size did not change.
- **§6** A deleted console closes after two minutes (Undo still brings it back live).
- **§7** `widgets-layout.css` is linked (sizes, one accent for bars and volume); frames have a Finish: matches the board /
  classic. The arcade test presses twice if YouTube Music ignores the first press while settling into a song.

**How to read it**

- **Impact:** what you would feel. *High* means noticeable on a busy board, a slow laptop or with several Homeboard tabs.
  *Medium* is real but smaller. *Low* is tidy-up.
- **Effort:** *S* is under an hour, *M* is an afternoon, *L* is a day or more.
- Each item says what happens now, why it costs, and the fix.

---

## 1. The ten worth doing first

| # | What | Impact | Effort |
|---|------|--------|--------|
| 1 | Another tab's changes rebuild the whole board, reloading every website card (§3.1) | High | M |
| 2 | Panning or zooming saves the whole board to storage every 400 ms (§3.2) | High | S |
| 3 | Pictures and app icons are stored inside the board data, so every save and every undo step copies them (§3.3) | High | M |
| 4 | Every YouTube Music widget keeps its own copy, listener and timers instead of using the shared hub (§2.1) | High | M |
| 5 | YouTube Music sends a message every second just because the time moved (§2.2) | Medium | S |
| 6 | Hidden Homeboard tabs keep running websites, timers and listeners (§4.1) | High | M |
| 7 | Off-screen widgets keep updating and animating (§4.2) | Medium | M |
| 8 | Some animations repaint every frame, forever (box-shadow, mask, background position) (§4.3) | Medium | S |
| 9 | The sound stream sends 30 messages a second with data nothing reads (§2.3) | Medium | S |
| 10 | The smoke break builds a new gradient for every smoke puff, every frame (§4.6) | Medium | S |

---

## 2. Data and requests (music, media, sound, websites)

### 2.1 YouTube Music widgets don't share (High, M)
**Now.** Each YouTube Music widget (`widgets-music.js`, the widget built around line 290) runs its own:
- `runtime.onMessage` listener and `players` map, which is a full copy of the player state per widget;
- `find()` at start (line 447): `tabs.query` plus a message to every YouTube Music tab;
- a 250 ms timer (line 498) that rewrites the progress bar, both times and the skin, even when nothing changed;
- a 5 s full `paint()` (line 504);
- a 2 s "am I still here" watcher.

With 25 widgets that is 25 listeners, about 100 DOM updates a second and 25 repaints every 5 s, all showing the same song.
`window.HomeboardMusic` (the hub, line 29) already does this once for picture frames, Now playing and the visuals.

**Fix.**
- Widgets subscribe to the hub: one listener, one `find`, one quiet-player check.
- The hub also extrapolates time (`time + elapsed`) once.
- `send()` goes through `hub.send`. Per-widget "which player" stays possible with a hub method like `hub.pick(key)`.

### 2.2 The YouTube Music tab reports every second (Medium, S)
**Now.** `ytm.js:38` builds its change key with `Math.floor(time)`, so the key changes every second while playing.
That broadcasts a message to every Homeboard tab and to the background every second. On top of that, it sends a forced
report every 6 s (line 46).

**Fix.**
- Leave `time` out of the change key. Send on play, pause, seek, song change, volume and like, plus a 15–30 s heartbeat.
- Receivers already extrapolate the time from the moment the state arrived.
- Use `seeked` and `ratechange` events to catch jumps.

This takes it from about 3,600 messages an hour to a few dozen.

### 2.3 The sound-level stream (Medium, S)
**Now.** `tap.js:73` posts at 30 Hz: `{ bands: 96 numbers, wave: 128 numbers, title }` as JSON over a port. Only the
old Sound visualiser's wave style reads `wave`. The overlay, the live Wave bar and the beat glow use `bands`.
- Every tick also runs `playing()`, which is a `querySelectorAll('video, audio')`.
- `hook()` re-scans every 1.5 s.

**Fix.**
- Send `wave` only when a consumer asks for it (`{ want: 'wave' }` on the port).
- Send `bands` as one compact string, for example 96 chars of `String.fromCharCode(v)`, or base64. That makes it a few
  hundred bytes, not about 1.5 KB of JSON numbers.
- Drop the title from every tick and send it only when it changes.
- Keep the list of media elements and refresh it in `hook()`, not on every tick.
- Go down to 20 Hz when the Intensity dial is Calm or Soft.

### 2.4 The audio hub polls Edge every 1.5 s (Low, S)
**Now.** `widgets-more.js:794`: while anything uses levels, `tabs.query({ audible: true })` runs every 1.5 s, and
then a `tap` message goes to every audible tab, even ones already streaming.

**Fix.**
- Listen to `tabs.onUpdated` filtered to `audible` changes. That is an event, so it costs nothing while nothing changes.
- Only message tabs that have no open port.

### 2.5 Now playing polls even when closed (Low, S)
**Now.** `app.js:4600`: `refreshTabs()` plus `update(true)` every 4 s for the whole life of the page. While the panel
is open it also runs every 1.5 s (line 4586).

**Fix.** Same as 2.4: `tabs.onUpdated` (audible, title, `mutedInfo`) and `tabs.onRemoved` drive it. Keep one slow safety
poll (30 s) only while something is playing.

### 2.6 Website cards poll from inside the page (Medium, S)
**Now.** `frame.js` runs inside every website card:
- an address check every 1 s (line 61);
- an "alive" heartbeat every 4 s (line 84);
- a media check every 2.5 s (line 100), which is a `querySelectorAll` plus `JSON.stringify`.

Ten website cards means about 30 timers a second inside other people's pages.

**Fix.**
- **Address:** `navigation.addEventListener('currententrychange', …)` (Navigation API, in Edge), with `popstate` and
  `hashchange` as fallback. No timer.
- **Alive:** open a long-lived `runtime.connect` port per frame. If the page crashes, `onDisconnect` fires on the
  board's side at once. No heartbeat, and crashes are found faster than the current 15 s.
- **Media:** keep the events (already there). Run the timer only after a media element has been seen, at 5 s, and stop
  it when the page has none.

### 2.7 Small request tidy-ups (Low, S)
- **Cover palette** (`widgets-music.js:75`): cached per URL in memory. Also keep the last 50 in `storage.session` so a
  new tab doesn't re-download and re-read the cover.
- **Big covers:** `hub.big()` asks for 1200×1200 covers for the backdrop and the ambient look, and each widget sets its
  own `background-image`. That is fine because it's one URL, but use one size per use. 600 px is plenty for a blurred
  backdrop and decodes four times faster.
- **App icons (helper):** cached in memory only (`helper/server.js:198`). Cache them on disk (a small folder of PNGs
  keyed by path and size) so a helper restart doesn't spawn PowerShell for them again. Icons stored on cards are
  covered in §3.3.

---

## 3. Saving and syncing

### 3.1 Taking in another tab's changes rebuilds everything (High, M)
**Now.** `store.onExternal` (`app.js:5060`) calls `adopt()` (line 461). If the tab was hidden, it does so on the next
`visibilitychange`. `adopt()` replaces the state and calls `renderBoard()`, which removes and rebuilds every card. Website cards reload, consoles reconnect, music
widgets start over and scroll positions jump. It happens whenever two Homeboard tabs are open and you switch between
them after changing anything, including only panning.

**Fix.** Make `adopt()` a merge, not a rebuild:
1. Compare boards and cards by `id` and a cheap fingerprint, for example `rev` per card bumped on edit. Only rebuild
   cards whose data changed, `place()` cards that only moved, add new ones and remove deleted ones.
2. Ignore changes that are only views or the active board (see 3.2).
3. Re-apply settings only if they changed.

### 3.2 The view is saved like content (High, S)
**Now.** `saveView()` (`app.js:385`) marks the whole state dirty during panning and zooming, and 400 ms later
`flush()` writes the whole board set to `chrome.storage.local`. Every other Homeboard tab then gets an `onChanged`
with the full state, and goes stale or adopts (3.1).

**Fix.** Keep views out of the main record:
- Save them in their own small key (`homeboard:views` = `{ boardId: {x,y,z} }`) or in `storage.session`.
- The main state is written only when content changes.
- Other tabs don't care about your view, since each tab can keep its own.

### 3.3 Pictures live inside the board data (High, M)
**Now.** These are all stored as data URLs inside cards and settings:
- frame pictures (`widgets-music.js:630`);
- smoke packs (`widgets-smoke.js:108`);
- the custom room and pack art (`widgets.js:1039`, `1083`);
- media cards (`app.js:3059`);
- background images (`app.js:4938`);
- app icons fetched into cards (`apps.js:58`).

As a result:
- every save writes them again;
- every `onChanged` sends them to every tab;
- every undo step (`snapshot()`, up to 80 copies or 40 MB, line 414) stringifies and keeps them;
- `finderIndex()` walks past them.

**Fix.**
- Store pictures once, in IndexedDB (or `storage.local` under `img:<hash>`), keyed by a content hash.
- Cards keep only `img:<hash>`, and a small loader turns it into an object URL.
- Same pictures are stored once. Old ones are cleaned when no card uses them (a sweep on start).
- Undo snapshots and syncing shrink to a few KB.
- App icons go into the same store. They are the same for every card that has that app.

### 3.4 Undo snapshots (Medium, S, after 3.3)
**Now.** Each step is a full `JSON.stringify` of everything, kept up to 80 times.

**Fix.** After 3.3 this is already small. Further:
- Snapshot only the board that changed. Most steps touch one board.
- Lower the cap to about 50.

### 3.5 Search rebuilds its index on every key (Low, S)
**Now.** `finderIndex()` (`app.js:2798`) walks every board, card and note text on each keystroke (line 2884).

**Fix.** Build the index once and throw it away on `save()` (one flag). Typing then only scores.

---

## 4. Drawing and animation

### 4.1 Hidden Homeboard tabs keep everything running (High, M)
**Now.** Every new tab is a full Homeboard: website iframes, consoles, music widgets, timers. Edge slows timers in hidden
tabs to about once a second, but websites in iframes keep running (scripts, video decode, network), and
timers still fire.

**Fix.** A small "page is hidden" switch that everything checks or listens to:
- **Timers and loops:** stop on `visibilitychange` (hidden) and restart when shown. The music hub, the Now playing poll,
  frame healing and widget tickers. `rAF` already stops on its own.
- **Website cards:** after the tab has been hidden for a while (2 min, say), release them by setting `src` to
  `about:blank` and keeping where they were (`last`, already stored). Restore them when the tab is shown. Never do this
  to the card that is playing music (the keep-alive check, `isPlayingEl`, already knows which).
- **Other tabs:** only the most recently used Homeboard tab keeps music and website cards live. Other tabs show the
  board and load sites when they are opened. A `BroadcastChannel('homeboard')` saying "I'm the front tab" is enough.

### 4.2 Off-screen widgets keep working (Medium, M)
**Now.** Widgets and cards outside the window still:
- run their timers (YouTube Music ticks, device tickers at `widgets-music.js:597`, clocks, games);
- animate (vinyl spin, reels, VFD scroll, bar sparks, device flicker);
- draw live Wave canvases (`widgets-music.js:391`).

**Fix.**
- One `IntersectionObserver` on `#world > .card` (with a margin) toggles a class `offscreen` and a flag widgets can read.
- CSS: `.card.offscreen * { animation-play-state: paused !important; }`.
- Widgets skip `tick()` while off-screen and catch up when they come back. The time is computed, so nothing is lost.
- The live Wave joins one shared `rAF` loop that draws only on-screen bars.

### 4.3 Animations that repaint every frame (Medium, S)
These animate properties that the GPU cannot just move, so the page repaints for as long as they run, even while
paused:

| Where | Property | Fix |
|---|---|---|
| `widgets-players.css:22` fuse spark | `box-shadow`, `steps` | animate `opacity` / `transform` of two pre-drawn layers |
| `widgets-players.css:33` cigarette ember | `box-shadow` | glow as a pseudo-element, animate `opacity` |
| `widgets-players.css:59` wave mask | `mask-position` | already replaced by the canvas when live; run it only when `data-playing="1"` (it does) **and** on-screen |
| `widgets-players.css:69` rainbow | `background-position` | `transform: translateX` on an inner wide strip |
| `extras.css:350` Now playing bars | `height` (layout!) | `transform: scaleY` |
| `widgets-more.css:256` device screen flicker | `filter` | `opacity` of an overlay |
| `widgets.css:97-98` pack burn / glow | `height`, `filter` | `transform: scaleY` + `opacity` overlay |

Also run all of them only while the song plays (`[data-playing="1"]`) and on-screen (4.2).

### 4.4 The screen-visuals layer (Medium, S)
- **Pulse-only mode.** With the overlay off but Intensity on Lively or Wild, the loop still clears a full-screen
  canvas at up to 2× resolution every frame (`app.js:833`). Hide the canvas (`display: none`) when the style is off.
  Better still, run the beat detection without the canvas (it needs only the bands).
- **`colourAt()`** (`app.js:793`) calls `getComputedStyle(document.documentElement)` for the accent on every bar,
  every frame. Since the beat glow writes `--beat` on cards every frame, each of those calls can force a style
  recalculation. Read the accent once per frame, or on `applySettings()`, into a variable.
- **Frost.** Each frame redraws the full-screen texture and a full-screen mask. Draw the masked frost once per
  `reach` step (quantise `reach` to about 20 levels and cache those canvases). Frames between only add sparkles.
- **Backdrop blur of Frost** (`#fx-frost`) is a full-screen `backdrop-filter`. Fine, but turn it off when Intensity
  is Calm, and skip it when the window is large and the GPU is weak (see 4.8).

### 4.5 Panning repaints the dot grid (Low, S)
**Now.** `applyView()` (`app.js:1400`) moves the dot pattern by changing `--gx`/`--gy` on `#canvas` every frame of a
pan. That repaints the whole background.

**Fix.** Put the pattern on its own layer (a pseudo-element bigger than the screen by one grid step) and move it with
`transform: translate(x mod step, y mod step)`. Moving a layer costs the GPU nothing.

### 4.6 Smoke break drawing (Medium, S)
**Now.** `widgets-smoke.js:483` creates a `createRadialGradient` for every smoke particle (up to 500) every frame,
and fills the arcs.

**Fix.**
- Pre-render one soft puff sprite (a 64 px canvas) at start and `drawImage` it scaled with `globalAlpha`. Same look,
  a fraction of the work.
- Cap particles at about 250.
- Skip the sizzle and ash bits when the frame takes longer than 20 ms.

### 4.7 Liquid glass and frosted materials (Medium, M)
**Now.** The liquid-glass lens (`app.js:1035`) gives every card an SVG `feDisplacementMap` backdrop filter. Frosted
and liquid both blur what is behind every card. On boards with many cards, this is the most GPU work Homeboard asks for.
(While panning it already falls back to plain blur, which is good.)

**Fix.**
- Apply the lens only to cards on screen (4.2's observer).
- With more than about 12 visible cards, use the plain-blur version for all of them.
- Share one filter per size bucket. This is partly done.
- Calm on the Intensity dial turns refraction off.

### 4.8 A "light" switch for slow machines (Low, M)
On first start, measure a few frames (or read `navigator.hardwareConcurrency` and `deviceMemory`). If the machine is
weak, suggest the light defaults once:
- Calm or Soft;
- no refraction;
- Frost without the backdrop blur;
- an overlay at 30 fps.

Offer it as a choice. Never switch on its own.

---

## 5. Memory

- **Undo:** see 3.3 and 3.4. This is the largest memory user on boards with pictures.
- **Kept-alive cards:** `.card.away` (music kept playing from other boards) are removed after 30 s when not playing
  (`app.js:4236`). Fine. Also remove them when their board is deleted. Today it waits for the sweep.
- **Detached widget roots:** several widgets stop their timers only after noticing `!root.isConnected` on their next
  tick (and only after `was`). Give widgets a `destroy()` that the card calls when it is removed. That is cleaner, and
  nothing lingers for up to 5 s. Every widget would then use one shared clock (2.1, 4.2) and need no timer of its own.
- **Cover images:** each look sets its own background image of the big cover. Have one `<img>` per URL in a hidden
  cache, decode it once (`img.decode()`) and use `object URL`s from the hub.

---

## 6. The helper (Node, PowerShell)

- **Bridge process:** stays up 10 minutes after the last use (`helper/server.js:189`). Good. Startup is the expensive
  part, so the disk icon cache (2.7) matters more than the idle time.
- **Consoles:** closed after 8 h unused (line 152). Also close a console when its card is deleted, not only after
  8 h. Today the session stays until the sweep.
- **`/win/list` and friends** (`apps.js:378`) ask for windows, screens and apps together every time the picker opens.
  Cache `apps/list` for 10 minutes and `screens` until the display changes (`system.display.onDisplayChanged`).

---

## 7. Small fixes found along the way

- **Arcade play button.** The music test's check "its play button pauses / plays YouTube Music" fails (`false -> false`).
  The click-wheel's button, using the same `hub.send('toggle')`, passes. Likely cause: the hub's `current()` still points
  at the YouTube Music state from before the earlier player section's toggles, or the click toggles twice. Check with
  `hub.state()` before and after the click. If 2.1 is done, both paths share one hub and this probably goes away.
- **`widgets-layout.css` is written but not linked** in `index.html`, and `scratchpad/patch49.js` (the device "Finish"
  menu) was never applied. These are the responsive YouTube Music layouts and the theme-matched devices from the
  earlier feedback (pill sizes, vinyl hidden when there's room, volume colour on every player).
- **Volume sliders** use red on several players instead of the theme or cover colour. Covered by `widgets-layout.css`.
- **Test hooks in shipping code.** `window.__hbSmokeSpeed` and `layer.hbState` (`widgets-smoke.js`) are harmless, but
  group them behind one `window.__hbTest` object so they are easy to spot or strip.
- **"Smoke break" deleted** showed up in a screenshot while smoking. If nobody pressed Delete, check whether a key used
  by the smoke session (Space, Esc) reaches the board's delete handling when the card is selected.
- **Two cassette fixes and the stray "false" text** are done (1.12.0). Kept here only so the list is complete.

---

## 8. Checking the difference afterwards (only once, at the end)

There's no need to measure each fix. Once a batch is done, one comparison on a "busy board" is enough, for example a
copy of the MU board: 25 music widgets, 6 website cards, a console, liquid glass, Frost on, Wild.

A small `dev/perftest.js` (same CDP pattern as the other tests) that, over 30 s each:
1. **Messages:** counts `runtime.onMessage` and port messages per second (wrap the listeners).
2. **Timers:** counts `setInterval` and `setTimeout` callbacks per second (wrap them before the page loads, with
   `Page.addScriptToEvaluateOnNewDocument`).
3. **Main thread:** `Performance.getMetrics` gives `TaskDuration`, `ScriptDuration`, `LayoutDuration` and
   `RecalcStyleDuration` deltas.
4. **Frames:** paint count, using the `Tracing` domain or `PerformanceObserver` for `long-animation-frame`.
5. **Storage:** bytes written per minute while panning (hook `storage.local.set`).
6. **Memory:** `Runtime.getHeapUsage` after 10 undo steps.

Run it on the current version, save the numbers, then run it again after the work. That's the whole before/after.

---

## 9. Suggested order

This fits the 2.0 "clean and polish" plan (`docs/ROADMAP-2.0.md`):

1. **Quick wins, about one sitting:** 3.2, 2.2, 2.3, 4.3, 4.4, 4.6, 2.5, 3.5.
2. **Sharing:** 2.1 (widgets on the hub, one clock) with 4.2 (off-screen pause), then 2.4 and 2.6.
3. **Data:** 3.3 (pictures out of the board data) then 3.4. This needs a migration of existing boards, so do it with a
   backup step (the update snapshot already exists).
4. **Tabs:** 3.1 (merge, don't rebuild) and 4.1 (hidden and other tabs rest).
5. **Polish:** 4.5, 4.7, 4.8, §5, §6, §7.
6. **Measure once** (§8).
