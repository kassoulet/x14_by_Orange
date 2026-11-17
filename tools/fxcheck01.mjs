// node tools/fxcheck01.mjs PREFIX : fx1 pass vs oracle frames, driven with the harness' state: top = [fa04 fa08 fa0c fa10 fa14 fa18 fa1c fa20 f9fc f9e0 f9e4 f9e8 f9ec f9f0 f9f4 f9f8 f9c8 f9cc f9d0 24d24 24d28 e2bc | vt irqs order row],
// mid = phases [fa04 fa08 fa14 fa18 f9e0] read when the offset table is built (0x25b3c).
import fs from 'fs'; import { init, init0, pass, palette, show } from '../web/fx/fx01.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), pal = fs.readFileSync(P + '.pal'), W = 320 * 400;
await init(fs.readFileSync(new URL('../web/assets/fx01.bin', import.meta.url)));
const s = init0(), out = new Uint8Array(W), p6 = new Uint8Array(768); let bad = 0, badpx = 0, badpal = 0, badoff = 0;
for (let f = 0; f < M.length; f++) {
  const t = M[f].top, m = M[f].mid;
  if (s.off.join() !== [t[13], t[14], t[15]].join()) badoff++;
  pass(s, { order: t[24], ph: [m[0], m[1], m[2], m[3]], size: [t[10], t[11], t[12]] }); show(s, out);
  palette([t[16], t[17], t[18]], p6);
  let d = 0; for (let i = 0; i < W; i++) if (out[i] !== idx[f * W + i]) d++;
  let dp = 0; for (let i = 0; i < 768; i++) if (p6[i] !== pal[f * 768 + i]) dp++;
  if (dp) badpal++;
  if (d && f < M.length - 1) { bad++; badpx += d; if (bad < 8) console.log('pass', f, 'differing px', d, 'order', t[24], 'pal bytes', dp); }
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx, 'palette passes differing', badpal, 'offset-state mismatches', badoff);
