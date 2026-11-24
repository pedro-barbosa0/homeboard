/* Runs inside YouTube Music pages (a normal tab, or a website window on the board) so the board's
   YouTube Music widget can show what is playing and control it. It reports the player's state to the
   Homeboard pages and does what they ask: play/pause, next, previous, seek, volume, like.
   It only talks to Homeboard itself (chrome.runtime messages never reach websites). */
(() => {
'use strict';
if (window.__homeboardYtm) return;
window.__homeboardYtm = true;
const api = globalThis.browser ?? globalThis.chrome;

const bar = () => document.querySelector('ytmusic-player-bar');
const video = () => document.querySelector('video');
const press = sel => {                               // YouTube Music's own buttons, so its queue and settings stay right
  const host = bar()?.querySelector(sel);
  if (!host) return false;
  (host.querySelector('button') || host).click();
  return true;
};
let wantVolume = null;                               // a volume chosen on the board survives the next song

function state() {
  const v = video(), md = navigator.mediaSession && navigator.mediaSession.metadata, b = bar();
  const art = md && md.artwork && md.artwork.length ? md.artwork[md.artwork.length - 1].src : (b && b.querySelector('img')?.src) || '';
  const title = (md && md.title) || b?.querySelector('.title')?.textContent.trim() || '';
  return {
    title, artist: (md && md.artist) || '', album: (md && md.album) || '', art,
    playing: !!v && !v.paused && !v.ended && !!title,
    time: v ? v.currentTime || 0 : 0, duration: v && isFinite(v.duration) ? v.duration : 0,
    volume: v ? Math.round(v.volume * 100) : 100, muted: !!(v && v.muted),
    like: b?.querySelector('ytmusic-like-button-renderer')?.getAttribute('like-status') || '',
    ready: !!b,
  };
}

/* Sends only when something changes: the song, play / pause, volume, like, or the time not following on (a seek, a
   stall). The board works out the time in between itself, so a playing song is not a message every second. */
let last = '', dead = false, sentAt = 0, sentTime = 0, sentPlaying = false;
function report(force) {
  if (dead) return;
  const s = state(), key = JSON.stringify({ ...s, time: 0 });
  const expect = sentTime + (sentPlaying ? (Date.now() - sentAt) / 1000 : 0);
  const jumped = Math.abs(s.time - expect) > 2;
  if (!force && key === last && !jumped) return;
  last = key; sentAt = Date.now(); sentTime = s.time; sentPlaying = s.playing;
  try { api.runtime.sendMessage({ homeboard: 'ytm', state: s }).catch(() => {}); }
  catch { dead = true; clearInterval(beat); }        // Homeboard was reloaded or removed: stop quietly
}

const beat = setInterval(() => report(false), 1000);
setInterval(() => report(true), 10000);              // a heartbeat, so a board opened later finds this player
document.addEventListener('seeked', () => report(true), true);
document.addEventListener('play', () => report(true), true);
document.addEventListener('pause', () => report(true), true);
document.addEventListener('volumechange', () => report(true), true);
document.addEventListener('loadedmetadata', e => {
  if (wantVolume != null && e.target === video()) e.target.volume = wantVolume;
  report(true);
}, true);

api.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || (msg.homeboard !== 'ytm-do' && msg.homeboard !== 'ytm-get')) return;
  const v = video();
  if (msg.homeboard === 'ytm-do' && v) {
    const a = msg.action;
    if (a === 'toggle') { if (v.paused) v.play().catch(() => press('#play-pause-button')); else v.pause(); }
    else if (a === 'play') v.play().catch(() => press('#play-pause-button'));
    else if (a === 'pause') v.pause();
    else if (a === 'next') press('.next-button');
    else if (a === 'previous') { if (v.currentTime > 4) v.currentTime = 0; else press('.previous-button'); }
    else if (a === 'seek' && isFinite(msg.value)) v.currentTime = Math.max(0, Math.min(msg.value, v.duration || msg.value));
    else if (a === 'volume' && isFinite(msg.value)) { wantVolume = Math.max(0, Math.min(1, msg.value / 100)); v.volume = wantVolume; v.muted = false; }
    else if (a === 'mute') v.muted = !v.muted;
    else if (a === 'like') press('ytmusic-like-button-renderer #button-shape-like') || press('ytmusic-like-button-renderer .like');
    else if (a === 'dislike') press('ytmusic-like-button-renderer #button-shape-dislike') || press('ytmusic-like-button-renderer .dislike');
  }
  setTimeout(() => { reply(state()); report(true); }, msg.homeboard === 'ytm-do' ? 250 : 0);
  return true;                                       // answers after the change took effect
});
report(true);
})();
