// fx10 (original routine flat 0x5a9a4, orders ~0x2a..0x2d): 128x120 rotating/warping quad textured from a 256x256 texture, fed back into the texture and averaged with the previous image.
// Per pass (code at linear 0x6b54d..0x6bbee, flat = linear - 0x10fc0):
//  1. render: four corners (+-64, +-64) * 1124/4 rotated by 4 angles (A0..A3, from ISR phases, see angles()), +0x80 -> quad in texture space; left edge c0->c2, right edge c1->c3 split in 120 rows,
//     each row = 128 texels along (x,y) += step (a packed 32-bit add: the y carry goes into x); new = ((4 texels + old buffer) >> 1) & 0x7f7f7f7f (dword add, temporal feedback) -> buf 128x120;
//  2. vsync; palette = table * fade >> 7 (max 63); buf shown 256 px wide (each pixel doubled) at x = 32; left/right strips (32 px each) are the picture;
//  3. buf copied into the texture at (70,70) (stride 256) => state accumulates in texture + buf; 4. angles from the phases.
// ISR: phases 7a +6, 7e +5, 82 +4, 8a +0x31, 8e +0x1fd1, 92 +0x1fd3, 96 +0x27 (&0x1fff); fade [5855e]: from 512 down to 0x80 by 8 per tick; from order 0x2c, once row >= 0x10: -2 per tick to 0.
// The texture is halved (>>1 & 0x7f per byte, first 0xfde8 bytes) before the loop. Seek = replay from E with checkpoints.
import { pos } from './timeline.js';
import { vsync, to8, load } from './common.js';
const VSYNC = vsync(10);
import { entryTime } from './entries.js';
export const E = { v: null };
let PIC, TEX0, S, PAL;
export async function init(a) {
  E.v ??= entryTime(10);
  const d = await load(a, 'assets/fx10.bin'), dv = new DataView(d.buffer, d.byteOffset);
  PIC = d.subarray(0, 64000); TEX0 = d.slice(64000, 64000 + 65536); for (let i = 0; i < 0xfde8; i++) TEX0[i] = (TEX0[i] >> 1) & 0x7f;
  S = new Int32Array(641); for (let i = 0; i < 641; i++) S[i] = dv.getInt32(64000 + 65536 + 4 * i, true);
  PAL = d.subarray(64000 + 65536 + 641 * 4, 64000 + 65536 + 641 * 4 + 768);
}
export const init0 = () => ({ p7a: 0, p7e: 0, p82: 0, p8a: 0, p8e: 0, p92: 0, p96: 0, fade: 512 });
export function tick(s, order, row) {
  if (order >= 0x2c) { if (row >= 0x10 && s.fade) s.fade -= 2; } else if (s.fade !== 0x80) s.fade -= 8;
  s.p7a = (s.p7a + 6) & 0x1fff; s.p7e = (s.p7e + 5) & 0x1fff; s.p82 = (s.p82 + 4) & 0x1fff; s.p8a = (s.p8a + 0x31) & 0x1fff;
  s.p8e = (s.p8e + 0x1fd1) & 0x1fff; s.p92 = (s.p92 + 0x1fd3) & 0x1fff; s.p96 = (s.p96 + 0x27) & 0x1fff;
}
export function angles(s) {   // 0x6bbee: the four corner angles
  const b = (S[s.p7a >> 4] + S[s.p7e >> 4] + S[s.p82 >> 4]) << 2;
  return [(b + S[s.p8a >> 4]) & 0xfff, (b + S[s.p8e >> 4]) & 0xfff, (b + S[s.p92 >> 4]) & 0xfff, (b + S[s.p96 >> 4]) & 0xfff];
}
const CORN = [[-64, -64], [64, -64], [-64, 64], [64, 64]];
const N = 120, Lx = new Int32Array(N), Ly = new Int32Array(N), Rx = new Int32Array(N), Ry = new Int32Array(N);
function edge(ax, ay, bx, by, X, Y) {
  const sy = Math.trunc(((by - ay) << 8) / N), sx = Math.trunc(((bx - ax) << 8) / N); let x = ax << 8, y = ay << 8;
  for (let i = 0; i < N; i++) { X[i] = x; Y[i] = y; x = (x + sx) | 0; y = (y + sy) | 0; }
}
export function quad(A, tex, buf) {   // A = 4 angles; tex 64 KB, buf 128x120 updated in place
  const P = A.map((a, i) => { const m = a >> 3, sn = S[m], cs = S[129 + m], x = (CORN[i][0] * 1124) >> 2, y = (CORN[i][1] * 1124) >> 2;
    return [((Math.imul(x, cs) - Math.imul(y, sn)) >> 16) + 0x80, ((Math.imul(y, cs) + Math.imul(x, sn)) >> 16) + 0x80]; });
  edge(P[0][0], P[0][1], P[2][0], P[2][1], Lx, Ly); edge(P[1][0], P[1][1], P[3][0], P[3][1], Rx, Ry);
  for (let j = 0; j < N; j++) {
    let e = ((Lx[j] << 16) | (Ly[j] & 0xffff)) | 0;
    const stp = ((((Rx[j] - Lx[j]) >> 7) << 16) | (((Ry[j] - Ly[j]) >> 7) & 0xffff)) | 0;
    for (let q = 0; q < 32; q++) {
      let w = 0;
      for (let i = 0; i < 4; i++) { w |= tex[(((e >> 8) & 255) << 8) | ((e >>> 24) & 255)] << (8 * i); e = (e + stp) | 0; }   // dh = y bits 15..8 (row), x byte = bits 31..24
      const o = j * 128 + 4 * q, old = buf[o] | buf[o + 1] << 8 | buf[o + 2] << 16 | buf[o + 3] << 24, n = (((w + old) >>> 0) >>> 1) & 0x7f7f7f7f;
      buf[o] = n & 255; buf[o + 1] = (n >>> 8) & 255; buf[o + 2] = (n >>> 16) & 255; buf[o + 3] = n >>> 24;
    }
  }
}
// ---- pass + screen. scr = 320 x 120 displayed index plane (picture strips, buf doubled in x at x = 32)
export const newState = () => ({ tex: TEX0.slice(), buf: new Uint8Array(128 * 120), scr: (() => { const s = new Uint8Array(320 * 120);
  for (let y = 0; y < 120; y++) for (let x = 0; x < 32; x++) { s[y * 320 + x] = PIC[y * 320 + x]; s[y * 320 + 288 + x] = PIC[y * 320 + 32 + x]; } return s; })() });
export function pass(st, A) {   // render, blit, feed the texture
  quad(A, st.tex, st.buf);
  for (let y = 0; y < 120; y++) for (let x = 0; x < 256; x++) st.scr[y * 320 + 32 + x] = st.buf[y * 128 + (x >> 1)];
  for (let y = 0; y < 120; y++) st.tex.set(st.buf.subarray(y * 128, y * 128 + 128), 0x4646 + y * 256);
}
export const palette = (fade, out) => { for (let i = 0; i < 768; i++) out[i] = Math.min(63, (PAL[i] * fade) >> 7); };
// ---- player entry. Ideal schedule: one tick + one pass per vsync from E (the first loop top, which has already seen 1 tick); pass k renders with the phases after k+1 ticks (pass 0: static zero
// angles), its palette upload happens after the next tick (fade after k+2 ticks) and it is shown during vsync period k. UNRESOLVED (machine dependent): tick/pass ratio (the harness runs 1-3
// ticks per pass), E, the 23 passes whose palette upload is interleaved with a tick, the VRAM rows outside the 120 drawn (not displayed).
const CK = 64; let chk = [];
const tk = (s, j) => { const p = pos(E.v + (j - 1) / VSYNC); tick(s, p.order, p.row); };
function stateAt(k) {
  if (!chk.length) { const s = init0(); tk(s, 1); chk[0] = { n: -1, s, st: newState() }; }   // ticks done = n + 2
  const c = chk[Math.min(Math.floor((k + 1) / CK), chk.length - 1)], s = { ...c.s }, st = { tex: c.st.tex.slice(), buf: c.st.buf.slice(), scr: c.st.scr.slice() };
  let n = c.n, fade = 0;
  while (n < k) {
    n++; pass(st, n ? angles(s) : [0, 0, 0, 0]); tk(s, n + 2); fade = s.fade;   // s now = phases after n+2 ticks = the next pass's top; the upload fade is the same value
    if (n % CK === CK - 1) chk[(n + 1) / CK] = { n, s: { ...s }, st: { tex: st.tex.slice(), buf: st.buf.slice(), scr: st.scr.slice() } };
  }
  return { st, fade };
}
export function render(t, ctx) {
  const k = Math.floor((t - E.v) * VSYNC + 1e-9); ctx.h = 120;
  if (k < 0) { ctx.idx.fill(0, 0, 320 * 120); ctx.pal.fill(0); return true; }
  const { st, fade } = stateAt(k), p6 = new Uint8Array(768);
  ctx.idx.set(st.scr); palette(fade, p6); for (let i = 0; i < 768; i++) ctx.pal[i] = to8(p6[i]);
  return true;
}
