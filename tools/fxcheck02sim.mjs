// node tools/fxcheck02sim.mjs PREFIX : fx2 whole model (ISR tick sim + corner derivation + pass + clear flag + CRTC bump + display) vs the oracle frames, with the HARNESS' tick count per pass
// (irqs between loop tops, ~2) and the music position of the previous top for the ISR (the player uses 1 tick per pass, see fx02.js). Only the initial 11 ticks are assumed.
import fs from 'fs'; import { init, newSim, tick, derive, renderPass, display, tables } from '../web/fx/fx02.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), W = 320 * 240;
await init(fs.readFileSync(new URL('../web/assets/fx02.bin', import.meta.url))); const { S, ini } = tables();
const s = newSim(), F = new Uint8Array(16000), out = new Uint8Array(W); let c = Int32Array.from({ length: 12 }, (_, i) => ini(0x28f62 + 4 * i)), bad = 0, badpx = 0;
const ord = v => [v[v.length - 2], v[v.length - 1]], irq = v => v[v.length - 3];
for (let j = 0; j < M[0].top[0]; j++) tick(s, 9, 5);
for (let k = 0; k < M.length; k++) {
  const s4a = (S[s.c1c] + 0x20) << 4; renderPass(F, c);
  const nt = k + 1 < M.length ? irq(M[k + 1].top) - irq(M[k].top) : 2; for (let j = 0; j < nt; j++) tick(s, ...ord(M[k].top));
  if (s.f14) { F.fill(0x7f); s.f14 = 0; }
  display(F, s.start, out); c = derive(s.ph, s4a);
  let d = 0; for (let i = 0; i < W; i++) if (out[i] !== idx[k * W + i]) d++;
  if (d) { bad++; badpx += d; if (bad < 6) console.log('pass', k, 'differing px', d); }
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx);
