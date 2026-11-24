# Contributing

Thank you for helping. Homeboard is plain HTML, CSS and JavaScript with no build step: edit a file, open a new tab,
see the change.

## Run it from the folder

1. Clone the repository.
2. `edge://extensions` (or `chrome://extensions`) → **Developer mode** → **Load unpacked** → the folder.
3. Open a new tab. Changes to the page's files show on the next new tab; changes to `manifest.json`, `background.js`
   or the scripts that run in other pages (`frame.js`, `tap.js`, `ytm.js`) need **Reload** on the extensions page.

## Where things are

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) maps the code. In short: the board is `app/00-core.js` …
`app/08-main.js`, widgets are `widgets*.js`, custom components run in `component.html`.

## Tests

The tests drive a headless Microsoft Edge through the DevTools protocol (Node 18 or newer, no packages needed):

```
node dev/exttest.js <path to this folder> <a new empty folder>
```

Each suite prints `PASS` / `FAIL` lines and a total. Some need more: `musictest` the internet, `filestest`,
`helpertest` and `appstest` the helper (`tools/start-helper.ps1`) on Windows. Please run the suites near what you
changed, and add checks for what you add.

## Style

- Plain modern JavaScript, no framework, no build. Two spaces, single quotes, semicolons.
- Comments say *why* and what a part is for, in plain words.
- Keep it light: animate `transform` / `opacity`; run `requestAnimationFrame` only while something changes; prefer
  events to polling; nothing runs for a card that is off screen or a tab that is hidden.
- Interface text is short, plain English, and says what happens.
- No tracking, no network calls of Homeboard's own. Anything new that needs a permission explains why in
  [docs/PRIVACY.md](docs/PRIVACY.md).

## Components and looks

To share a component, send its folder (`components/<id>/index.html`) and its line for `components/index.json`.
Original work only: no copied game art, logos or brand designs.
