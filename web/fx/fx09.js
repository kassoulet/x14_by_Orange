// fx09 (original routine 0x57cf9, entry order 37/0x25): warped 256x256 texture (DATA.DAT) shown as 160x100 texels (each 2 px) in BIOS mode 13h with 3 scan lines per row (crtc 9 = 2).
// Code read from flat.dis. Per main-loop pass: table T[256] (0x57bb7, from 4 ISR counters + sine table), then the blit 0x57c87: for each of 16000 words w of the DATA.DAT table
// the texel at tex[(w + b99 + T[w>>8]) & 0xffff] is written twice at VRAM linear 0x1400 + 2i (the page start is always 0: no page flip; 16 black rows above and 17 below
// = never written VRAM (all zero in the harness; real VRAM content there is UNRESOLVED), bytes beyond 64 KB are not displayed). b99 = ((S[c43>>2]+S[c47>>2]+S[c4b>>2]) >> 3) (ISR 0x57ec3).
// Palette (0x5807b, every pass, after the vsync wait): 6-bit pal = src*F >> 9, F = fade value 0..0x200 stepped by the ISR (+4/tick while order <= 0x25, -4/tick from order 0x28 row 0x10).
// Seek: everything is a function of the ISR tick count (counters = c*tau & mask; VRAM is rewritten completely each pass; F by replaying the ticks).
import { pos as posDefault } from './timeline.js';
import { VSYNC, to8, load } from './common.js';
import { entryTime } from './entries.js';
export const E = { v: null };
let TEX, WT, S, SRC, posf = posDefault; export const setPos = f => { posf = f; };
export async function init(a) {
  E.v ??= entryTime(9);
  const d = await load(a, 'assets/fx09.bin'), dv = new DataView(d.buffer, d.byteOffset);
  TEX = d.subarray(0, 0x10000); WT = new Uint16Array(16000); for (let i = 0; i < 16000; i++) WT[i] = dv.getUint16(0x10000 + i * 2, true);
  S = new Int32Array(512); for (let i = 0; i < 512; i++) S[i] = dv.getInt32(0x10000 + 0x7d00 + i * 4, true);
  SRC = d.subarray(0x10000 + 0x7d00 + 2048, 0x10000 + 0x7d00 + 2048 + 768);
}
// table T of 0x57bb7 from the counters c1f (+0x16/tick &7ff), c23 (+3 &7ff), c2f (-15 &1ff), c33 (-16 &1ff)
export function tableT(c1f, c23, c2f, c33) {
  const A = (S[c1f >> 2] + 0x100) >> 5, B = (S[c23 >> 2] + 0x100) >> 5, T = new Int32Array(256); let p = c2f, q = c33;
  for (let i = 0; i < 256; i++) { T[i] = ((((S[q] + 0x100) * B) >>> 8) << 8) + ((((S[p] + 0x100) * A) >>> 8) << 8); p = (p + 8) & 0x1ff; q = (q + 16) & 0x1ff; }
  return T;
}
export const tableAt = tau => tableT((22 * tau) & 0x7ff, (3 * tau) & 0x7ff, (-15 * tau) & 0x1ff, (-16 * tau) & 0x1ff);
export const b99At = tau => (S[((4 * tau) & 0x7ff) >> 2] + S[((5 * tau) & 0x7ff) >> 2] + S[((6 * tau) & 0x7ff) >> 2]) >> 3;
export function blit(vram, T, b99) {   // vram: Uint8Array(65536) linear, page start 0
  for (let i = 0; i < 16000; i++) { const w = WT[i], v = TEX[(w + b99 + T[w >> 8]) & 0xffff], o = 0x1400 + 2 * i; vram[o] = v; vram[o + 1] = v; }
}
export const fade = (F, i) => (SRC[i] * F) >> 9;
export function setPal(ctx, F) { for (let i = 0; i < 768; i++) ctx.pal[i] = to8(fade(F, i)); }
export function showVram(vram, ctx) { ctx.h = 133; ctx.idx.set(vram.subarray(0, 133 * 320)); }
// F after tau ticks (ISR 0x57ec3: order<=0x25: +4 capped at 0x200; order>=0x28 and row>=0x10: -4 floored at 0), tick j at E + j/VSYNC
export function fadeAt(tau) {
  let F = 0; for (let j = 1; j <= tau; j++) { const p = posf(E.v + j / VSYNC);
    if (p.order <= 0x25) F = Math.min(F + 4, 0x200); else if (p.order >= 0x28 && p.row >= 0x10 && F > 0) F -= 4; }
  return F;
}
// IDEAL schedule (UNRESOLVED on real hardware): one tick and one pass per vsync (pass k has tau = k); the harness' own schedule (~2 ticks/pass) is machine dependent.
const vram = new Uint8Array(65536);
export function render(t, ctx) {
  const k = Math.floor((t - E.v) * VSYNC + 1e-9);
  if (k < 0) { ctx.h = 133; ctx.idx.fill(0, 0, 133 * 320); ctx.pal.fill(0); return true; }
  vram.fill(0); blit(vram, tableAt(k), b99At(k)); showVram(vram, ctx); setPal(ctx, fadeAt(k)); return true;
}
