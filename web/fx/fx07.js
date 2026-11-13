// fx07 (original routine 0x4d5c5, entry order 28): growing colour ring. 160x100 texel picture (each texel 2x1 px, hardware rows x4 -> 320x100 in the 4:3 box).
// Code read from flat.dis: palette = 256 entries from a 48 byte table (4 nested 4-step sums, >>1, clamp 63); a 256x256 texture ring (64 KB at [0xd193], 1 row of 256 px
// per ISR tick, parameters = sine-table lookups of tick counters); the picture = a 100x80 table of word pairs (DATA.DAT blob) gives, for 4 pixels, two texture
// offsets (+ [0x4d234] = (ticks&0xff)<<8, wrapped to 64 KB); pair with offset 0 in the 2nd word = black. After order 0x1f row 0x36 the texture rows are written black.
// Seek: the texture holds only the last 256 generated rows, each a function of its own tick count => the frame is a pure function of the tick count (replayed 256 rows).
import { pos as posDefault } from './timeline.js';
import { VSYNC, to8, load } from './common.js';
import { entryTime } from './entries.js';
export const E = { v: null };
let W, S, PT, ST, pal6, posf = posDefault; export const setPos = f => { posf = f; };
export async function init(a) {
  E.v ??= entryTime(7);
  const d = await load(a, 'assets/fx07.bin'), dv = new DataView(d.buffer, d.byteOffset);
  W = new Uint16Array(16000); for (let i = 0; i < 16000; i++) W[i] = dv.getUint16(i * 2, true);
  S = new Int32Array(512); for (let i = 0; i < 512; i++) S[i] = dv.getInt32(32000 + i * 4, true);
  PT = d.subarray(32000 + 2048, 32000 + 2048 + 48); ST = [dv.getInt32(32000 + 2048 + 48, true), dv.getInt32(32000 + 2048 + 52, true)];
  pal6 = new Uint8Array(768); let o = 0;   // routine 0x4d5c5..0x4d73c
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d4 = 0; d4 < 4; d4++, o += 3)
    for (let ch = 0; ch < 3; ch++) pal6[o + ch] = Math.min(0x3f, (PT[3 * a + ch] + PT[12 + 3 * b + ch] + PT[24 + 3 * c + ch] + PT[36 + 3 * d4 + ch]) >> 1);
}
const wrap = (v, m) => v & m;
// row parameters of the loop top 0x4d7f7..0x4d912 from the tick count: amplitudes [0x4c65e..], start indices [0x4c5f0..] and second indices [0x4c600..] (12 values)
export function paramsAt(tau) {
  const sa = c => S[(c * tau) & 511];
  return [...[11, 12, 13, 14].map(c => (sa(c) + 0x100) >>> 2), ...[-13, 15, -14, 16].map(c => sa(c) & 0x1ff), ...[3, -5, 4, -6].map(c => sa(c) & 0x1ff)];
}
function genRow(tex, ptr, par, black) {   // one pass of 0x4d930..0x4db22: row at ptr (0..0xffff step 0x100)
  const amp = par.slice(0, 4), r = par.slice(4, 8), mm = par.slice(8, 12);
  for (let x = 0; x < 256; x++) {
    const v = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) v[j] = ((((S[r[j]] + S[mm[j]] + 0x200) >>> 2) * amp[j]) >>> 7) & 0xc0;
    tex[ptr + x] = black ? 0 : (v[3] | (v[0] >> 2) | (v[1] >> 4) | (v[2] >> 6));
    for (let j = 0; j < 4; j++) { r[j] = (r[j] + ST[0]) & 0x1ff; mm[j] = (mm[j] + ST[1]) & 0x1ff; }
  }
}
// one main-loop pass: `gen` rows (= ISR ticks since the previous pass) are generated with the parameters of tick count tau.
export const newState = () => ({ tex: new Uint8Array(65536), ptr: 0, q: -1 });
export function pass(c, par, gen, black) { for (let g = 0; g < gen; g++) { c.ptr = (c.ptr + 0x100) & 0xffff; genRow(c.tex, c.ptr, par, black); } c.q++; }
export function draw(c, tau, ctx) {   // blit 0x4d551 with offset [0x4d234] = (tau&0xff)<<8
  const off = (tau & 0xff) << 8, tex = c.tex; ctx.h = 100;
  for (let y = 0; y < 100; y++) for (let x = 0; x < 80; x++) {
    const i = (y * 80 + x) * 2, w0 = W[i], w1 = W[i + 1], o = y * 320 + x * 4;
    if (w1 === 0) { ctx.idx[o] = ctx.idx[o + 1] = ctx.idx[o + 2] = ctx.idx[o + 3] = 0; continue; }
    ctx.idx[o] = ctx.idx[o + 1] = tex[(w0 + off) & 0xffff]; ctx.idx[o + 2] = ctx.idx[o + 3] = tex[(w1 + off) & 0xffff];
  }
}
export function setPalette(ctx) { for (let i = 0; i < 768; i++) ctx.pal[i] = to8(pal6[i]); }
export const isBlack = (order, row) => order > 0x1f || (order === 0x1f && row >= 0x36);
// IDEAL schedule (UNRESOLVED on real hardware): ISR tick = one per vsync, one pass per vsync, so pass k has tau=k and generates 1 row (0 for k=0).
// The oracle's own schedule (Unicorn harness: ~2 ticks and 3 vsyncs per pass) is machine dependent and is only used by tools/fxcheck7.mjs to validate pass()/draw().
let cache = null;
export function render(t, ctx) {
  const k = Math.floor((t - E.v) * VSYNC + 1e-9); setPalette(ctx); ctx.h = 100;
  if (k < 0) { ctx.idx.fill(0, 0, 32000); return true; }
  let c = cache;
  if (!c || c.q >= k || k - c.q > 8) {   // seek / paused re-render: replay the last 256 passes (older rows are overwritten)
    c = newState(); const q0 = Math.max(0, k - 258); if (q0 > 0) { c.ptr = ((q0 - 1) * 0x100) & 0xffff; c.q = q0 - 1; }
  }
  for (let q = c.q + 1; q <= k; q++) { const p = posf(E.v + q / VSYNC); pass(c, paramsAt(q), q === 0 ? 0 : 1, isBlack(p.order, p.row)); }
  cache = c; draw(c, k, ctx); return true;
}
