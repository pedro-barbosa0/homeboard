# Styling Homeboard with CSS

Two places take your own CSS:

- **The whole board:** Customize → *Make it yours* → **Add your own CSS…** (also `>css` in the search box). It applies
  over the theme and the style kit, on every board.
- **One card:** right-click the card → **Style with CSS…**. It is scoped to that card and cannot spill onto the rest.

Both editors change the board as you type, and both have **Design with AI**, which writes a brief to copy into
Claude Code or any AI assistant. Clear the text to go back.

<!-- for-ai -->
## Reference (for people and for AI assistants)

**Colours and sizes.** Use the board's variables so a style follows every theme and the light / dark choice:

| Variable | What |
|---|---|
| `--accent` | the accent colour (follows the album cover when "Colours follow the music" is on) |
| `--text`, `--muted` | text, and quieter text |
| `--bg`, `--surface`, `--raise` | the page, a card, something raised over a card (menus, panels) |
| `--border` | thin borders |
| `--radius` | corner roundness of cards |
| `--font`, `--fs` | the font and the base font size |
| `--shadow` | a card's shadow |

**The page.** `body` carries the look as attributes you can select on: `[data-theme="graphite|midnight|neon|paper|cork|acrylic"]`,
`[data-material="solid|frosted|liquid|paper|outline"]`, `[data-vibe="calm|soft|balanced|lively|wild"]`,
`[data-pattern="dots|grid|lines|none"]`.

| Part | Selector |
|---|---|
| backdrop behind everything | `#backdrop` |
| the board area / the moving layer with the cards | `#canvas` / `#world` |
| top bar (search, clock, Customize) | `#topbar`, `#search`, `#clock` |
| boards list on the left | `#tabs` |
| add bar at the bottom | `#dock` |
| zoom controls | `#zoom` |
| right-click menus | `#menu`, `.menu-item` |
| Customize panel | `#settings` |
| a message at the bottom | `#toast` |

**Cards.** Every card is `#world > .card` with a type class: `.card-note`, `.card-todo`, `.card-links`, `.card-web`,
`.card-media`, `.card-files`, `.card-term`, `.card-widget`. Inside: `.card-head` (with `.card-title`) and
`.card-body`. States: `.selected`, `.tinted` (a colour was picked; `--tint`), `.bare` (a frameless widget),
`[data-surface="card|glass|dark"]` (a frameless widget's background).

**Widgets** (inside `.card-widget .card-body`):

| Widget | Root | Useful attributes / parts |
|---|---|---|
| YouTube Music | `.ytm` | `[data-look]`, `[data-bar]`, `[data-playing="1"]`, `.ytm-art`, `.ytm-title`, `.ytm-who`, `.ytm-bar`, `.ytm-btn`, `.ytm-vol` |
| Clock | `.clock-widget` | `[data-skin]`, `.clock-face`, `.clock-digits`, `.clock-time b` (hours, minutes), `.clock-sec`, `.clock-date` |
| Sound visualiser | `.viz` | `[data-bg]`, the drawing is a `canvas` |
| Picture frame | `.pf` | `[data-style]`, `[data-finish]`, `.pf-img`, `.pf-cap` |
| Custom component | `.cc` | the component itself runs in its own frame: style it in its own code |

**One card's CSS** is wrapped in `@scope` for that card: write plain selectors (`.card-body`, `.card-title`,
`.ytm-title`); select the card itself with `:scope`.

```css
:scope { border-radius: 4px; }
.card-head { background: transparent; }
.card-title { text-transform: uppercase; letter-spacing: .12em; font-size: .78em; color: var(--accent); }
.card-body { background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 18%, var(--surface)), var(--surface)); }
```

**The board's CSS** is plain CSS over everything:

```css
#world > .card { border-radius: 2px; border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); }
#world > .card.selected { box-shadow: 0 0 0 2px var(--accent), 0 0 30px color-mix(in srgb, var(--accent) 40%, transparent); }
.card-title { font-variant: small-caps; }
#dock { border-radius: 8px; }
```

**Keep it smooth.** Animate `transform` and `opacity` (they cost almost nothing); avoid animating `width`, `height`,
`box-shadow` or `filter` on many cards at once. `backdrop-filter` on many cards is heavy on slow machines.

**Original work only.** Make your own look; do not copy a brand's logos or exact design.
