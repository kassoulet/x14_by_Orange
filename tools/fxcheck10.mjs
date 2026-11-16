// node tools/fxcheck10.mjs PREFIX : fx10 pass vs oracle frames (state = phases read at the loop top; texture/buffer/VRAM accumulate from the first top)
import fs from 'fs'; import { init, newState, pass, angles, palette } from '../web/fx/fx10.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), pal = fs.readFileSync(P + '.pal'), W = 320 * 120;
await init(fs.readFileSync(new URL('../web/assets/fx10.bin', import.meta.url)));
const st = newState(); const g = n => fs.readdirSync('/tmp').filter(f => f.startsWith('x10.buf'));
st.tex.set(fs.readFileSync('/tmp/x10.buf1f0000').subarray(0, 65536));
let bad = 0, badpx = 0, palbad = 0; const p6 = new Uint8Array(768);
for (let f = 0; f < M.length; f++) {
  const v = M[f].v; const s = { p7a: v[0], p7e: v[1], p82: v[2], p8a: v[3], p8e: v[4], p92: v[5], p96: v[6] };
  pass(st, f ? angles(s) : [0, 0, 0, 0]); let d = 0; for (let i = 0; i < W; i++) if (st.scr[i] !== idx[f * W + i]) d++;
  if (d) { bad++; badpx += d; if (bad < 6) console.log('pass', f, 'differing px', d); }
  palette(v[7], p6); let pd = 0; for (let i = 0; i < 768; i++) if (p6[i] !== pal[f * 768 + i]) pd++; if (pd) palbad++;
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx, '| palette-differing passes', palbad);
