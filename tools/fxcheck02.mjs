// node tools/fxcheck02.mjs PREFIX : fx2 pass vs oracle frames. The corner parameters c (28f62..) and the clear flag are read at the loop top (state = counters at the top; buffer accumulates from pass 0)
import fs from 'fs'; import { init, renderPass, display } from '../web/fx/fx02.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), W = 320 * 240;
await init(fs.readFileSync(new URL('../web/assets/fx02.bin', import.meta.url)));
const F = new Uint8Array(16000), out = new Uint8Array(W); let bad = 0, badpx = 0;
for (let f = 0; f < M.length; f++) {
  const v = M[f].top, c = Int32Array.from(v.slice(43, 55));
  renderPass(F, c); if (f + 1 < M.length && M[f + 1].top[41] !== v[41]) F.fill(0x7f);   // clear flag set by the ISR during the pass (f18 changes at the next top)
  display(F, M[f].off, out); let d = 0; for (let i = 0; i < W; i++) if (out[i] !== idx[f * W + i]) d++;
  if (d) { bad++; badpx += d; if (bad < 8) console.log('pass', f, 'differing px', d, 'off', M[f].off, 'flag', v[40]); }
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx);
