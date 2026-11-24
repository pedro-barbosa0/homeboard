# Homeboard brand

## The idea

Homeboard's mark is a small, chunky, friendly computer with a carry handle. It's a nod to the rugged school laptops a
whole generation of Portuguese kids grew up with in the late 2000s (the *Magalhães*): bright blue, rounded, tough,
made to be carried around and to be *yours*. Its screen holds the cards of a board, the colourful notes and widgets
that are Homeboard. Under the screen sits a small four-point star: a navigator's star, for the explorer that laptop
was named after, and for finding your way around your own boards.

The mark is original. It does not use the Magalhães name, logo or artwork.

**Personality:** friendly, sturdy, playful, never loud on its own. It sits in your browser every day, so it should feel
like a good tool you're fond of.

## Files

| File | Use |
|---|---|
| `logo.svg` (same as `/icon.svg`) | The mark, any size from 32 px up |
| `icon-small.svg` | The mark redrawn for 16 px (tabs, toolbar): fewer, bigger shapes |
| `/icons/icon-16.png` … `icon-128.png` | The extension's icons (16 from `icon-small.svg`, the rest from `logo.svg`) |
| `wordmark-light.png` / `wordmark-dark.png` | Mark + name + line, for light / dark backgrounds (README header) |
| `social-preview.png` | 1280 × 640, the repository's social preview (GitHub → Settings → Social preview) |

In the README, show the right wordmark for the reader's theme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/wordmark-dark.png">
  <img src="docs/brand/wordmark-light.png" alt="Homeboard" width="480">
</picture>
```

## Colours

| Name | Hex | Where |
|---|---|---|
| Homeboard blue | `#1F63D2` | the shell; the main brand colour |
| Shell light | `#3B86F0` | top of the shell, highlights |
| Shell deep | `#174BA8` | bottom of the shell, the handle |
| Navy | `#0E2A5A` | the screen, text on light |
| Bezel white | `#F4F7FB` | the bezel, the star, text on blue |
| Sun | `#FFC93C` | card |
| Sky | `#8EC5FF` | card, links on dark |
| Leaf | `#39C27F` | card |
| Coral | `#FF6B5E` | card |

The four card colours are for small accents and illustrations. Big areas stay blue, navy or white.

## Type

The name is written in lower case, **homeboard**, heavy (800) and tightly spaced, in the system's UI typeface
(Segoe UI on Windows, SF on macOS, the system sans elsewhere). The line under it ("your new tab, your way") is
semibold (600). The app itself already uses the system typeface, so the brand and the product read as one.

## Using the mark

- Keep clear space around it of at least the height of the handle.
- Don't recolour the shell, rotate it, stretch it, or add effects beyond a soft shadow on busy backgrounds.
- At 16 px use `icon-small.svg`, not a scaled-down `logo.svg`.
- On a blue background, sit the mark on a white or navy tile so the shell doesn't disappear.
