// node tools/fxcheck02sim.mjs PREFIX : fx2 whole model (ISR tick sim + corner derivation + pass + clear flag + CRTC bump + display) vs the oracle frames, with the HARNESS' tick count per pass
// (irqs between loop tops, ~2) and the music position of the previous top for the ISR (the player uses 1 tick per pass, see fx02.js). Only the initial 11 ticks are assumed.
import fs from 'fs'; import { init, newSim, tick, derive, renderPass, display, tables } from '../web/fx/fx02.js';
const P = process.argv[2], M = JSON.parse(fs.readFileSync(P + '.json')), idx = fs.readFileSync(P + '.idx'), W = 320 * 240;
await init(fs.readFileSync(new URL('../web/assets/fx02.bin', import.meta.url))); const { S, ini } = tables();
const s = newSim(), F = new Uint8Array(16000), out = new Uint8Array(W); let c = Int32Array.from({ length: 12 }, (_, i) => ini(0x28f62 + 4 * i)), bad = 0, badpx = 0;
let gt = 0; const T14 = +(process.env.T14 ?? -1), T13 = +(process.env.T13 ?? -1), SHIFT = +(process.env.SHIFT || 0), TICKPOS = process.env.PHASE === 'tick', V = +(process.env.V || 70.086), rows = JSON.parse(fs.readFileSync(new URL('../re/s3mtime.model.json', import.meta.url))).rows, t0 = M[0].vt - M[0].mt;
const posAt = m => { let r = rows[0]; for (const x of rows) { if (x[3] <= m) r = x; else break; } return [r[0], r[2]]; };
const ord = v => [v[v.length - 2], v[v.length - 1]], irq = v => v[v.length - 3];
for (let j = 0; j < M[0].top[0]; j++) tick(s, 9, 5);
for (let k = 0; k < M.length; k++) {
  const s4a = (S[s.c1c] + 0x20) << 4; renderPass(F, c);
  const nt = k + 1 < M.length ? irq(M[k + 1].top) - irq(M[k].top) : 2;
  // T13=n / T14=n: global tick number from which the ISR sees order 13 / the row >= 0x3c freeze of order 14 (the harness' tick phase against the music row, found by scanning; 531 / see NOTES)
  // PHASE=tick: the ISR sees the music row AT ITS tick (tick j of the pass = j-th vsync edge before the next loop top), not the row of the previous loop top (default, kept for the 70 Hz oracle)
  for (let j = 0; j < nt; j++) { gt++; const o = (TICKPOS && k + 1 < M.length ? posAt(M[k + 1].vt - t0 - (nt - 1 - j) / V + SHIFT) : ord(M[k].top)); tick(s, ...(T14 >= 0 && gt >= T14 && o[0] === 14 ? [14, Math.max(o[1], 0x3c)] : T13 >= 0 ? [Math.max(o[0], gt >= T13 ? 13 : 0), o[1]] : o)); }
  if (s.f14) { F.fill(0x7f); s.f14 = 0; }
  if (process.env.DBG && k > 262 && k < 270) console.log(k, "sim start", s.start, "f08", s.f08, "f18", s.f18, "ph3", s.ph[3], "amp", s.amp, "oracle off", M[k].off & 0xffff, "nt", nt);
  display(F, s.start, out); c = derive(s.ph, s4a);
  let d = 0; for (let i = 0; i < W; i++) if (out[i] !== idx[k * W + i]) d++;
  if (d) { bad++; badpx += d; if (bad < 12) console.log("pass", k, 'differing px', d); }
}
console.log('passes', M.length, 'bad', bad, 'differing px', badpx);
