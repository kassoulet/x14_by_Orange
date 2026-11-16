// fx4 (original routine 0x495bc flat): leaf/fur tunnel. Geometry pass 0x5a16f (linear; self-patched immediates = per-pass copies of state vars), texture fill, scatter 0x5a4f6.
// Per pass: 2 rings of 100 projected points (z = +-); row j of the 128x100 image = the texture sampled along the segment between point j of ring 1 and ring 2 (128 samples, x1*128 + k*(x2-x1) >> 8),
// shaded by SHADE[|z2-z1|>>8] (dword add with byte carries).
import { pos } from './timeline.js';
import { VSYNC, to8 } from './common.js';
let TEX, S, SHADE, PIC, BASEPAL;
export async function init(a) {
  const d = new Uint8Array(a ?? await (await fetch('assets/fx04.bin')).arrayBuffer()), dv = new DataView(d.buffer, d.byteOffset);
  TEX = d.subarray(0, 65536); S = new Int32Array(5122); for (let i = 0; i < 5122; i++) S[i] = dv.getInt32(65536 + 4 * i, true);
  // cos(i) = dword at 0x3134d + 4 i = S[1025 + i] (0x3134d - 0x30349 = 0x1004)
  let o = 65536 + 5122 * 4; SHADE = d.subarray(o, o + 0x1040); o += 0x1040;
  const src = d.subarray(o, o + 96), blk0 = d.subarray(o + 96, o + 192); PIC = d.subarray(o + 192, o + 192 + 64000);
  BASEPAL = new Uint8Array(768);   // 0x59f84: block k (32 colours) = source * 16(k+1) >> 7 (clamp 63); block 0 is then overwritten by the static bytes at 0x49bbc
  for (let b = 0; b < 8; b++) for (let j = 0; j < 96; j++) BASEPAL[96 * b + j] = Math.min(63, (src[j] * 16 * (b + 1)) >> 7);
  BASEPAL.set(blk0, 0);
}
// Tick (ISR 0x5a89e, one per vsync in the ideal schedule) and pass state. Order thresholds: nothing before order 0x11; scroll acceleration at order 0x15.
export const init0 = () => ({ a5: 3072, a9: 0, ad: 0, e1: 0, c5: 0, ed: 0, d478: 0, c: 8, a329: 2048, a1: 0, b1: 0, ec4: 0, ec8: 0, fade: 512, bac: 0, bb0: 32000 });
export function tick(s, order) {   // mutates s: one ISR
  if (order < 0x11) return;
  if (order === 0x15) { s.ec8++; s.ec4 = (s.ec4 + s.ec8) | 0; if (s.fade > 8) s.fade -= 4; }
  if (s.fade >>> 0 >= 0x100) s.fade--;
  s.a9 = (s.a9 + 4) & 0xfff; s.ad = (s.ad + 8) & 0xfff; s.e1 = (s.e1 + 6) & 0xfff; s.a5 = (s.a5 + 4) & 0xfff; s.a329 = (s.a329 + 4) & 0xfff;
  s.d478 = (s.d478 + 10) & 0xfff; s.c5++; s.ed++;
  let e = (-(s.d478 + 0x800)) & 0xfff; const eax = S[e]; e = (-e) & 0xfff; const ebx = S[0x401 + e], edx = 0x800 - s.c;
  s.a1 = (s.a1 + (Math.imul(eax, edx) >> 16)) | 0; s.b1 = (s.b1 + (Math.imul(ebx, edx) >> 16)) | 0;
}
export function pass(s) {   // 0x5aa33: values the pass derives and stores (478d5, 302f9), page swap after drawing; returns the variable set image() needs
  s.d478 = (S[s.a9] + S[s.ad] + S[s.e1]) & 0xfff; s.c = (S[s.a5] + 0x52c) >> 2;
  return { s2ffd9: s.a9, s2ffdd: s.ad, s2ffe1: s.e1, s2ffd5: s.a5, k: 256, a1: s.a1, b1: s.b1, step: 0, a0: s.a329 };
}
const idiv = (a, b) => Math.trunc(a / b) | 0;
function ring(e0, K, esi1a, esi2, C, A1, B1, step, a0, out) {   // 100 vertices x (x, y, z)
  let a = a0;
  for (let j = 0; j < 100; j++) {
    const ebx = -0x320 + 0x10 * j, esi1 = ((Math.imul(S[a], 0x64)) >> 9) & 0xfff;
    const s1 = S[esi1], c1 = S[0x401 + esi1];
    const b1 = (Math.imul(ebx, c1) - Math.imul(s1, K)) >> 10, c = (Math.imul(K, c1) + Math.imul(s1, ebx)) >> 10;
    const z = idiv(e0 << 8, c) + 0x80;
    const s2 = S[esi2], c2 = S[0x401 + esi2];
    const a2 = (Math.imul(e0, c2) - Math.imul(s2, b1)) >> 10, b2 = (Math.imul(b1, c2) + Math.imul(s2, e0)) >> 10;
    const q1 = idiv(b2 << 10, c), q2 = idiv(a2 << 10, c);
    out[3 * j] = ((Math.imul(q2, C) >> 10) + A1) | 0; out[3 * j + 1] = ((Math.imul(q1, C) >> 10) + B1) | 0; out[3 * j + 2] = z;
    a = (a + step) & 0xfff;
  }
}
export function image(v) {   // v: state variables of the pass (see oracle4bin NEED); returns 128x100 bytes
  const R1 = new Int32Array(300), R2 = new Int32Array(300), out = new Uint8Array(12800);
  const esi2 = (S[v.s2ffd9] + S[v.s2ffdd] + S[v.s2ffe1]) & 0xfff;
  const C = (S[v.s2ffd5] + 0x52c) >> 2;
  ring(-0x3c0, v.k, 0, esi2, C, v.a1, v.b1, v.step, v.a0, R1);
  ring(0x400, v.k, 0, esi2, C, v.a1, v.b1, v.step, v.a0, R2);
  for (let j = 0; j < 100; j++) {
    const sh = SHADE[(((R2[3 * j + 2] - R1[3 * j + 2]) ^ ((R2[3 * j + 2] - R1[3 * j + 2]) >> 31)) >>> 8)], imm = Math.imul(sh, 0x01010101) >>> 0;
    const dx = R2[3 * j] - R1[3 * j], dy = R2[3 * j + 1] - R1[3 * j + 1]; let ex = R1[3 * j] << 7, ey = R1[3 * j + 1] << 7;
    for (let q = 0; q < 32; q++) {
      const px = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) { px[i] = TEX[(((ey >> 8) & 255) << 8) | ((ex >> 8) & 255)]; ex = (ex + dx) | 0; ey = (ey + dy) | 0; }
      const w = ((px[2] | px[3] << 8 | px[0] << 16 | px[1] << 24) + imm) >>> 0;   // [p2,p3,p0,p1] + shade*0x01010101, then rol 16
      const r = ((w << 16) | (w >>> 16)) >>> 0; const o = j * 128 + q * 4;
      out[o] = r & 255; out[o + 1] = (r >>> 8) & 255; out[o + 2] = (r >>> 16) & 255; out[o + 3] = r >>> 24;
    }
  }
  return out;
}

// ---- VRAM (mode X: 4 planes x 64 KB, pitch 96 bytes) and display ----
const newVram = () => { const v = [0, 1, 2, 3].map(() => new Uint8Array(65536));
  for (const base of [0, 32000]) for (let y = 0; y < 200; y++) for (let a = 0; a < 80; a++) for (let p = 0; p < 4; p++) v[p][base + y * 96 + a] = PIC[y * 320 + 4 * a + p];   // 0x5a637.. start picture, both pages
  return v; };
function drawTunnel(vr, buf, pg) {   // scatter 0x5a4f6: tunnel row r at VRAM row 2r of the page, planes 0,1 = buf[2a], planes 2,3 = buf[2a+1]
  for (let r = 0; r < 100; r++) for (let a = 0; a < 64; a++) { const o = pg + r * 192 + a, e = buf[r * 128 + 2 * a], f = buf[r * 128 + 2 * a + 1]; vr[0][o] = e; vr[1][o] = e; vr[2][o] = f; vr[3][o] = f; }
}
function view(vr, start, idx) { for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) idx[y * 320 + x] = vr[x & 3][(start + y * 96 + (x >> 2)) & 0xffff]; }
export const palette = (fade, out) => { for (let i = 0; i < 768; i++) out[i] = Math.min(0x3f, (BASEPAL[i] * fade) >>> 8); };
// One tunnel pass of the original (v = {iv: image() inputs, ec4 scroll accumulator, bac page, fade}); prev = the same for the previous pass (its image is on the other page).
export function frame(v, prev, idx, pal6) {
  const vr = newVram(), other = 32000 - v.bac;
  if (prev && v.ec4 !== 0) drawTunnel(vr, image(prev.iv), other);
  drawTunnel(vr, image(v.iv), v.bac);
  const sh = (Math.imul(-128, v.ec4) >> 11) * 0x60;
  view(vr, (sh + v.bac) & 0xffff, idx); palette(v.fade, pal6);
  return sh <= -0x3e80;   // the original sets the exit flag 0x48f15 here
}

// ---- player entry: ideal schedule = one tick and one pass per vsync from the start of order 0x11 (the tunnel). Tick n (n >= 1) is followed by pass n, which shows state n at vsync n-1.
// UNRESOLVED (machine dependent): real tick/pass ratio, scatter tearing of the top rows seen in 190 of 547 harness records (harness timing), the pre-tunnel phases (start picture on a black DAC: unverified).
import { at } from './timeline.js';
const ST = [], run = init0();   // ST[n] = {iv, ec4, fade, bac}; ST[0] = state before any tick
export function stateAfter(n) {
  if (!ST.length) ST.push({ iv: null, ec4: 0, fade: 512, bac: 0 });
  while (ST.length <= n) { const j = ST.length; tick(run, pos(E() + j / VSYNC).order); const iv = pass(run);
    ST.push({ iv, ec4: run.ec4, fade: run.fade, bac: j & 1 ? 32000 : 0 }); }
  return ST[n];
}
const E = () => at(0x11, 0);
export function render(t, ctx) {
  const k = Math.floor((t - E()) * VSYNC + 1e-9); ctx.h = 200;
  if (k < 0) { const vr = newVram(); view(vr, 0, ctx.idx); ctx.pal.fill(0); return true; }
  const p6 = new Uint8Array(768), a = stateAfter(k + 1);
  frame(a, k >= 1 ? stateAfter(k) : null, ctx.idx, p6);
  for (let i = 0; i < 768; i++) ctx.pal[i] = to8(p6[i]);
  return true;
}
