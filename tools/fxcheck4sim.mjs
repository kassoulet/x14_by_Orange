// node tools/fxcheck4sim.mjs PREFIX : fx4 simulated state (tick/pass sim) vs oracle snapshots: image inputs, ec4, fade must match by pass index
import fs from 'fs'; import { init, stateAfter } from '../web/fx/fx04.js';
const M = JSON.parse(fs.readFileSync(process.argv[2] + '.json')); await init(fs.readFileSync(new URL('../web/assets/fx04.bin', import.meta.url)));
let bad = 0; for (let f = 1; f < M.length; f++) { const v = M[f].v, s = stateAfter(f), h = a => v[a] | 0, i = s.iv;
  if (i.s2ffd9 !== h('0x2ffd9') || i.a1 !== h('0x49bb4') || i.b1 !== h('0x49bb8') || s.ec4 !== h('0x49ec4') || s.fade !== h('0x2afc5')) { if (bad++ < 5) console.log('state', f, JSON.stringify(i), s.ec4, s.fade, 'vs', v['0x2ffd9'], v['0x49bb4'], v['0x49ec4'], v['0x2afc5']); } }
console.log('states', M.length - 1, 'bad', bad);
