// node tools/fxcheck8.mjs PREFIX : fx8 port vs oracle (pass k shows the picture computed in pass k-1 from n = ISR ticks since pass 0 at that loop top)
import fs from 'fs'; import { init, picture, basePal } from '../web/fx/fx08.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), W = 320, H = 96;
await init(fs.readFileSync(new URL('../web/assets/fx08.bin', import.meta.url)));
const pal = fs.readFileSync(P + '.pal'), BP = basePal(); let palbad = 0;
const i0 = M[0].top[28]; let bad = 0, badpx = 0; const off = 32, dy = 1;   // picture at x=32, displayed row y = source row y+1
for (let k = 1; k < M.length; k++) {
  for (let i = 0; i < 768; i++) if (pal[k * 768 + i] !== (BP[i] * M[k].top[3] >> 7)) { palbad++; break; }
  const n = M[k - 1].top[28] - i0, pic = picture(n); let d = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < 256; x++) if (idx[k * W * H + y * W + off + x] !== pic[(y + dy) * 128 + (x >> 1)]) d++;
  if (d) { bad++; badpx += d; if (bad < 6) console.log('pass', k, 'n', n, 'differing px', d); }
}
console.log('passes', M.length - 1, 'bad', bad, 'differing px', badpx, '| passes with a differing palette', palbad);
