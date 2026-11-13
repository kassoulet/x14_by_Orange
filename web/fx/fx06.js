// fx06 (original routine 0x2a8bf, entry order 25/0x19): a 320x200 PCX picture (DATA.DAT, tools/export_assets.py) in BIOS mode 13h, palette fades.
// Code: palette = 0 upload, picture copied, then 64 fade-in steps k=0..63 (pal6*k>>6, pal6 = file byte>>2) one per vsync (the original waits for the 3DA
// retrace end, then uploads: 2a99b..2aa2c), hold at k=63 while order < 0x1c (28), then 64 fade-out steps k=64..1 one per vsync starting at the first
// vsync after the order change, then the routine returns (the screen keeps k=1 until the next effect sets its own palette).
// Pure function of t: frame n = floor((t-E)*VSYNC); fade-out start frame = ceil((at(28,0)-E)*VSYNC).
import { at as atDefault } from './timeline.js';
import { VSYNC, to8, load } from './common.js';
import { entryTime } from './entries.js';
export const ORDER_OUT = 28;
// E = music time of the first palette upload (first fade-in frame). NOT derivable from the code alone: it follows the exit of fx5 (order 25 seen) + the
// machine-dependent init (file read, PCX decode, PIT calibration). The value is the Unicorn harness' virtual-clock measurement (re/oracle2/entry.json).
export const E = { v: null };   // set by the check scripts, else entryTime(6) at init
let img, pal6, at = atDefault;
export const setAt = f => { at = f; };
export async function init(a) {
  E.v ??= entryTime(6);
  const d = await load(a, 'assets/fx06.bin'); img = d.subarray(0, 64000); pal6 = d.subarray(64000, 64768).map(v => v >> 2); }
export function step(n, nOut) {   // multiplier of the palette shown at vsync frame n (n < 0: before the first upload = black), 0..64
  if (n < 0) return 0;
  if (nOut !== undefined && n >= nOut) return Math.max(1, 64 - Math.min(n - nOut, 63));
  return Math.min(n, 63);
}
export function render(t, ctx) {
  const n = Math.floor((t - E.v) * VSYNC + 1e-9), nOut = Math.ceil((at(ORDER_OUT, 0) - E.v) * VSYNC - 1e-9), k = step(n, nOut);
  ctx.idx.set(img); ctx.h = 200;
  for (let i = 0; i < 768; i++) ctx.pal[i] = to8((pal6[i] * k) >> 6);
  return true;
}
