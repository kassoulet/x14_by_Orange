// node tools/fxcheck01.mjs PREFIX [K=130] : fx1 pass vs oracle frames, driven with the harness' state: top = [fa04 fa08 fa0c fa10 fa14 fa18 fa1c fa20 f9fc f9e0 f9e4 f9e8 f9ec f9f0 f9f4 f9f8 f9c8 f9cc f9d0 24d24 24d28 e2bc | vt irqs order row],
// mid = phases [fa04 fa08 fa14 fa18 f9e0] read when the offset table is built (0x25b3c).
// The fill size is read a few instructions after the loop top: when the harness ISR ticked in between, the pass consumed more than the top shows; the consumed size = the offset advance to the next top.
// Per pass the fill of each plane is one of j = 0..J ticks (size = top + j*inc, advance = the observed one: j < J leaves a gap of unfilled bytes). The gap is invisible until the warp samples that texel
// (up to ~120 passes later), so the choice is made per plane by LOOKAHEAD: j minimising the plane's differing pixels over this pass and the next K (default 130) passes (later passes use the greedy tie->largest j policy).
import fs from 'fs'; import { init, init0, pass, palette, show } from '../web/fx/fx01.js';
const P = process.argv[2], K = +(process.argv[3] ?? 130), M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), pal = fs.readFileSync(P + '.pal'), W = 320 * 400;
await init(fs.readFileSync(new URL('../web/assets/fx01.bin', import.meta.url)));
const out = new Uint8Array(W), p6 = new Uint8Array(768), INC = [0x200, 0xe0, 0xc0];
const lostReg = process.env.LOST ? (y, x) => y >= 332 || (y < 60 && (x & 2)) : () => false;   // LOST=1 only to check OLD oracles (taken before the mirror_blit fix) that lost VRAM writes in these regions
const used = (f, t) => { const n = M[f + 1]?.top; return n ? [n[13] - t[13], n[14] - t[14], n[15] - t[15]] : [t[10], t[11], t[12]]; };
const cl = s => ({ ...s, buf: s.buf.slice(), tex: s.tex.slice(), off: [...s.off] });
function cands(s, f) {   // all candidates j = 0..J for pass f from state s (s.off is resynced to the harness' offsets); dpl[j][plane] = differing px outside the lost regions
  const t = M[f].top, m = M[f].mid, u = used(f, t); s.off = [t[13], t[14], t[15]];
  const J = Math.max(...u.map((x, k) => Math.round((x - t[10 + k]) / INC[k]))), cs = [], dpl = [];
  for (let j = 0; j <= J; j++) {
    const c = cl(s); pass(c, { order: t[24], ph: [m[0], m[1], m[2], m[3]], size: [0, 1, 2].map(k => Math.min(t[10 + k] + j * INC[k], u[k])), adv: u }); show(c, out); cs.push(c);
    const d = [0, 0, 0]; for (let i = 0; i < W; i++) if (out[i] !== idx[f * W + i]) { const y = (i / 320) | 0, x = i % 320; if (!lostReg(y, x)) d[(y - 20) % 3]++; }
    dpl.push(d);
  }
  return { cs, dpl, J };
}
const merge = (cs, pick) => { const c = cl(cs[0]); for (let p = 0; p < 3; p++) { c.buf.set(cs[pick[p]].buf.subarray(p * 19200, (p + 1) * 19200), p * 19200); c.tex.set(cs[pick[p]].tex.subarray(p * 0x10000, (p + 1) * 0x10000), p * 0x10000); } return c; };
const dflt = dpl => [0, 1, 2].map(p => dpl.reduce((bj, d, j) => d[p] <= dpl[bj][p] ? j : bj, 0));
let s = init0(), lost = 0, bad = 0, badpx = 0, badpal = 0, nTick = 0, nJ = 0;
for (let f = 0; f < M.length; f++) {
  const t = M[f].top, { cs, dpl, J } = cands(s, f); let pick = dflt(dpl);
  if (J > 0) {
    nTick++; const D = [];
    for (let j = 0; j <= J; j++) {
      let c = cl(cs[j]); const sum = [0, 1, 2].map(p => dpl[j][p]);
      for (let g = f + 1; g < Math.min(M.length - 1, f + 1 + K); g++) { const r = cands(c, g), pg = dflt(r.dpl); for (let p = 0; p < 3; p++) sum[p] += r.dpl[pg[p]][p]; c = merge(r.cs, pg); }
      D.push(sum);
    }
    pick = [0, 1, 2].map(p => D.reduce((bj, d, j) => d[p] <= D[bj][p] ? j : bj, 0));
  }
  if (pick.some((x, p) => x < J)) nJ++;
  s = merge(cs, pick); show(s, out); palette([t[16], t[17], t[18]], p6);
  let d = [0, 1, 2].reduce((a, p) => a + dpl[pick[p]][p], 0), dx = 0;
  for (let i = 0; i < W; i++) if (out[i] !== idx[f * W + i]) { const y = (i / 320) | 0, x = i % 320; if (lostReg(y, x)) dx++; }
  if (f < M.length - 1) lost += dx;
  let dp = 0; for (let i = 0; i < 768; i++) if (p6[i] !== pal[f * 768 + i]) dp++;
  if (dp) badpal++;
  if (d && f < M.length - 1) { bad++; badpx += d; if (bad < 8) console.log('pass', f, 'differing px', d, 'order', t[24], 'pal bytes', dp); }
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx, 'palette passes differing', badpal, 'passes with a tick between the fill reads', nTick, ', passes where a plane filled fewer ticks than the advance (gap)', nJ, '| px differing only in the harness-lost regions (excluded above):', lost);
