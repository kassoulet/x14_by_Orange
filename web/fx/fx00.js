// fx00 (original routine flat 0xd8ef, orders 0..3, leaves at order 4): "hoplite/dune logos" radial zoom feedback.
// Three 160x120 byte buffers (R,G,B planes, state accumulates) are fed from a 256x256 texture through a 64 KB blend LUT:
//   per pixel (0xd62c): u = U0 + x*du, v = V0 + y*c (32-bit, 16.16: range test = high word 0, texel = (v>>8 &255, u>>8 &255)), c = [753b], du = 3c>>2, U0 = 0x8000 - 80 du, V0 = 0x8000 - 60 c
//   (the four phase counters 7573.. stay 0: their steps 754b.. are 0 until order 4), dh = tex_plane[v][u] (0 when out of range), buf = LUT[dh<<8 | buf].
// LUT (0xd5f3, rebuilt every pass): LUT[i<<8|j] = ((A[i] + B[j]) << 2) >> 8 & 255 with A, B = dword reads of the memory at d3ed / d4ed (256 entries each, they run past the 64-entry tables into
//   the program: pointer d5ed, loop counters d5f1/d5f2 and the SELF-MODIFIED immediate at d66d = v start of the last row of the previous pass), window M in the asset.
// Texture planes = colour table (c593 + 0x300 k) [pixel] ; textures 0,1,2 at start, order 2, order 3 (the order 3 routine 0xd86c has no ret and FALLS THROUGH into 0xd8ad: the same blob is converted again with table 3, which is what stays) (order change seen at the loop top: also resets the ISR counters 753b/753f).
// ISR tick (0xdba4): [753f]++, [753b] += [753f] >> 5.  Blit 0xd710: source pixel doubled in x, 3 VGA rows per source row from row 20: R, G+0x40, B+0x80 (DWORD adds: carries cross bytes),
//   palette (0xdd9d) = 3 ramps of 64 entries (R 0..63, G 64..127, B 128..191) of slope 0x400 (fixed: the steps 752f.. are 0x400 from the first pass).
import { pos } from './timeline.js';
import { VSYNC, to8, load } from './common.js';
import { entryTime } from './entries.js';
import { SCHED } from './sched.js';
export const E = { v: null };
let M, TAB, TEXRAW, PAL0, TEX = [], LUT = new Uint8Array(65536);
export async function init(a) {
  E.v ??= entryTime(0);
  const d = await load(a, 'assets/fx00.bin'); M = d.subarray(0, 0x500); TAB = d.subarray(0x500, 0x500 + 0xc00); TEXRAW = d.subarray(0x500 + 0xc00, 0x500 + 0xc00 + 3 * 65536); PAL0 = d.subarray(0x500 + 0xc00 + 3 * 65536, 0x500 + 0xc00 + 3 * 65536 + 768);
  for (let k = 0; k < 3; k++) { const p = new Uint8Array(3 * 65536); for (let i = 0; i < 65536; i++) for (let c = 0; c < 3; c++) p[c * 65536 + i] = TAB[(k === 2 ? 3 : k) * 768 + TEXRAW[k * 65536 + i] * 3 + c]; TEX[k] = p; }
}
export const init0 = () => ({ buf: new Uint8Array(3 * 19200), lastV: 0x12345678, first: true, tex: 0, order: 0, c: 0, f: 0 });
const dword = (o) => (M[o] | M[o + 1] << 8 | M[o + 2] << 16 | M[o + 3] << 24) >>> 0;
function buildLUT(s) {   // M patched with the state the previous pass left (first pass: as dumped at the first loop top)
  const m = M.slice(); if (!s.first) { new DataView(m.buffer).setUint32(0xd66d - 0xd3ed, s.lastV >>> 0, true); m[0xd5f1 - 0xd3ed] = 0; m[0xd5f2 - 0xd3ed] = 0; }
  const dv = new DataView(m.buffer);
  for (let i = 0; i < 256; i++) { const a = dv.getUint32(4 * i, true); for (let j = 0; j < 256; j++) LUT[i << 8 | j] = (((a + dv.getUint32(0x100 + 4 * j, true)) << 2) >>> 8) & 255; }
}
// one loop pass (top state: order at the top, c = [753b] at the top; the order handler runs first)
export function pass(s, order, c) {
  if (order !== s.order) { if (order === 2) { s.tex = 1; c = 0; } else if (order === 3) { s.tex = 2; c = 0; } s.order = order; }
  s.c = c; buildLUT(s);
  const tex = TEX[s.tex], du = (3 * c) >> 2, U0 = (0x8000 - 80 * du) | 0, V0 = (0x8000 - 60 * c) | 0, buf = s.buf;
  for (let y = 0; y < 120; y++) {
    const v = (V0 + y * c) | 0, vo = (v >>> 16) === 0 ? (v >> 8 & 255) << 8 : -1;
    for (let x = 0; x < 160; x++) {
      const u = (U0 + x * du) | 0, i = y * 160 + x, ok = vo >= 0 && (u >>> 16) === 0, o = ok ? vo | (u >> 8 & 255) : 0;
      for (let p = 0; p < 3; p++) buf[p * 19200 + i] = LUT[((ok ? tex[p * 65536 + o] : 0) << 8) | buf[p * 19200 + i]];
    }
  }
  s.lastV = (V0 + 119 * c) | 0; s.first = false;
}
export function display(s, out, ov) {   // out: Uint8Array(320 x 400); ov (fx1): 3 x 0xa00 overlay planes OR-ed into the last 16 source rows (before the +0x40/+0x80 adds)
  out.fill(0, 0, 320 * 400); const b = s.buf;
  for (let r = 0; r < 120; r++) for (let p = 0; p < 3; p++) {
    const add = [0, 0x40404040, 0x80808080][p], row = (20 + 3 * r + p) * 320, base = p * 19200 + r * 160, ob = p * 0xa00 + (r - 104) * 160;
    for (let g = 0; g < 20; g++) for (let c = 0; c < 2; c++) {
      const sx = base + 8 * g + c; let w = b[sx] | b[sx + 2] << 8 | b[sx + 4] << 16 | b[sx + 6] << 24;
      if (ov && r >= 104) { const o = ob + 8 * g + c; w |= ov[o] | ov[o + 2] << 8 | ov[o + 4] << 16 | ov[o + 6] << 24; }
      w = (w + add) >>> 0;
      for (let j = 0; j < 4; j++) { const x = 16 * g + 4 * j + 2 * c, val = (w >>> (8 * j)) & 255; out[row + x] = out[row + x + 1] = val; }
    }
  }
}
export function palette(out) { out.set(PAL0); for (let i = 0; i < 64; i++) { out[3 * i] = i; out[3 * (64 + i) + 1] = i; out[3 * (128 + i) + 2] = i; } }   // PAL0 = static bytes of the buffer at d1ad (6-bit)
// Player schedule: the HARNESS' per-pass schedule (sched.js, fitted: the pass costs 3..6 ticks depending on the zoom state and the CPU, not derived). Pass k: ORD[k] = order at its top,
// F[k] = [753f] when the LUT is built (ISR ticks since the order reset); [753b] follows from the ISR code alone: c = sum over the ticks of (f >> 5). Its picture is shown from PT[k] (frame record).
const CK = 32; let chk = [];
const cOf = f => { let c = 0; for (let i = 1; i <= f; i++) c += i >> 5; return c; };
function replay(k) {   // state after pass k (k >= 0)
  const c0 = chk[Math.min(Math.floor(k / CK), chk.length - 1)];
  let s, n; if (c0) { s = { ...c0.s, buf: c0.s.buf.slice() }; n = c0.n; } else { s = init0(); n = -1; }
  while (n < k) { n++; pass(s, SCHED.fx0.ORD[n], cOf(SCHED.fx0.F[n])); if (n % CK === CK - 1) chk[(n + 1) / CK] = { s: { ...s, buf: s.buf.slice() }, n }; }
  return s;
}
export function render(t, ctx) {
  ctx.h = 400; ctx.w = 320; const PT = SCHED.fx0.PT; let k = -1; while (k + 1 < PT.length && PT[k + 1] <= t) k++; ctx.pal.fill(0);
  if (k < 0) { ctx.idx.fill(0, 0, 320 * 400); return true; }
  const p6 = new Uint8Array(768); palette(p6); for (let i = 0; i < 768; i++) ctx.pal[i] = to8(p6[i]);
  display(replay(Math.min(k, 261)), ctx.idx); return true;
}
