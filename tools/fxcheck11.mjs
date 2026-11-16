// node tools/fxcheck11.mjs PREFIX : fx11 pass vs oracle frames (state = counters read at the loop top; text buffer accumulates from pass 0; the palette sees the fade one tick after the loop top: a pulse (row&7==7) in that first tick is told from the next top's fade 0xe0)
import fs from 'fs'; import { init, pass, palette, newText } from '../web/fx/fx11.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), pal = fs.readFileSync(P + '.pal'), W = 320 * 400;
await init(fs.readFileSync(new URL('../web/assets/fx11.bin', import.meta.url)));
const t = newText(), out = new Uint8Array(W), p6 = new Uint8Array(768); let bad = 0, badpx = 0, palbad = 0;
for (let f = 0; f < M.length; f++) {
  const v = M[f].top, s = { reveal: v[0], ev: v[1], rows: v[3], fade: v[4], a: [v[10], v[11], v[12]], b: [v[7], v[8], v[9]] };
  if (f === 0) t.clr = v[2];
  pass(t, s, out); let d = 0; for (let i = 0; i < W; i++) if (out[i] !== idx[f * W + i]) d++;
  if (d) { bad++; badpx += d; if (bad < 6) console.log('pass', f, 'differing px', d); }
  if (f === M.length - 1) break;   // no next top to tell the pulse tick
  const nx = M[Math.min(f + 1, M.length - 1)].top[4], f1 = Math.max(0x80, v[4] - 0x10); palette(nx === 0xe0 ? 0xf0 : f1, p6); let pd = 0; for (let i = 0; i < 768; i++) if (p6[i] !== pal[f * 768 + i]) pd++; if (pd) { palbad++; if (palbad < 4) console.log('pal', f, pd, v[4]); }
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx, '| palette-differing passes', palbad);
