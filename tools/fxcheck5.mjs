// node tools/fxcheck5.mjs PREFIX : fx5 pass (state read at the loop top, VRAM fed back) vs oracle frames; also the palette (base * fade >> 8, fade = value at the upload)
import fs from 'fs'; import { init, pass, palette } from '../web/fx/fx05.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), pal = fs.readFileSync(P + '.pal'), W = 320 * 133;
await init(fs.readFileSync(new URL('../web/assets/fx05.bin', import.meta.url)));
const vram = new Uint8Array(fs.readFileSync(P + '.vram0')); let bad = 0, badpx = 0, palbad = 0; const p6 = new Uint8Array(768);
for (let f = 0; f < M.length; f++) {
  const v = M[f].v; pass({ p14: v[0], p18: v[1], p1c: v[2], p20: v[3], p3c: v[5], p40: v[6], p44: v[7], p48: v[8] }, vram);
  let d = 0; for (let i = 0; i < W; i++) if (vram[i] !== idx[f * W + i]) d++;
  if (d) { bad++; badpx += d; if (bad < 6) console.log('pass', f, 'differing px', d); }
  if (f && M[f - 1].upfade != null) { palette(M[f - 1].upfade, p6); for (let i = 0; i < 768; i++) if (p6[i] !== pal[f * 768 + i]) { palbad++; break; } }
  vram.set(idx.subarray(f * W, f * W + W));   // resync to the oracle so one mismatch does not propagate
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx, '| palette-differing passes', palbad);
// tick simulation: the state at the loop top of pass f = init0 advanced by the ISR count since pass 0 (harness: ~3 ticks per pass)
import { init0, tick } from '../web/fx/fx05.js';
{ const s = init0(); let n = 0, b = 0;
  for (let f = 0; f < M.length; f++) { const want = f ? M[f].irqs - M[0].irqs + 1 : 0; while (n < want) { tick(s, M[f].order); n++; }
    const v = M[f].v; if (s.p14 !== v[0] || s.p18 !== v[1] || s.p1c !== v[2] || s.p20 !== v[3] || s.p3c !== v[5] || s.p40 !== v[6] || s.p44 !== v[7] || s.p48 !== v[8] || s.fade !== v[9]) { if (b++ < 3) console.log('state', f, JSON.stringify(s), v.join()); } }
  console.log('tick sim: states differing', b); }
