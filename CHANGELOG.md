# Changelog

## 2.0.0 — the first public release

**Make it yours**
- **Custom components**: cards you design in HTML, CSS and JavaScript, in a sandbox that cannot reach your boards,
  files or the extension. Write one in the card's editor, keep it as a file in `components/` (reloaded the moment
  it changes), or describe it to an AI. Comes with Day & night sky, Word clock, Beat orb and Countdown.
- **Your own CSS** for the whole board, or for one card (scoped to it).
- **Design with AI** for both: a complete brief to copy into Claude Code or any assistant. Homeboard itself has no
  AI inside and sends nothing anywhere.
- **Intensity**: one dial from Calm to Wild for how much everything moves, glows and shines.
- **Backgrounds for frameless cards** (none, card, glass, dark) so clocks, visualisers and components sit with the
  cards around them.
- **Clocks**: 14 faces, 8 of them digital (flip clock, nixie tubes, LCD watch, dot matrix, thin, neon tube, LED,
  digital), and *Music around it* (a ring around a round face, an equaliser behind digits).
- **Customize, simpler**: every setting has one place, in the order you think of them: Style (kits and your own
  styles), Intensity, Colours, Cards and panels, Background, Text, Make it yours, then the board. Glass options
  show only for glass; screen visuals live in Now playing alone; the rarely used colours fold away.
- **Edge glow made of the music**: bass along the bottom, mids up the sides, highs along the top, colours flowing
  around the screen, a ripple on every beat. **Smoke break**: the cloud you breathe out follows how long you drew,
  and a **closed room** fills with haze until you open the window. **Now playing** lists only outside sources.
- **See before you pick**: the menus for clock faces, players, frames, visualisers, tables and card backgrounds open
  as galleries of live previews (the music ones play a sample song when nothing plays).
- **Colours that follow the music, smoothly**: the accent and the cover colours fade over a second and a half when
  the song changes; the pool table has a table in the album's colours; neon looks (theme, clock face, table) glow
  in your accent instead of fixed cyan, so they match the cover too.
- **Music halo** around the YouTube Music widget's cover; the visualiser's waves and backgrounds; colours from the
  cover for the clock ring, the visualiser and the halo; Frost tinted by the chosen colour.

**Smooth and light** (see `docs/PERFORMANCE.md`): on a busy board with music playing, the page is busy 54 ms per
second instead of 664; layouts 4 per second instead of 126; messages 0.2 per second instead of 21. Shared music hub
and clock, cards outside the window rest, events instead of polling, pictures kept once outside the saved board,
other tabs' changes merged in place, hidden tabs let their website windows rest.

**Fixed**: website cards unreadable on Liquid glass; the player's wave ignoring the music; the console's mouse
offset when the board is zoomed; Frost's blur covering text; "false" in Customize; see-through Paper cards; the
cassette player's label; the first click on a component only selecting the card; console cards not appearing
(2.0 work in progress); the undo history stopping after a drag that lost its mouse release; the neon pool table
repainting only under the mouse.

**Under the hood**: the board's code split into nine readable parts (`app/`), a lint-clean code base, 29 automated
test suites, docs for users (`docs/GUIDE.md`), designers (`docs/STYLING.md`, `docs/COMPONENTS.md`) and contributors
(`docs/ARCHITECTURE.md`).

## 1.x — the road here

1.1 a personal new-tab board for Edge · 1.2 Markdown notes, saved views · 1.3 YouTube Music, undo / redo · 1.4
Markdown files in Edge, file editing · 1.5 apps and workspaces, linked notes · 1.6 peek, search that finds Homeboard,
keyboard travel, website windows that zoom and remember · 1.7 a real terminal · 1.8 Now playing, casting, the view
map · 1.9 style kits, materials, liquid glass, picture frames · 1.10 music overlay, ambient mode, commands · 1.11
visuals picker, smoke break prototype · 1.12 devices and players, Frost and Disco, multi-select.
