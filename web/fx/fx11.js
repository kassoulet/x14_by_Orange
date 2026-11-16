// fx11 (original routine flat 0x7af72, orders 0x2d..0x39): twisting 4-face texture column (160x100 buffer B) + scrolling bitmap text (320x200 buffer), mixed in a checkerboard.
// Code at flat 0x7aaa1 (column), 0x7ad26 (mode X blit), 0x8b368 (text), 0x7b097 (pass), 0x7b1dd (ISR tick). Per pass (one per vsync):
//  1. texture (512 x 100, nibbles 0..15): first `reveal` bytes forced to 6 (blank); 2. text buffer cleared if the previous text step ended a page (5b333); 3. text step when an event is pending (5b32f);
//  4. column: row y < rows: angle A = ((S[a0]>>1)+S[a1])>>1)+S[a2] & 511, radius w = ((((S[b0]>>1)+S[b1])>>1)+S[b2])>>2) + 0x180 (a += 2,1,-1 / b += -1,2,3 per tick, a += 5,3,1 / b += 5,3,2 per row);
//     x_k = (((-180 cos(A_k) + 180 sin(A_k)) >> 9) * w >> 10) + 0x50, A_k = A + 0x80 k (k = 0..4); face f spans x_f..x_f+1 when left < right: pixel = texel(row, 0x40 f + (fx >> 16)) | ((A_f + 0x80) & 0xf0),
//     fx starts at `left` (not 0: the original does that) and steps 0x400000 / width;
//  5. blit to mode X 320x400: text pixel (x, L>>1) where (x ^ L) is even, else B(2 (x>>2) + (x&1), L>>2); 6. palette = 16 shade blocks (file palette * F[j] >> 7) * fade >> 7 (max 63).
// ISR tick: reveal += 0x100 on order 0x39 (to 0xc800); on a new row with (row & 7) == 7: fade = 0x100 and one text event; fade -= 0x10 down to 0x80; phases a, b; rows (column height) 1 -> 100.
import { pos } from './timeline.js';
import { VSYNC, to8, load } from './common.js';
import { entryTime } from './entries.js';
export const E = { v: null };
let S, TEX, WID, FONT, TXT, BASE;
export async function init(a) {
  E.v ??= entryTime(11);
  const d = await load(a, 'assets/fx11.bin'), dv = new DataView(d.buffer, d.byteOffset); S = new Int32Array(641); for (let i = 0; i < 641; i++) S[i] = dv.getInt32(4 * i, true);
  TEX = d.subarray(2564, 2564 + 0xc800); WID = d.subarray(53764, 53764 + 0x24); FONT = d.subarray(53764 + 0x24, 53764 + 0x2400); TXT = d.subarray(62980, 62980 + 0x1000);
  const pal = d.subarray(67076, 67076 + 48); BASE = new Uint8Array(768);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 48; i++) BASE[48 * j + i] = Math.min(63, (pal[i] * [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256][j]) >> 7);
}
// state at the first loop top (pass 0), measured in the harness (86 ticks after the ISR started; machine dependent)
export const init0 = () => ({ reveal: 0, ev: 3, rows: 87, done: 0, fade: 0xc0, prow: 0, a: [172, 86, 426], b: [426, 172, 258] });
export function tick(s, order, row) {
  if (order === 0x39 && s.reveal !== 0xc800) s.reveal += 0x100;
  if (row !== s.prow) { s.prow = row; if ((row & 7) === 7) { s.fade = 0x100; s.ev++; } }
  if (s.fade !== 0x80) s.fade -= 0x10;
  s.a = [(s.a[0] + 2) & 511, (s.a[1] + 1) & 511, (s.a[2] - 1) & 511]; s.b = [(s.b[0] - 1) & 511, (s.b[1] + 2) & 511, (s.b[2] + 3) & 511];
  if (!s.done) { if (s.rows !== 100) s.rows++; if (s.rows === 100) s.done = 1; }
}
export const newText = () => ({ buf: new Uint8Array(64000), line: 0, x: 0, idx: 0, clr: 0 });
export function textStep(t) {   // 0x8b368: draw glyphs up to the next '@' (or the end of a 9-line page)
  for (;;) {
    const c = TXT[t.idx++];
    if (c === 0x40) return;
    if (c === 0x20) { t.x += 12; continue; }
    if (c === 0x0d) { t.line++; t.x = 0; if (t.line === 9) { t.line = 0; t.clr = 1; return; } continue; }
    const e = c - 0x61, w = e >= 0 && e < 0x24 ? WID[e] : 0; if (!w) continue;
    let o = 0; for (let i = 0; i < e; i++) o += WID[i];
    for (let r = 0; r < 28; r++) for (let k = 0; k < w; k++) { const p = t.line * 0x1b80 + t.x + r * 320 + k, v = FONT[o + r * 320 + k]; if (v && p < 64000) t.buf[p] = v; }
    t.x += w;
  }
}
const PAD = 1024;
export function column(s) {   // 0x7aaa1: 160x100 buffer B (with a pad before/after: the original writes past the row ends)
  const B = new Uint8Array(PAD + 16000 + PAD), T = s.reveal ? (() => { const t = TEX.slice(); t.fill(6, 0, s.reveal); return t; })() : TEX;
  let a = s.a.slice(), b = s.b.slice(); const X = new Int32Array(5);
  for (let y = 0; y < s.rows; y++) {
    const A = ((((S[a[0]] >> 1) + S[a[1]]) >> 1) + S[a[2]]) & 511, w = ((((S[b[0]] >> 1) + S[b[1]]) >> 1) + S[b[2]]) >> 2, R = w + 0x180;
    for (let k = 0; k < 5; k++) { const m = (A + 0x80 * k) & 511, sn = S[m], cs = S[129 + m], xx = (Math.imul(-180, cs) - Math.imul(-180, sn)) >> 9; X[k] = (Math.imul(xx, R) >> 10) + 0x50; }
    for (let f = 0; f < 4; f++) {
      const l = X[f], r = X[f + 1]; if (l >= r) continue;
      const n = r - l, st = Math.floor(0x400000 / n), sh = ((((A + 0x80 * f) & 511) + 0x80) & 0xf0); let e = l >>> 0;
      for (let i = 0; i < n; i++) { B[PAD + y * 160 + l + i] = T[y * 512 + 0x40 * f + (e >>> 16)] | sh; e = (e + st) >>> 0; }
    }
    a = [(a[0] + 5) & 511, (a[1] + 3) & 511, (a[2] + 1) & 511]; b = [(b[0] + 5) & 511, (b[1] + 3) & 511, (b[2] + 2) & 511];
  }
  return B.subarray(PAD, PAD + 16000);
}
export function compose(B, txt, out) {   // 0x7ad26: 320 x 400 displayed
  for (let L = 0; L < 400; L++) for (let x = 0; x < 320; x++) out[L * 320 + x] = ((x ^ L) & 1) ? B[(L >> 2) * 160 + 2 * (x >> 2) + (x & 1)] : txt[(L >> 1) * 320 + x];
}
export function palette(fade, out) { for (let i = 0; i < 768; i++) out[i] = Math.min(63, (BASE[i] * fade) >> 7); }
// pass preamble: text page clear / text step (needs no picture, so seeking replays only this)
export function prep(t, s) {
  if (t.clr) { t.buf.fill(0); t.clr = 0; }
  if (s.ev) { s.ev = 0; textStep(t); }
}
export function pass(t, s, out) { prep(t, s); compose(column(s), t.buf, out); }
// ---- player entry. Ideal schedule: one tick and one pass per vsync from E (= loop top of pass 0, state init0); pass k runs on the state after k ticks and is shown during vsync period k with the fade
// of one tick later (the harness' palette upload follows ~1 tick after the loop top, see tools/fxcheck11.mjs). UNRESOLVED (machine dependent): the real tick/pass ratio (the harness runs 2 ticks per
// pass), the 86 ticks before pass 0 (init0 is measured), E, what is on screen before E.
const CK = 64; let chk = [];
const cl = (s, t) => ({ s: { ...s, a: s.a.slice(), b: s.b.slice() }, t: { ...t, buf: t.buf.slice() } });
const tk = (s, j) => { const p = pos(E.v + j / VSYNC); tick(s, p.order, p.row); };
function stateAt(k) {
  if (!chk.length) chk[0] = { n: 0, ...cl(init0(), newText()) };
  const c = chk[Math.min(Math.floor(k / CK), chk.length - 1)], { s, t } = cl(c.s, c.t); let n = c.n;
  while (n < k) { prep(t, s); tk(s, ++n); if (n % CK === 0) chk[n / CK] = { n, ...cl(s, t) }; }
  return { s, t };
}
export function render(t, ctx) {
  const k = Math.floor((t - E.v) * VSYNC + 1e-9); ctx.h = 400;
  if (k < 0) { ctx.idx.fill(0, 0, 320 * 400); ctx.pal.fill(0); return true; }
  const { s, t: tx } = stateAt(k), p6 = new Uint8Array(768); pass(tx, s, ctx.idx);
  const q = { ...s, a: s.a.slice(), b: s.b.slice() }; tk(q, k + 1); palette(q.fade, p6); for (let i = 0; i < 768; i++) ctx.pal[i] = to8(p6[i]);
  return true;
}
