// fx02 (original routine 0x2939d, entry order 9/0x9): feedback rotozoom of a 160x100 buffer, 16 colours-ramp palette, ISR bump at order 13.
// Code read from the unpacked image (linear = flat + 0x10fc0; main routine 0x3a35d.., helpers 0x39f54..0x3a35c, ISR 0x3a828..0x3aab0). Init: 256x256 noise map (32x32 cells of 8x8:
// value = min(seed&255,0x7f) over 5 columns, 3 columns zero; seed LCG 'rcr 5 / imul 0x8e461 / rcl 2 / add 0x543 / rcr 6' with the carry chain), blurred twice in place (4 neighbours >> 2);
// colour table T[old<<8|noise] = hi byte of (A[old] + B[noise]) (tables A, B in the image). Per pass (one per vsync):
//  - top: s = (sin[c1c] + 0x20) << 4 (c1c = ISR counter);
//  - 0x39f54: four corners (+-64, +-50) scaled per axis by 28f62+4i / 28f72+4i (>>2), rotated by the angle 28f82+4i (sin/cos tables), then +(128, 80): texture coordinates (8.8);
//    0x3a142: 100 row start/end vectors (left edge TL->BL, right edge TR->BR, 8.8 fixed point, idiv by 100), 160 px per row, step (end-start)>>7 (both 16-bit halves packed in one dword add!);
//  - pixel = T[old pixel << 8 | noise[v_int<<8 | u_int]] (feedback on the buffer itself);
//  - order 13: the ISR sets a clear flag (buffer = 0x7f) and the CRTC bump (start address = (sin[ph]*amp >> 10) * 80, amp decays 1 per tick from 256); order 14 row >= 0x3c: freeze + clear;
//  - at the end of the pass the corner parameters for the next pass are computed from the ISR phases (16 counters +steps per tick, &0x1fff) and s.
// ISR tick (one per vsync in the ideal schedule): see TICK below.
import { pos as posDefault } from './timeline.js';
import { VSYNC, to8, load } from './common.js';
import { entryTime } from './entries.js';
export const E = { v: null };
let S, A, B, PAL, ini, NOISE, T, posf = posDefault; export const setPos = f => { posf = f; };
const rcr = (v, cf, n) => { const V = (BigInt(cf) << 32n) | BigInt(v >>> 0), R = ((V >> BigInt(n)) | (V << BigInt(33 - n))) & ((1n << 33n) - 1n); return [Number(R & 0xffffffffn) | 0, Number(R >> 32n)]; };
const rcl = (v, cf, n) => { const V = (BigInt(cf) << 32n) | BigInt(v >>> 0), R = ((V << BigInt(n)) | (V >> BigInt(33 - n))) & ((1n << 33n) - 1n); return [Number(R & 0xffffffffn) | 0, Number(R >> 32n)]; };
export function makeNoise() {
  const N = new Uint8Array(65536 * 3), o = 65536; let seed = 0xf01bb6 | 0, p = 0;
  for (let r = 0; r < 32; r++) for (let b = 0; b < 32; b++) {
    const v = Math.min(seed & 255, 0x7f);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) N[o + p + y * 256 + x] = v;
    p += 8;
    let [e] = rcr(seed, 0, 5); const m = BigInt.asIntN(64, BigInt(e) * 0x8e461n), lo = Number(BigInt.asIntN(32, m)); let cf = BigInt(lo) === m ? 0 : 1;
    let [e2, c2] = rcl(lo, cf, 2); const s = (e2 + 0x543) >>> 0; cf = s < (e2 >>> 0) ? 1 : 0; [seed] = rcr(s | 0, cf, 6);
    void c2;
    if (b === 31) p += 0x700;
  }
  for (let k = 0; k < 2; k++) for (let i = 0; i < 65536; i++) { const q = o + i; N[q] = (N[q + 1] + N[q - 1] + N[q - 256] + N[q + 256]) >> 2; }
  return N.subarray(o, o + 65536);
}
export async function init(a) {
  E.v ??= entryTime(2);
  const d = await load(a, 'assets/fx02.bin'), dv = new DataView(d.buffer, d.byteOffset), r = (o, n) => Int32Array.from({ length: n }, (_, i) => dv.getInt32(o + 4 * i, true));
  S = r(0, 641); A = r(2564, 256); B = r(3588, 256); PAL = d.subarray(4612, 5380);
  ini = a => dv.getInt32(a >= 0x28f62 ? 5548 + a - 0x28f62 : a >= 0x26d1c ? 5380 + a - 0x26d1c : 5520 + a - 0x26500, true);   // initial dword at flat address a
  NOISE = makeNoise(); T = new Uint8Array(65536);
  for (let i = 0; i < 256; i++) for (let j = 0; j < 256; j++) T[i * 256 + j] = ((A[i] + B[j]) >> 8) & 255;
}
export const tables = () => ({ S, NOISE, T, PAL, ini });
// ---- one pass: render F (160x100, feedback) with the corner parameters c = [28f62..6e (x scale), 28f72..7e (y scale), 28f82..8e (angle)] ----
const CX = [-64, 64, -64, 64], CY = [-50, -50, 50, 50];
export function corners(c) {
  const X = new Int32Array(4), Y = new Int32Array(4);
  for (let i = 0; i < 4; i++) {
    const k = c[8 + i] >>> 3, s = S[k], co = S[k + 129], a = Math.imul(CX[i], c[i]) >> 2, b = Math.imul(CY[i], c[4 + i]) >> 2;
    X[i] = (Math.imul(a, co) - Math.imul(b, s)) >> 16; Y[i] = (Math.imul(b, co) + Math.imul(a, s)) >> 16;
    X[i] += 0x80; Y[i] += -20 + 100;
  }
  return [X, Y];
}
const idiv = (a, b) => (a / b) | 0;   // truncating, as idiv
export function renderPass(F, c) {
  const [X, Y] = corners(c);
  const lsx = idiv((X[2] - X[0]) << 8, 100), lsy = idiv((Y[2] - Y[0]) << 8, 100), rsx = idiv((X[3] - X[1]) << 8, 100), rsy = idiv((Y[3] - Y[1]) << 8, 100);
  for (let r = 0; r < 100; r++) {
    const xl = (X[0] << 8) + r * lsx, yl = (Y[0] << 8) + r * lsy, xr = (X[1] << 8) + r * rsx, yr = (Y[1] << 8) + r * rsy;
    let edx = ((xl << 16) | (yl & 0xffff)) | 0; const esi = ((((xr - xl) >> 7) << 16) | (((yr - yl) >> 7) & 0xffff)) | 0;
    for (let i = 0, o = r * 160; i < 160; i++, o++) {
      const n = NOISE[(((edx >>> 8) & 255) << 8) | ((edx >>> 24) & 255)];
      F[o] = T[(F[o] << 8) | n]; edx = (edx + esi) | 0;
    }
  }
}
// ---- ISR state (per tick) and corner parameters (end of pass) ----
const PA = [0x26d52, 0x26d56, 0x26d5a, 0x26d5e, 0x26d62, 0x26d66, 0x26d6a, 0x26d6e, 0x26d72, 0x26d76, 0x26d7a, 0x26d7e, 0x26d82, 0x26d86, 0x26d8a, 0x26d8e];
const STEP = [6, 5, 4, 0, 0x13, 0x1fef, 0x1ff1, 0x13, 0xd, 0x1ffa, 0x11, 0xe, 0x10, 0x1ff0, 0xe, 0x1ff2];
export const newSim = () => ({ ph: Int32Array.from(PA, ini), c1c: ini(0x26d1c), amp: ini(0x26500), f08: ini(0x26508), i0c: ini(0x2650c), f14: ini(0x26514), f18: ini(0x26518), f04: ini(0x26504), exit: ini(0x264fc), start: 0 });
export function tick(s, order, row) {   // ISR 0x3a828 (the music clock part is the harness' / the player's)
  if (s.f08 === 1) { s.start = Math.imul((Math.imul(S[s.i0c], s.amp) >> 10), 0x50) & 0xffff; if (s.amp !== 0) s.amp--; }
  s.i0c = (s.i0c + 0x8c) & 0x1ff;
  if (s.f18 !== 1 && order === 13) { s.f18 = 1; s.f14 = 1; s.f08 = 1; }
  if (s.f18 !== 0 && order === 14 && row >= 0x3c) { s.f08 = 0; s.f14 = 1; s.f18 = 0; s.f04 = 1; }
  if (s.f18 !== 1 && order === 15 && row >= 2) s.exit = 1;
  if (s.f04 !== 1) { s.c1c = (s.c1c + 1) & 0xff; for (let i = 0; i < 16; i++) if (i !== 3) s.ph[i] = (s.ph[i] + STEP[i]) & 0x1fff; }
}
export function derive(ph, s4a) {   // 0x3a5e0..0x3a7c5 -> c = [28f62.. x scale, 28f72.. y scale, 28f82.. angle]
  const c = new Int32Array(12), amp = ph[3], q = i => S[ph[i] >> 4];
  const e = (q(0) + q(1) + q(2)) * 2;
  for (let i = 0; i < 4; i++) {
    c[8 + i] = ((Math.imul(Math.imul(q(4 + i), amp), 3) >> 10) + e) & 0xfff;
    c[i] = (Math.imul(q(8 + i), amp) >> 8) + s4a; c[4 + i] = (Math.imul(q(12 + i), amp) >> 9) + s4a;
  }
  return c;
}
// ---- screen: 160x100 buffer scattered (0x3a2f1) into mode X VRAM at 0x640 + 160 r + j (planes 0,1 <- even bytes, planes 2,3 <- odd bytes: every pixel doubled in x, odd VGA lines left
// empty = black in the harness); 240 displayed lines from the CRTC start address `start` (bump), wrapping at 64 KB.
export function display(F, start, out) {
  for (let L = 0; L < 240; L++) {
    const base = (start + 80 * L) & 0xffff;
    for (let b = 0; b < 80; b++) {
      const rel = ((base + b) & 0xffff) - 0x640, o = L * 320 + 4 * b;
      if (rel >= 0 && rel < 16000 && rel % 160 < 80) { const q = ((rel / 160) | 0) * 160 + 2 * (rel % 160); out[o] = out[o + 1] = F[q]; out[o + 2] = out[o + 3] = F[q + 1]; }
      else { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; }
    }
  }
}
// ---- player entry. Ideal schedule: one ISR tick and one pass per vsync from E (the first loop top, which has already seen N0 = 11 ticks in the harness: texture init + loading); pass k renders with the
// corner parameters computed at the end of pass k-1, the tick that arrives during the pass (N0+k+1) can set the clear flag / move the CRTC start before the scatter. Seek = replay from checkpoints.
// UNRESOLVED (machine dependent): tick/pass ratio (the harness runs 2 ticks per pass; the check below feeds the harness' own per-pass state), E, N0, the ISR's view of the music row (1-tick offset
// at the order-13 trigger in the harness), the VRAM rows between picture rows (zero in the harness), the grey palette flash after the exit (order 15 row 2) is not modelled.
const N0 = 11, CK = 64; let chk = [];
const clone = st => ({ k: st.k, s: { ...st.s, ph: st.s.ph.slice() }, F: st.F.slice(), c: st.c.slice() });
const tk = (s, j) => { const p = posf(E.v + (j - N0) / VSYNC); tick(s, p.order, p.row); };
function runPass(st) {
  const s = st.s, s4a = (S[s.c1c] + 0x20) << 4;
  renderPass(st.F, st.c); tk(s, N0 + st.k + 1);
  if (s.f14) { st.F.fill(0x7f); s.f14 = 0; }
  st.c = derive(s.ph, s4a); st.k++;
}
export function stateAt(k) {   // state after pass k-1 (= before pass k)... the returned state is a copy advanced through pass k
  if (!chk.length) { const s = newSim(); for (let j = 1; j <= N0; j++) tk(s, j); chk[0] = { k: 0, s, F: new Uint8Array(16000), c: Int32Array.from({ length: 12 }, (_, i) => ini(0x28f62 + 4 * i)) }; }
  const st = clone(chk[Math.min(Math.floor(k / CK), chk.length - 1)]);
  while (st.k < k) { runPass(st); if (st.k % CK === 0 && !chk[st.k / CK]) chk[st.k / CK] = clone(st); }
  runPass(st); return st;
}
export function render(t, ctx) {
  const k = Math.floor((t - E.v) * VSYNC + 1e-9); ctx.h = 240;
  if (k < 0) { ctx.idx.fill(0, 0, 320 * 240); ctx.pal.fill(0); return true; }
  const st = stateAt(k); display(st.F, st.s.start, ctx.idx);
  for (let i = 0; i < 768; i++) ctx.pal[i] = to8(PAL[i]);
  return true;
}
