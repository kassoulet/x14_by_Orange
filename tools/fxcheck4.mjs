// node tools/fxcheck4.mjs PREFIX : fx4 display vs oracle (record f shows the picture drawn by pass f+1; prev pass drawn on the other page)
import fs from 'fs'; import { init, frame } from '../web/fx/fx04.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), pal = fs.readFileSync(P + '.pal'), W = 320 * 200;
await init(fs.readFileSync(new URL('../web/assets/fx04.bin', import.meta.url)));
const g = f => { const v = M[f].v, h = a => v[a] | 0; return { ec4: h('0x49ec4'), bac: h('0x49bac'), fade: h('0x2afc5'),
  iv: { s2ffd5: h('0x2ffd5'), s2ffd9: h('0x2ffd9'), s2ffdd: h('0x2ffdd'), s2ffe1: h('0x2ffe1'), k: 256, a1: h('0x49bb4'), b1: h('0x49bb8'), step: 0, a0: h('0x30329') } }; };
let bad = 0, badpx = 0, palbad = 0; const out = new Uint8Array(W), p6 = new Uint8Array(768);
for (let f = 0; f + 1 < M.length; f++) {
  frame(g(f + 1), g(f), out, p6); let d = 0;
  for (let i = 0; i < W; i++) if (out[i] !== idx[f * W + i]) d++;
  for (let i = 0; i < 768; i++) if (p6[i] !== pal[f * 768 + i]) { palbad++; break; }
  if (d) { bad++; badpx += d; if (bad < 6) console.log('rec', f, 'order', M[f].order, 'differing px', d); }
}
console.log('records', M.length - 1, 'bad', bad, 'differing px', badpx, '| palette-differing records', palbad);
