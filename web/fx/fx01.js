// fx01 (original routine flat 0x25c55, orders 4..8, leaves at order 9): "swirl warp". Same engine as fx0 (3 byte planes 160x120 that feed back through the 64 KB blend LUT, blit 3 rows per source row from VGA row 20,
// palette = 3 ramps of 64 entries), different front end:
//   per pass: fills (0x25e41): the ISR grows three pending sizes [f9e4,f9e8,f9ec] (+0x200,+0xe0,+0xc0 per tick once order >= 7 and row >= 0x36); they are written as 0x3f over the texture memory at the running offsets
//   [f9f0,f9f4,f9f8] (plane k base + offset; NO bound: the offsets run past 0x10000 into the next planes), i.e. the texture is progressively overwritten by flat colour;
//   offset table (0x25b3c): OFF[i] (i < 256, u16) = ((S[a]+S[b]) << 3 >> 8) + (((S[c]+S[d]+0x800) << 2) & 0xff00), the four phases a,b,c,d (fa04,fa08,fa14,fa18, -6,-8,-13,-11 per tick, &0xfff, read when the table is built);
//   warp (0x257c7): for each of 160x120 pixels cx = map[i] (u16 texel coordinate, v<<8|u), cx += OFF[cx >> 8] (16-bit), per plane buf = LUT[tex_plane[cx] << 8 | buf].
//   overlay (0x25c05, once at order 6): 16 rows x 160 from [e2c0 + 0xa0 + 0x140 row] through the colour table f6c0 into 3 planes, OR-ed into the last 16 source rows at the blit.
//   palette (0x25fe3): ramps (i * step) >> 8 over the base palette, steps [f9c8,f9cc,f9d0] = 256, decremented per tick from order 8 row >= 0x20 (fade out).
import { pos } from './timeline.js';
import { VSYNC, to8, load } from './common.js';
import { SCHED } from './sched.js';
import { entryTime } from './entries.js';
import { display } from './fx00.js';
export const E = { v: null };
let S, MAP, TEX0, LUT, OVSRC, CT, PAL0, BUF0;
export async function init(a) {
  E.v ??= entryTime(1);
  const d = await load(a, 'assets/fx01.bin'), dv = new DataView(d.buffer, d.byteOffset); let o = 0;
  S = new Int32Array(4096); for (let i = 0; i < 4096; i++) S[i] = dv.getInt32(4 * i, true); o = 0x4000;
  MAP = new Uint16Array(19200); for (let i = 0; i < 19200; i++) MAP[i] = dv.getUint16(o + 2 * i, true); o += 0x9600;
  TEX0 = d.subarray(o, o + 0x40000); o += 0x40000; LUT = d.subarray(o, o + 0x10000); o += 0x10000;
  OVSRC = d.subarray(o, o + 0x1500); o += 0x1500; CT = d.subarray(o, o + 0x300); o += 0x300; PAL0 = d.subarray(o, o + 0x300); o += 0x300; BUF0 = d.subarray(o, o + 57600);
}
export const init0 = () => ({ buf: BUF0.slice(), tex: TEX0.slice(), ov: null, off: [0, 0, 0], ovDone: false });
const OFF = new Uint16Array(256), STEP = [16, 17, 36, 27];   // phase steps fa0c, fa10, fa1c, fa20 (constants, = the dump)
// T: {order, ph: [fa04, fa08, fa14, fa18] as read when the table is built, size: [f9e4, f9e8, f9ec] pending at the top}
export function pass(s, T) {
  if (T.order === 6 && !s.ovDone) {   // 0x25c05
    s.ov = new Uint8Array(0x3c00);
    for (let r = 0; r < 16; r++) for (let x = 0; x < 160; x++) { const p = OVSRC[0xa0 + r * 0x140 + x] * 3; for (let c = 0; c < 3; c++) s.ov[c * 0xa00 + r * 160 + x] = CT[p + c]; }
    s.ovDone = true;
  }
  for (let k = 0; k < 3; k++) {   // fills (0x25e41)
    const n = T.size[k]; if (s.off[k] !== 0x10000 && n !== 0) { const a = k * 0x10000 + s.off[k]; s.tex.fill(0x3f, a, a + (n >> 2 << 2)); s.off[k] += T.adv ? T.adv[k] : n; }   // T.adv: the offset advance when the ISR ticked between the two reads of the pending size (0x25e8d fill count, 0x25e98 advance)
  }
  let [a, b, c, d] = T.ph;   // offset table (0x25b3c)
  for (let i = 0; i < 256; i++) {
    OFF[i] = ((((S[a] + S[b]) << 3) >>> 8) + (((S[c] + S[d] + 0x800) << 2) & 0xff00)) & 0xffff;
    a = (a + STEP[0]) & 0xfff; b = (b + STEP[1]) & 0xfff; c = (c + STEP[2]) & 0xfff; d = (d + STEP[3]) & 0xfff;
  }
  const buf = s.buf, tex = s.tex;   // warp (0x257c7)
  for (let i = 0; i < 19200; i++) {
    let cx = MAP[i]; cx = (cx + OFF[cx >> 8]) & 0xffff;
    for (let p = 0; p < 3; p++) buf[p * 19200 + i] = LUT[tex[p * 0x10000 + cx] << 8 | buf[p * 19200 + i]];
  }
}
export function palette(st, out) {   // st = [f9c8, f9cc, f9d0] at the top of the pass
  for (let i = 0; i < 768; i++) out[i] = PAL0[i] & 63;
  for (let i = 0; i < 64; i++) { out[3 * i] = (i * st[0] >> 8) & 255 & 63; out[3 * (64 + i) + 1] = (i * st[1] >> 8) & 255 & 63; out[3 * (128 + i) + 2] = (i * st[2] >> 8) & 255 & 63; }
}
export const show = (s, out) => display(s, out, s.ov || new Uint8Array(0x3c00));
// ISR tick (0x25cf1): phases -6, -8, -13, -11 (&0xfff); once order >= 7 && row >= 0x36 (flag f9e0, sticky): pending sizes += 0x200, 0xe0, 0xc0; order 8 && row >= 0x20: palette steps -1 while non-zero.
export const tick0 = () => ({ ph: [0, 0, 0, 0], flag: 0, size: [0, 0, 0], pal: [256, 256, 256] });
export function tick(t, order, row) {
  t.ph[0] = (t.ph[0] - 6) & 0xfff; t.ph[1] = (t.ph[1] - 8) & 0xfff; t.ph[2] = (t.ph[2] - 13) & 0xfff; t.ph[3] = (t.ph[3] - 11) & 0xfff;
  if (!t.flag && order >= 7 && row >= 0x36) t.flag = 1;
  if (t.flag) { t.size[0] += 0x200; t.size[1] += 0xe0; t.size[2] += 0xc0; }
  if (order === 8 && row >= 0x20 && t.pal[0]) { t.pal[0]--; t.pal[1]--; t.pal[2]--; }
}
// Player schedule: the HARNESS' per-pass schedule (sched.js, fitted: ticks per pass 3..5 and pass times are machine dependent, not derived). TK[n] ISR ticks happen between record n-1 and n
// (TK[0] = the 7 ticks before the first top), evenly spread in time; ORD[n] = order at the top of pass n; the picture of pass n is shown from PT[n] (frame record).
const CK = 32; let chk = [];
const cp = s => ({ ...s, buf: s.buf.slice(), tex: s.tex.slice(), off: [...s.off] });
const cpt = t => ({ ph: [...t.ph], flag: t.flag, size: [...t.size], pal: [...t.pal] });
function replay(k) {   // state after pass k: [s, tick state before the pass k]
  const c0 = chk[Math.min(Math.floor(k / CK), chk.length - 1)];
  let s, t, n; if (c0) { s = cp(c0.s); t = cpt(c0.t); n = c0.n; } else { s = init0(); t = tick0(); n = -1; }
  while (n < k) {
    n++; const S = SCHED.fx1, j0 = S.TK[n] - (n ? S.TM[n - 1] : 0), t1 = S.PT[n], t0 = n ? S.PT[n - 1] : t1 - 0.1;
    for (let q = 1; q <= j0; q++) { const p = pos(t0 + (t1 - t0) * q / j0); tick(t, p.order, p.row); }
    const tm = S.TM[n]; for (let q = 1; q <= tm; q++) { const p = pos(t1 + 0.01 * q); tick(t, p.order, p.row); }   // pending sizes read at the top, phases when the table is built
    pass(s, { order: S.ORD[n], ph: t.ph, size: S.FILL[n], adv: S.ADV[n] });
    if (n % CK === CK - 1) chk[(n + 1) / CK] = { s: cp(s), t: cpt(t), n };
    if (n === k) return [s, t];
  }
}
export function render(t, ctx) {
  ctx.h = 400; ctx.w = 320; const PT = SCHED.fx1.PT; let k = -1; while (k + 1 < PT.length && PT[k + 1] <= t) k++; ctx.pal.fill(0);
  if (k < 0) { ctx.idx.fill(0, 0, 320 * 400); return true; }
  const [s, tk] = replay(k), p6 = new Uint8Array(768); palette(tk.pal, p6); for (let i = 0; i < 768; i++) ctx.pal[i] = to8(p6[i]);
  show(s, ctx.idx); return true;
}
