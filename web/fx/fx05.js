// fx05 (original routine flat 0x4be79, orders 0x18/0x19): feedback "plasma". Mode 13h with CRTC 9 = 2 (3 scan lines per row), 100 rows blitted at VRAM row 14.
// Per pass (flat addresses): 0x4bc4a? radial table A[y][x] = ((x^2+y^2)>>5)&255 (x -160..159, y -100..99, built once at 0x4bc31); each pass: offset off1 into A from two sines (4a414/4a418),
// two 257-entry offset tables T1/T2 into the 4-bit picture B (0x4bd0f; sines of phases 4a444/4a448/4a43c/4a440), then for each of 160x100 source pixels (0x4bc6a):
//   d = A[off1 + 320 r + c]; lo = (B[p + T1[d]] + 3 (v & 15)) >> 2; hi = (B[p + T2[d]] + 3 (v >> 4)) >> 2; v = lo + 16 hi; written twice (x doubled); v = the previous VRAM byte => state accumulates (seek = replay).
// Palette (0x4bdf0): entry 16 hi + lo = (c[hi] + c[16 + lo]) / 2 of 32 source colours, uploaded each pass (0x4c0fd) scaled by the fade [4a00c] >> 8.
// ISR (0x4bfc6): fade +1/tick up to 0x100 while order < 0x18, then -1/tick to 0; phases 4a414 +5, 4a418 -2, 4a41c -3, 4a420 +4 (&0x7ff), 4a43c +3 (&0x1ff), 4a440 +1 (&0x1ff), 4a444 -13, 4a448 +5 (&0x7ff).
// The effect leaves when the music order is 0x19.
import { pos } from './timeline.js';
import { VSYNC, to8, load } from './common.js';
import { entryTime } from './entries.js';
export const E = { v: null };
let B, S, A, BASEPAL;
export async function init(a) {
  E.v ??= entryTime(5);
  const d = await load(a, 'assets/fx05.bin'), dv = new DataView(d.buffer, d.byteOffset);
  B = d.subarray(0, 64000); S = new Int32Array(641); for (let i = 0; i < 641; i++) S[i] = dv.getInt32(64000 + 4 * i, true);
  const src = d.subarray(64000 + 641 * 4, 64000 + 641 * 4 + 96);
  A = new Uint8Array(64000); for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) A[y * 320 + x] = ((x - 160) ** 2 + (y - 100) ** 2) >> 5;
  BASEPAL = new Uint8Array(768); for (let v = 0; v < 256; v++) for (let k = 0; k < 3; k++) BASEPAL[3 * v + k] = (src[3 * (v >> 4) + k] + src[3 * (16 + (v & 15)) + k]) >> 1;
}
export const init0 = () => ({ p14: 512, p18: 0, p1c: 125, p20: 200, p3c: 0, p40: 64, p44: 0, p48: 0, fade: 0 });
export function tick(s, order) {
  if (order < 0x18) { if (s.fade !== 0x100) s.fade++; } else if (s.fade) s.fade--;
  s.p14 = (s.p14 + 5) & 0x7ff; s.p18 = (s.p18 - 2) & 0x7ff; s.p1c = (s.p1c - 3) & 0x7ff; s.p20 = (s.p20 + 4) & 0x7ff;
  s.p3c = (s.p3c + 3) & 0x1ff; s.p40 = (s.p40 + 1) & 0x1ff; s.p44 = (s.p44 - 13) & 0x7ff; s.p48 = (s.p48 + 5) & 0x7ff;
}
const T1 = new Int32Array(257), T2 = new Int32Array(257);
export function pass(s, vram) {   // vram: Uint8Array(320 x >=114) updated in place
  const off1 = (((S[s.p14 >> 2] * 50) >> 8) + 50) * 320 + (((S[s.p18 >> 2] * 80) >> 8) + 80);
  let e = s.p44 >> 2, b = s.p48 >> 2, m = S[s.p3c] >> 2, n = S[s.p40] >> 2;
  for (let i = 0; i < 257; i++, e = (e + 2) & 511, b = (b + 2) & 511) {
    T1[i] = ((S[e] * m) >> 10) + ((S[129 + b] * m) >> 10) * 320;
    T2[i] = -(((S[e] * n) >> 10) + ((S[129 + b] * n) >> 10) * 320);
  }
  for (let r = 0; r < 100; r++) for (let c = 0; c < 160; c++) {
    const d = A[off1 + r * 320 + c], p = 0x3ed0 + r * 320 + c, o = (14 + r) * 320 + 2 * c, v = vram[o];
    const lo = (B[p + T1[d]] + 3 * (v & 15)) >> 2, hi = (B[p + T2[d]] + 3 * (v >> 4)) >> 2;
    vram[o] = vram[o + 1] = lo + 16 * hi;
  }
}
export const palette = (fade, out) => { for (let i = 0; i < 768; i++) out[i] = (BASEPAL[i] * fade) >> 8; };
// Ideal schedule: tick n then pass n per vsync from E; display of vsync k = VRAM after pass k (k >= 0) with the palette uploaded by pass k-1 (fade after tick k-1; black before).
// UNRESOLVED (machine dependent): tick/pass ratio, E, VRAM contents before the first pass (zero here).
const CK = 64; let chk = [];   // checkpoints every CK passes: {s, vram, fades}
function stateAt(k) {   // returns the VRAM after pass k (k >= 0) and the fade after tick k-1 (0 for k = 0)
  if (!chk.length) chk[0] = { n: -1, s: init0(), vram: new Uint8Array(320 * 133) };
  const c = chk[Math.min(Math.floor((k + 1) / CK), chk.length - 1)];
  const s = { ...c.s }, vram = c.vram.slice(); let n = c.n, fprev = 0;
  while (n < k) { n++; fprev = s.fade; tick(s, pos(E.v + n / VSYNC).order); pass(s, vram); if (n % CK === CK - 1) chk[(n + 1) / CK] = { n, s: { ...s }, vram: vram.slice() }; }
  return { vram, fprev };
}
export function render(t, ctx) {
  const k = Math.floor((t - E.v) * VSYNC + 1e-9); ctx.h = 133;
  if (k < 0) { ctx.idx.fill(0, 0, 320 * 133); ctx.pal.fill(0); return true; }
  const { vram, fprev: fp } = stateAt(k), p6 = new Uint8Array(768);
  ctx.idx.set(vram.subarray(0, 320 * 133)); palette(fp, p6); for (let i = 0; i < 768; i++) ctx.pal[i] = to8(p6[i]);
  return true;
}
