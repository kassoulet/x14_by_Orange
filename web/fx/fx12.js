// fx12 (original routine 0x7aae4, entry order 58): a static planar 16-colour picture (mode 12h, CRTC reg 9 = 1: every scan line doubled -> 640x240).
// Code read from the unpacked image (linear 0x8baa4..): DAC zeroed; planes 1-3 filled with 0xff over 64 KB (plane 0 stays 0 from the mode set); the file
// (0xfa3a bytes, DATA.DAT at len-0xe3845: 10-byte header "RIX3" 640 200, 16 x RGB 6-bit at +0xa, then 200 rows x 4 planes x 80 bytes at +0x3a, row-major, plane = ebx&3)
// is copied plane by plane to VRAM offset 0xc8f + 80 r (linear, stride 80: a row of the picture wraps onto the next display row), palette = the 16 file colours.
// Then it waits for order 0x3b (59) and returns to text mode 3 (black here). Pure function of t: no fade, no animation.
import { pos as posDefault } from './timeline.js';
import { VSYNC, to8, load } from './common.js';
import { ENTRY, entryTime } from './entries.js';
import { at } from './timeline.js';
import * as f11 from './fx11.js';
export const E = { v: null };
let PL, PAL, posf = posDefault; export const setPos = f => { posf = f; };
export async function init(a, a11) {
  E.v ??= ENTRY[12] ? entryTime(12) : at(58, 0);   // no oracle entry measurement for fx12: the order-58 row 0 of the timeline
  const d = await load(a, 'assets/fx12.bin');
  PAL = d.subarray(0xa, 0xa + 48);
  PL = [0, 1, 2, 3].map(p => new Uint8Array(65536).fill(p ? 255 : 0));
  // plane 0 is not cleared by the original: it keeps fx11's last frame (mode X byte at offset o = pixel x = 4 (o % 80), line o / 80).
  // Text layer = the port's at the end of fx11 (a function of the music events); column state (reveal, fade, phases a/b) = the harness' last fx11 pass (fitted: the ISR tick count at that
  // moment is machine dependent, the ideal-schedule state differs in ~1000 of the 3215 visible bytes). 0 differing px against the oracle (tools/fxcheck12.mjs).
  await f11.init(a11); const c = new Uint8Array(320 * 400);
  f11.frameWith(Math.floor((at(58, 0) - f11.E.v) * VSYNC), { reveal: 40192, ev: 1, rows: 100, fade: 224, a: [164, 82, 430], b: [430, 164, 246] }, c);
  for (let o = 0; o < 32000; o++) PL[0][o] = c[Math.floor(o / 80) * 320 + (o % 80) * 4];
  for (let b = 0; b < 800; b++) PL[b & 3].set(d.subarray(0x3a + b * 80, 0x3a + b * 80 + 80), 0xc8f + (b >> 2) * 80);
}
export function render(t, ctx) {
  ctx.w = 640; ctx.h = 240;
  ctx.pal.fill(0);
  if (t < E.v || posf(t).order >= 59) { ctx.idx.fill(0, 0, 640 * 240); return true; }
  for (let i = 0; i < 48; i++) ctx.pal[i] = to8(PAL[i]);
  for (let y = 0; y < 240; y++) for (let x = 0; x < 640; x++) {
    const o = y * 80 + (x >> 3), m = 0x80 >> (x & 7);
    ctx.idx[y * 640 + x] = (PL[0][o] & m ? 1 : 0) | (PL[1][o] & m ? 2 : 0) | (PL[2][o] & m ? 4 : 0) | (PL[3][o] & m ? 8 : 0);
  }
  return true;
}
