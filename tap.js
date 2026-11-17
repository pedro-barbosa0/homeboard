/* Homeboard: lets the board's sound visualiser hear what this page is playing.
 *
 * Runs in every page but does nothing until a Homeboard board asks ("tap"). Then it listens to the
 * <video>/<audio> elements that are playing here, through Web Audio, and sends the board the
 * loudness per frequency band (and a little of the waveform), about 30 times a second, for as long as
 * a board is listening. No sharing dialog, no sharing bar, nothing recorded or sent anywhere else.
 *
 * Care for the page's own sound: an element is only connected once the page is allowed to play
 * Web Audio (otherwise its sound would stop), and it always stays connected to the speakers.
 */
(() => {
'use strict';
const api = globalThis.browser ?? globalThis.chrome;
if (!api?.runtime?.onMessage || window.__homeboardTap) return;
window.__homeboardTap = true;

const BANDS = 96, WAVE = 128;
let ctx = null, analyser = null, freq = null, wave = null, port = null, timer = 0, lastSent = 0;
const hooked = new WeakSet();

const playing = () => [...document.querySelectorAll('video, audio')].filter(m => !m.paused && !m.ended && m.readyState > 2 && !m.muted && m.volume > 0);

async function ready() {
  if (!ctx) {
    ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = .75;
    analyser.connect(ctx.destination);                 // the analyser passes the sound on to the speakers
    freq = new Uint8Array(analyser.frequencyBinCount);
    wave = new Uint8Array(analyser.fftSize);
  }
  if (ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, 400))]);
  return ctx.state === 'running';
}
async function hook() {
  const list = playing().filter(m => !hooked.has(m));
  if (!list.length) return playing().some(m => hooked.has(m)) ? 'ok' : 'nothing';
  if (!(await ready())) return 'blocked';               // never connect while Web Audio may not play: the page would go quiet
  for (const m of list) {
    try { ctx.createMediaElementSource(m).connect(analyser); hooked.add(m); }
    catch { /* the page already uses it with Web Audio, or it cannot be heard: leave it alone */ }
  }
  return playing().some(m => hooked.has(m)) ? 'ok' : 'nothing';
}

/* loudness per band, spaced the way we hear (40 Hz .. 16 kHz) */
function bands() {
  analyser.getByteFrequencyData(freq);
  const nyq = ctx.sampleRate / 2, out = new Array(BANDS);
  for (let i = 0; i < BANDS; i++) {
    const a = Math.floor(40 * 400 ** (i / BANDS) / nyq * freq.length), b = Math.max(a + 1, Math.floor(40 * 400 ** ((i + 1) / BANDS) / nyq * freq.length));
    let m = 0;
    for (let k = a; k < b && k < freq.length; k++) if (freq[k] > m) m = freq[k];
    out[i] = m;
  }
  analyser.getByteTimeDomainData(wave);
  const w = new Array(WAVE);
  for (let i = 0; i < WAVE; i++) w[i] = wave[Math.floor(i / WAVE * wave.length)];
  return { bands: out, wave: w };
}

function stop() {
  clearInterval(timer); timer = 0;
  try { port?.disconnect(); } catch { /* gone */ }
  port = null;
}
function start() {
  if (port) return;
  try { port = api.runtime.connect({ name: 'homeboard-tap' }); } catch { return; }   // the extension was reloaded: nothing to send to
  port.onDisconnect.addListener(() => { port = null; clearInterval(timer); timer = 0; });
  let checked = 0, state = 'nothing', quiet = false;
  timer = setInterval(async () => {
    if (!port) return;
    const now = Date.now();
    if (now - checked > 1500) { checked = now; state = await hook(); }   // a new video, the next song in a new element...
    if (state !== 'ok' || !playing().some(m => hooked.has(m))) {         // quiet, or not allowed to listen yet
      if (!quiet || now - lastSent > 1000) { quiet = true; lastSent = now; try { port.postMessage({ idle: true, blocked: state === 'blocked', title: document.title }); } catch { stop(); } }
      return;
    }
    quiet = false; lastSent = now;
    try { port.postMessage({ ...bands(), title: document.title }); } catch { stop(); }
  }, 33);
}

api.runtime.onMessage.addListener(msg => {
  if (!msg || msg.homeboard !== 'tap') return;
  if (msg.on === false) { stop(); return; }
  if (playing().length) start();                       // frames with nothing playing stay out of it
});
})();
