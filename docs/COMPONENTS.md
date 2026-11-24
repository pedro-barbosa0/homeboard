# Custom components

A custom component is a card whose look and behaviour you write: HTML, CSS and JavaScript in one file. Add one with
**Widgets → Custom component**, then pick a component from the list, **write your own**, or **design it with AI**.

Components run in a sandbox (`component.html`): they can draw, animate and react, but they cannot reach the
extension, your boards, your files or other websites' data. The board hands them what they need through the
`homeboard` object.

## Where a component lives

| | In the board | As a file |
|---|---|---|
| Made with | the editor (right-click the card → **Edit…**) | any editor or an AI coding app, in the Homeboard folder |
| Kept | with the board (and in its backups) | `components/<id>/index.html`, listed in `components/index.json` |
| Changes show | as you type | as soon as the file is saved (the card reloads it) |

`components/index.json` is a list:

```json
[
  { "id": "daynight-clock", "name": "Day & night sky", "description": "A pixel-art clock", "w": 300, "h": 220 }
]
```

`id` is the folder name (letters, digits, `-`, `_`). `w` and `h` are the card's size when it is added.

## Design with AI

Homeboard has no AI inside and sends nothing anywhere. **Design with AI** (in the card's menu, or when adding one)
writes a complete brief from your description: what you want, where the file goes, and the reference below. Copy it
into Claude Code opened in your Homeboard folder (or any AI assistant), and it writes the component; the card picks
it up by itself.

Good descriptions say what it shows, how it looks and how it moves, for example:

- "A clock like a pixel-art sky: the sun and the moon cross it with the real time, the sky changes colour at dawn
  and dusk, stars at night."
- "A vinyl record that spins while music plays, with the cover in the middle, slowing down when it pauses."
- "A to-the-minute countdown to my holidays with a big number and a small progress bar."

<!-- for-ai -->
## Reference (for people and for AI assistants)

**The file.** One self-contained HTML file (a fragment or a whole document): `<style>`, markup and `<script>`. It
fills the card: size things with `vw`/`vh`, `%` or `min()`, never fixed page sizes. Scripts run in order once the
markup is on the page.

**Rules.**

- No external scripts: only inline `<script>` runs (`<script src>` from the internet is blocked). Images, fonts and
  `fetch` to public APIs work.
- Keep it light: animate with CSS where you can; when you use `requestAnimationFrame`, run it only while something
  is changing (for example only while `homeboard.levels` is not null), and redraw a clock only when the shown value
  changes.
- Use the board's colours so it matches every theme: the CSS variables `--accent`, `--text`, `--muted`, `--surface`,
  `--raise`, `--bg`, `--border`, `--radius`, `--font`. The page background is transparent: the card sits on the
  board.
- Errors appear on the card and in the editor, so mistakes are easy to see.

**The `homeboard` object.**

| | |
|---|---|
| `homeboard.time` | the current time (a `Date`) |
| `homeboard.on('time', fn)` | `fn(date)` every second, on the second (also once right away) |
| `homeboard.theme` | `{ accent, text, muted, surface, raise, bg, border, radius, font, scheme }` |
| `homeboard.on('theme', fn)` | when the board's look changes |
| `homeboard.music` | what plays in YouTube Music: `{ title, artist, album, art, playing, time, duration, volume, colors: { vivid, dark, light } }`, or `null` |
| `homeboard.on('music', fn)` | when the song, play / pause or the cover's colours change |
| `homeboard.levels` | the sound right now: 96 bands from bass to treble, each 0–255 (a `Uint8Array`), or `null` when quiet |
| `homeboard.on('levels', fn)` | about 30 times a second while something plays, and once with `null` when it stops |
| `homeboard.size` | `{ w, h }` of the card in pixels; `homeboard.on('size', fn)` when it is resized |
| `homeboard.settings` | this card's own saved settings (an object) |
| `homeboard.save(obj)` | keeps settings with the card (merged into `homeboard.settings`; plain data, up to 50 KB) |
| `homeboard.open(url)` | opens an `http(s)` address in a new tab |
| `homeboard.control(action)` | YouTube Music: `'toggle'`, `'next'` or `'previous'` |

`on(...)` returns a function that stops listening.

**A small example: a clock in the board's accent.**

```html
<style>
  body { display: grid; place-items: center; }
  .t { font-size: min(30vw, 50vh); font-weight: 200; color: var(--accent); }
</style>
<div class="t" id="t"></div>
<script>
  homeboard.on('time', now => {
    document.getElementById('t').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
</script>
```

**Looks that follow data.** Read `homeboard.time` for the hour of the day (light by day, dark by night),
`homeboard.music.colors` for the cover's colours, `homeboard.levels` for the beat. Keep your own state with
`homeboard.save()`.

**Original work only.** Make components in your own style. Do not copy the art, logos or exact look of a game,
an app or a brand.
