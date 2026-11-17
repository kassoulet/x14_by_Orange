// node tools/fxcheck00.mjs PREFIX : fx0 pass vs oracle frames, driven with the harness' state at each loop top (order) and the [753b] read at 0xdc99 (the LUT build takes ~4 ISR ticks); also checks the palette is the fixed ramp.
import fs from 'fs'; import { init, init0, pass, display, palette } from '../web/fx/fx00.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), pal = fs.readFileSync(P + '.pal'), W = 320 * 400;
await init(fs.readFileSync(new URL('../web/assets/fx00.bin', import.meta.url)));
const s = init0(), out = new Uint8Array(W), p6 = new Uint8Array(768); palette(p6); let bad = 0, badpx = 0, badpal = 0;
for (let f = 0; f < M.length; f++) {
  const t = M[f].top; pass(s, t[19], M[f].mid[0]); display(s, out);
  let d = 0; for (let i = 0; i < W; i++) if (out[i] !== idx[f * W + i]) d++;
  for (let i = 0; i < 768; i++) if (p6[i] !== pal[f * 768 + i]) { badpal++; break; }
  if (d && f < M.length - 1) { bad++; badpx += d; if (bad < 8) console.log('pass', f, 'differing px', d, 'order', t[19], 'c', t[8]); }
  else if (d) console.log('last pass (frame overwritten by the exit capture): differing px', d);
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx, 'palette passes differing', badpal);
