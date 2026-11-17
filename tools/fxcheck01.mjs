// node tools/fxcheck01.mjs PREFIX : fx1 pass vs oracle frames, driven with the harness' state: top = [fa04 fa08 fa0c fa10 fa14 fa18 fa1c fa20 f9fc f9e0 f9e4 f9e8 f9ec f9f0 f9f4 f9f8 f9c8 f9cc f9d0 24d24 24d28 e2bc | vt irqs order row],
// mid = phases [fa04 fa08 fa14 fa18 f9e0] read when the offset table is built (0x25b3c).
import fs from 'fs'; import { init, init0, pass, palette, show } from '../web/fx/fx01.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), pal = fs.readFileSync(P + '.pal'), W = 320 * 400;
await init(fs.readFileSync(new URL('../web/assets/fx01.bin', import.meta.url)));
const s = init0(), out = new Uint8Array(W), p6 = new Uint8Array(768); let lost = 0, bad = 0, badpx = 0, badpal = 0, badoff = 0;
// the fill size is read a few instructions after the loop top: when the harness ISR ticked in between, the pass consumed more than the top shows; the consumed size = the offset advance to the next top
const used = (f, t) => { const n = M[f + 1]?.top; return n ? [n[13] - t[13], n[14] - t[14], n[15] - t[15]] : [t[10], t[11], t[12]]; };
const cl = s => ({ ...s, buf: s.buf.slice(), tex: s.tex.slice(), off: [...s.off] });
// two candidates per pass for the fill: the ISR may tick between the loop top and the read of the pending size (0x25e8d), or between that read and the second read that advances the offset (0x25e98):
// A = the pass filled (and advanced by) the offset advance seen at the next top; B = it filled the size shown at the top and advanced by the offset advance. The better one is kept (counts printed).
let nTick = 0, nJ = 0; const INC = [0x200, 0xe0, 0xc0], mix = [0, 0, 0, 0, 0];
for (let f = 0; f < M.length; f++) {
  const t = M[f].top, m = M[f].mid, u = used(f, t);
  s.off = [t[13], t[14], t[15]];   // resync: the harness' own fill offsets at the loop top
  const J = Math.max(...u.map((x, k) => Math.round((x - t[10 + k]) / INC[k]))), cs = [], dpl = [];   // J = ticks between the top and the second read of the pending size (0 mostly)
  for (let j = 0; j <= J; j++) {
    const c = cl(s); pass(c, { order: t[24], ph: [m[0], m[1], m[2], m[3]], size: [0, 1, 2].map(k => Math.min(t[10 + k] + j * INC[k], u[k])), adv: u }); show(c, out); cs.push(c);
    const d = [0, 0, 0]; for (let i = 0; i < W; i++) if (out[i] !== idx[f * W + i]) { const y = (i / 320) | 0, x = i % 320; if (!(y >= 332 || (y < 60 && (x & 2)))) d[(y - 20) % 3]++; }
    dpl.push(d);
  }
  // the three planes read their own pending size at different instants: take, per plane, the candidate (number of ticks before the read) that reproduces the harness
  const pick = [0, 1, 2].map(p => dpl.reduce((bj, d, j) => d[p] < dpl[bj][p] ? j : bj, 0));
  const c = cl(cs[0]); for (let p = 0; p < 3; p++) { c.buf.set(cs[pick[p]].buf.subarray(p * 19200, (p + 1) * 19200), p * 19200); c.tex.set(cs[pick[p]].tex.subarray(p * 0x10000, (p + 1) * 0x10000), p * 0x10000); }
  Object.assign(s, c); show(s, out); if (J) nTick++; if (pick.some(x => x)) nJ++;
  const best = { d: [0, 1, 2].reduce((a, p) => a + dpl[pick[p]][p], 0) };
  palette([t[16], t[17], t[18]], p6);
  let d = best.d, dx = 0;   // dx: differing px in the two regions the harness (Unicorn) loses VRAM writes in, see re/NOTES.md (fx1): rows >= 332 and the planes 2,3 of rows < 60
  for (let i = 0; i < W; i++) if (out[i] !== idx[f * W + i]) { const y = (i / 320) | 0, x = i % 320; if (y >= 332 || (y < 60 && (x & 2))) dx++; }
  if (f < M.length - 1) lost += dx;
  let dp = 0; for (let i = 0; i < 768; i++) if (p6[i] !== pal[f * 768 + i]) dp++;
  if (dp) badpal++;
  if (best.d && f < M.length - 1) { bad++; badpx += d; if (bad < 8) console.log('pass', f, 'differing px', d, 'order', t[24], 'pal bytes', dp); }
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx, 'palette passes differing', badpal, 'passes with a tick between the fill reads', nTick, ', passes where a plane used fewer ticks than the advance', nJ, '| px differing only in the harness-lost regions (excluded above):', lost);
