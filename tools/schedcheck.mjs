// node tools/schedcheck.mjs FX PREFIX : the PLAYER's render(t) at each harness frame time (sched.js) vs the oracle frames (fx 0|1; PREFIX from oracle01bin.py). fx1: regions where the harness loses VRAM writes are skipped (see fxcheck01.mjs).
import fs from 'fs'; import { SCHED } from '../web/fx/sched.js';
const [fx, P] = [process.argv[2], process.argv[3]], m = await import(`../web/fx/fx0${fx}.js`), idx = fs.readFileSync(P + '.idx'), W = 320 * 400, PT = SCHED['fx' + fx].PT;
await m.init(fs.readFileSync(new URL(`../web/assets/fx0${fx}.bin`, import.meta.url)));
const ctx = { idx: new Uint8Array(W), pal: new Uint8Array(768) }; let bad = 0, badpx = 0, last = 0;
for (let k = 0; k < PT.length - 1; k++) {   // the last frame is overwritten by the exit capture
  m.render(PT[k] + 1e-4, ctx); let d = 0;
  for (let i = 0; i < W; i++) if (ctx.idx[i] !== idx[k * W + i]) { const y = (i / 320) | 0, x = i % 320; if (fx === '1' && (y >= 332 || (y < 60 && (x & 2)))) continue; d++; }
  if (d) { bad++; badpx += d; if (bad < 6) console.log('pass', k, 'differing px', d); }
}
console.log('fx' + fx, 'passes', PT.length - 1, 'differing passes', bad, 'px', badpx);
