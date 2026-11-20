// fx08 (original routine 0x512fd, entry order 33/0x21): orange organic blob = height map "bump" lookup into a 256x200 texture (DATA.DAT).
// Code read from the unpacked image (linear = flat + 0x10fc0; the routines are at flat 0x50cec..0x514b3). Per main-loop pass (one per vsync):
//  - 0x6225f: four phases (ISR counters 4e686/8a/8e/92 + 4 static zero offsets);
//  - 0x61f2c: height map H[100][128] bytes: row r: edx=(edx+6)&511, ebp=(ebp+9)&511, e=(S[edx]>>>1)+S[ebp]; column c: esi=(esi+6)&511, ebx=(ebx+9)&511,
//    H=((S[esi]+S[ebx]+e+0x400)>>>3)&255. (The add immediates are self-modified from variables 4e69a/4e69e/4e696/4e6a2, constants 6/9/6/9 here: the routine 0x621bf that changes
//    them is never called.) edx is also the inner loop's scratch register: the next row starts from the LAST pixel's full value, not from the row's phase (kept as is);
//  - 0x620a6: displacement table L[256] from two ISR phases (4e672>>2, 4e676>>2): L[i] = (S[a]*32>>8) + ((S[b]*32) & ~255), a,b += 1 (&511);
//  - 0x61ea0: pixel(r,x) = T[0x3260 + 256 r + x + L[h]] + SHADE[h] (byte add), T = the texture revealed so far (ISR 0x62106 adds 256 bytes/tick of the 64 KB buffer that
//    the pass copies from the loaded file, zero beyond 0xc800);
//  - 0x61ff4: scatter into mode X (every source pixel doubled in x: 256 px wide).
// Tick 0x62106: fade 4e36a -1/tick from order 0x24 (palette = base * fade >> 7 from then on), reveal += 0x100 (to 0x10000), 4e686 +3, 4e68a +2, 4e68e -5, 4e692 -4,
// 4e672 +7, 4e676 -9. Palette: 8 blocks of 32 colours = the 32-colour source scaled by 16*(b+1)/128 (clamped 63).
// Everything is a function of the tick count (VRAM rewritten each pass): seek is free.
import { pos as posDefault } from './timeline.js';
import { vsync, to8, load } from './common.js';
const VSYNC = vsync(8);
import { entryTime } from './entries.js';
export const E = { v: null };
let TEX, S, SHADE, PSRC, BASEPAL, posf = posDefault; export const setPos = f => { posf = f; };
export async function init(a) {
  E.v ??= entryTime(8);
  const d = await load(a, 'assets/fx08.bin'), dv = new DataView(d.buffer, d.byteOffset);
  TEX = new Uint8Array(0x10000); TEX.set(d.subarray(0, 0xc800));
  S = new Int32Array(512); for (let i = 0; i < 512; i++) S[i] = dv.getInt32(0xc800 + i * 4, true);
  SHADE = d.subarray(0xc800 + 2048, 0xc800 + 2048 + 256); PSRC = d.subarray(0xc800 + 2048 + 256, 0xc800 + 2048 + 256 + 96);
  BASEPAL = new Uint8Array(768);
  for (let b = 0; b < 8; b++) for (let j = 0; j < 96; j++) BASEPAL[96 * b + j] = Math.min(63, (PSRC[j] * 16 * (b + 1)) >> 7);
}
export const basePal = () => BASEPAL;
// ISR state after n ticks (all start at 0 except 4e676 = 128)
export const stateAt = n => ({ p1: (3 * n) & 511, p2: (2 * n) & 511, p3: (-5 * n) & 511, p4: (-4 * n) & 511, l1: (7 * n) & 0x7ff, l2: (128 - 9 * n) & 0x7ff, reveal: Math.min(0x10000, 0x100 * n) });
export function heightMap(p1, p2, p3, p4) {   // p1..p4 = 4e6be, 4e6ba, 4e6b6, 4e6c2 (= 4e686, 4e68a, 4e692, 4e68e: see 0x6225f)
  const H = new Uint8Array(12800); let edx = p1, ebp = p4, o = 0;
  for (let r = 0; r < 100; r++) {
    edx = (edx + 6) & 511; ebp = (ebp + 9) & 511;
    const e = ((S[edx] >>> 1) + S[ebp]) | 0; let esi = p2, ebx = p3;
    for (let c = 0; c < 128; c++) {
      esi = (esi + 6) & 511; ebx = (ebx + 9) & 511;
      edx = ((S[esi] + S[ebx] + e + 0x400) | 0) >>> 3; H[o++] = edx & 255;
    }
  }
  return H;
}
export function lut(l1, l2) {
  const L = new Int32Array(256); let a = l1 >> 2, b = l2 >> 2;
  for (let i = 0; i < 256; i++) { L[i] = ((S[a] * 32) >> 8) + ((S[b] * 32) & ~255); a = (a + 1) & 511; b = (b + 1) & 511; }
  return L;
}
// the 128x100 source picture [506dc] of the pass whose loop top saw n ticks. The displacement table (0x620a6) runs after the height map (0x61f2c, ~1.2 ticks of work in the
// harness) and reads the tick phases then: nl = n + 1 in all 318 harness passes (machine dependent; the ideal schedule keeps n+1).
export function picture(n, nl = n + 1) {
  const s = stateAt(n), sl = stateAt(nl), H = heightMap(s.p1, s.p2, s.p4, s.p3), L = lut(sl.l1, sl.l2), out = new Uint8Array(12800);
  const T = s.reveal >= 0x10000 ? TEX : (() => { const t = new Uint8Array(0x10000); t.set(TEX.subarray(0, s.reveal)); return t; })();
  for (let r = 0; r < 100; r++) for (let x = 0; x < 128; x++) {
    const h = H[r * 128 + x]; out[r * 128 + x] = (T[0x3260 + 256 * r + x + L[h]] + SHADE[h]) & 255;
  }
  return out;
}
// Fade 4e36a after n ticks: -1 per tick while the music order is >= 0x24 at the tick (tick j at E + j/VSYNC), floored at 0. Palette (0x62510, each pass from order 0x24) = base * fade >> 7.
export function fadeAt(n) {
  let f = 128; for (let j = 1; j <= n && f > 0; j++) if (posf(E.v + j / VSYNC).order >= 0x24) f--;
  return f;
}
// Display: mode 13h + CRTC 9 = 0x44 (5 scan lines per row), 96 rows shown; the 256 px wide picture (each source pixel doubled) sits at x = 32; displayed row y = source row y + 1
// (the page is drawn at VRAM -72 bytes). Pass k (loop top, tick count k in the IDEAL schedule: one tick and one pass per vsync) shows the picture of pass k-1; pass 0 shows empty VRAM.
// UNRESOLVED (machine dependent): the real tick/pass ratio (the harness runs ~2.0 ticks per pass), the VRAM left/right of the picture (zero in the harness).
export function render(t, ctx) {
  const k = Math.floor((t - E.v) * VSYNC + 1e-9);
  ctx.h = 96;
  if (k < 0) { ctx.idx.fill(0, 0, 96 * 320); ctx.pal.fill(0); return true; }
  const f = fadeAt(k); for (let i = 0; i < 768; i++) ctx.pal[i] = to8((BASEPAL[i] * f) >> 7);
  ctx.idx.fill(0, 0, 96 * 320);
  if (k >= 1) { const p = picture(k - 1); for (let y = 0; y < 96; y++) for (let x = 0; x < 256; x++) ctx.idx[y * 320 + 32 + x] = p[(y + 1) * 128 + (x >> 1)]; }
  return true;
}
