// node tools/fxcheck12.mjs PREFIX : fx12 picture vs the oracle's VRAM planes (640x240 = planes at 80 B/row, scan lines doubled) and the 16 DAC colours
import fs from 'fs'; import { init, render, E } from '../web/fx/fx12.js';
const P = process.argv[2], pl = fs.readFileSync(P + '.planes'), pal = fs.readFileSync(P + '.pal');
await init(fs.readFileSync(new URL('../web/assets/fx12.bin', import.meta.url)), fs.readFileSync(new URL('../web/assets/fx11.bin', import.meta.url))); E.v = 0;
const c = { idx: new Uint8Array(640 * 400), pal: new Uint8Array(768) }; render(1, c);
let bad = 0; for (let y = 0; y < 240; y++) for (let x = 0; x < 640; x++) {
  const o = y * 80 + (x >> 3), m = 0x80 >> (x & 7); let v = 0; for (let p = 0; p < 4; p++) if (pl[p * 65536 + o] & m) v |= 1 << p;
  if (v !== c.idx[y * 640 + x]) bad++;
}
let pb = 0; for (let i = 0; i < 48; i++) if (Math.floor(pal[i] * 255 / 63) !== c.pal[i]) pb++;
console.log('differing px', bad, 'of', 640 * 240, '| differing palette bytes', pb, 'of 48');
