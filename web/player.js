// player.js - stv shell: 320x200 indexed canvas shown 4:3, music via libopenmpt (chiptune3), pause + seek, effect jump.
// FX module API (web/fx/fxNN.js, NN=00..12):  export async function init(assets)  /  export function render(t, ctx)
//   ctx = {fb: Uint8Array(128000) palette indices (first ctx.w*ctx.h used, ctx.w = 320 unless the effect sets 640; ctx.h = 200 unless the effect sets 400), pal: Uint8Array(768) RGB 8-bit (0..255; scale 6-bit VGA values *255/63 yourself),
//          order, row (S3M position, from libopenmpt), t (music seconds, absolute)}. render fills ctx.fb and ctx.pal in place.
import { FX, DUR, fxAt, fmt, displaySize } from './timetable.js';
const $ = id => document.getElementById(id);
const cvs = $('c'), g = cvs.getContext('2d');
let img = g.createImageData(320, 200), px = new Uint32Array(img.data.buffer);
const fbuf = new Uint8Array(256000);   // 320x200, or 320x400 for effects that set ctx.h = 400 (always shown 4:3)   // effects write ctx.idx (the ported fx modules' name); ctx.fb is the same array
const ctx = { fb: fbuf, idx: fbuf, pal: new Uint8Array(768), order: 0, row: 0, t: 0, h: 200, w: 320 };
const mods = [];   // per effect: module | null (missing) | undefined (not tried)
let rgb = false, playing = false, started = false, tBase = 0, wall0 = 0, cp = null, ac = null, muted = false, drag = false;
const now = () => performance.now() / 1000;
const cur = () => playing ? Math.min(DUR, tBase + (now() - wall0)) : tBase;

const loading = [];   // per effect: in-flight load promise (one import+init per effect, shared by all callers)
function load(i) {
  return loading[i] ??= (async () => {
    try { const m = await import(`./fx/fx${String(i).padStart(2, '0')}.js`); await m.init(); mods[i] = m; }
    catch (e) { mods[i] = null; }   // not ported yet (or broken): placeholder
  })();
}
const off = document.createElement('canvas'); off.width = 320; off.height = 200;
function placeholder(i) {
  if (cvs.height !== 200 || cvs.width !== 320) { cvs.width = 320; cvs.height = 200; img = g.createImageData(320, 200); px = new Uint32Array(img.data.buffer); }
  const c = off.getContext('2d'); c.fillStyle = '#101018'; c.fillRect(0, 0, 320, 200);
  c.fillStyle = '#ff8a3d'; c.font = '16px monospace'; c.textAlign = 'center';
  c.fillText(`fx${String(i).padStart(2, '0')}: ${FX[i].name}`, 160, 95); c.fillStyle = '#888'; c.fillText('not ported yet', 160, 118);
  g.drawImage(off, 0, 0);
}
function draw(t) {
  const i = fxAt(t), m = mods[i];
  if (m === undefined) load(i).then(() => { if (fxAt(cur()) === i) draw(cur()); }); // loads async; placeholder meanwhile, redrawn once loaded
  if (!m) return placeholder(i);
  if (cp) { ctx.order = cp.order | 0; ctx.row = cp.row | 0; }
  ctx.t = t; ctx.h = 200; ctx.w = 320;
  try { m.render(t, ctx); } catch (e) { console.error('fx' + i, e); mods[i] = null; return placeholder(i); }
  if (cvs.height !== ctx.h || cvs.width !== ctx.w) { cvs.width = ctx.w; cvs.height = ctx.h; img = g.createImageData(ctx.w, ctx.h); px = new Uint32Array(img.data.buffer); }
  const p = ctx.pal;
  for (let k = 0; k < ctx.w * ctx.h; k++) { const j = ctx.fb[k] * 3; px[k] = 0xff000000 | p[j + 2] << 16 | p[j + 1] << 8 | p[j]; }
  if (rgb && i < 2) for (let r = 0; r < 120; r++) for (let x = 0; x < 320; x++) {   // fx0/fx1: each source row = 3 scanlines (R, G, B ramps): add them into one true RGB pixel, drawn on the 3 scanlines
    const a = (20 + 3 * r) * 320 + x, ca = ctx.fb[a] * 3, cb = ctx.fb[a + 320] * 3, cc = ctx.fb[a + 640] * 3;
    const v = 0xff000000 | Math.min(255, p[ca + 2] + p[cb + 2] + p[cc + 2]) << 16 | Math.min(255, p[ca + 1] + p[cb + 1] + p[cc + 1]) << 8 | Math.min(255, p[ca] + p[cb] + p[cc]);
    px[a] = px[a + 320] = px[a + 640] = v;
  }
  g.putImageData(img, 0, 0);
}
async function initAudio() {
  const { ChiptuneJsPlayer } = await import('./vendor/chiptune3.js');
  ac = new AudioContext(); cp = new ChiptuneJsPlayer({ context: ac, repeatCount: 0, interpolationFilter: 8 });
  cp.gain.connect(ac.destination);
  await new Promise(r => cp.onInitialized(r));
  const buf = await (await fetch('x14.s3m')).arrayBuffer();
  cp.onProgress(m => { if (playing && Math.abs(m.pos - cur()) > 0.25) { tBase = m.pos; wall0 = now(); } });
  cp.onEnded(() => { playing = false; tBase = DUR; sync(); });
  cp.play(buf);
}
function layout() {
  const fs = !!document.fullscreenElement, W = innerWidth, H = innerHeight;
  const { w, h } = displaySize(fs ? W : W * .96, fs ? H : H - 220, devicePixelRatio);
  $('stage').style.width = w + 'px'; $('stage').style.height = h + 'px';
}
addEventListener('resize', layout); document.addEventListener('fullscreenchange', layout); layout();
const sync = () => { $('pp').textContent = playing ? 'Pause' : 'Play'; };
async function play() {
  if (!started) { started = true; $('go').remove(); await initAudio().catch(e => console.error(e)); tBase = 0; }
  else if (cp) cp.unpause();
  if (tBase >= DUR - 0.05) seek(0);
  playing = true; wall0 = now(); ac && ac.resume(); sync();
}
function pause() { if (!playing) return; tBase = cur(); playing = false; cp && cp.pause(); sync(); }
function seek(t) { t = Math.max(0, Math.min(DUR - 0.01, t)); tBase = t; wall0 = now(); cp && cp.setPos(t); draw(t); }
const toggle = () => playing ? pause() : play();
$('pp').onclick = toggle; $('go').onclick = () => play();
$('b10').onclick = () => seek(cur() - 10); $('f10').onclick = () => seek(cur() + 10);
$('fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen();
const sk = $('seek'); sk.oninput = () => { drag = true; seek(sk.value / 10); }; sk.onchange = () => { drag = false; };
$('fxl').append(...FX.map(e => { const b = document.createElement('button'); b.textContent = `${e.i} ${e.name}`; b.title = fmt(e.t0); b.onclick = () => seek(e.t0 + 0.01); return b; }));
addEventListener('keydown', e => {
  const k = e.key, big = e.shiftKey ? 10 : 5;
  if (k.toLowerCase() === 'r') { toggleRgb(); } else if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'ArrowLeft') seek(cur() - big); else if (k === 'ArrowRight') seek(cur() + big);
  else if (k === 'ArrowUp') seek(FX[Math.max(0, fxAt(cur()) - 1)].t0 + 0.01);
  else if (k === 'ArrowDown') seek(FX[Math.min(FX.length - 1, fxAt(cur()) + 1)].t0 + 0.01);
  else if (k === 'f' || k === 'F') $('fs').click(); else if (k === 'm' || k === 'M') { muted = !muted; cp && cp.setVol(muted ? 0 : 1); }
});
function loop() {
  const t = cur(), i = fxAt(t);
  if (!drag) sk.value = Math.round(t * 10);
  $('tm').textContent = fmt(t) + ' / ' + fmt(DUR);
  [...$('fxl').children].forEach((b, j) => b.classList.toggle('on', j === i));
  if (playing) draw(t);
  requestAnimationFrame(loop);
}
$('go').textContent = 'Click or press Space to start (sound on)'; window.x14 = { seek, play, pause, cur };
draw(0); loop();

function toggleRgb() { rgb = !rgb; $('rgb').classList.toggle('on', rgb); draw(cur()); }
$('rgb').onclick = toggleRgb;
