// fx03 (original routine 0x2a607, runs until order 0x10 = 16): a 320x200 PCX picture (DATA.DAT, tools/export_assets.py) in the 320x240 tweaked mode the
// previous effect leaves (display = 240 lines, the picture written at VRAM row 20 = `add $0x640` / 80 bytes per row, everything else index 0).
// Code: 64 fade-in steps i=0..63 from WHITE: (pal6*i + 63*(64-i))>>6 (pal6 = file byte>>2), one per vsync (the original waits for the 3DA retrace end, then
// uploads: 2a72f..2a7d9), hold at i=63 while order < 0x10, then 64 fade-out steps c=64..1: (pal6*c)>>6, one per vsync from the first vsync after the
// order change (2a7ec..2a891), then the routine returns (screen keeps c=1 until the next effect).
// Pure function of t: frame n = floor((t-E)*VSYNC); fade-out start frame = ceil((at(16,0)-E)*VSYNC).
import { at as atDefault } from './timeline.js';
import { vsync, to8, load } from './common.js';
const VSYNC = vsync(3);
import { entryTime } from './entries.js';
export const ORDER_OUT = 16;
// E: music time of the first palette upload; follows the exit of fx2 + machine-dependent init (file read, PCX decode, PIT calibration): the harness'
// virtual-clock measurement (re/oracle2/entry.json), not derivable from the code.
export const E = { v: null };   // set by the check scripts, else entryTime(3) at init
let img, pal6, at = atDefault;
export const setAt = f => { at = f; };
export async function init(a) {
  E.v ??= entryTime(3);
  const d = await load(a, 'assets/fx03.bin'); img = d.subarray(0, 64000); pal6 = d.subarray(64000, 64768).map(v => v >> 2); }
export function pal6At(n, nOut) {   // 6-bit palette shown at vsync frame n; n<0: before the first upload (the original has not touched the DAC yet: not drawn)
  const o = new Uint8Array(768);
  if (n >= nOut) { const c = 64 - Math.min(n - nOut, 63); for (let i = 0; i < 768; i++) o[i] = (pal6[i] * c) >> 6; }
  else { const i0 = Math.max(0, Math.min(n, 63)); for (let i = 0; i < 768; i++) o[i] = (pal6[i] * i0 + 63 * (64 - i0)) >> 6; }
  return o;
}
export function render(t, ctx) {
  const n = Math.floor((t - E.v) * VSYNC + 1e-9), nOut = Math.ceil((at(ORDER_OUT, 0) - E.v) * VSYNC - 1e-9), p = pal6At(n, nOut);
  ctx.h = 240; ctx.idx.fill(0, 0, 320 * 240); ctx.idx.set(img, 320 * 20);
  for (let i = 0; i < 768; i++) ctx.pal[i] = to8(p[i]);
  return true;
}
