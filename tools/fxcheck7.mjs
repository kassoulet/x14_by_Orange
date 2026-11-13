// fxcheck7.mjs PREFIX: validates fx07.js pass()/draw() against the Unicorn oracle (tools/oracle7bin.py) using the ORACLE's own schedule (tau, rows generated per pass, S3M position).
import fs from 'fs';
const pre = process.argv[2], m = await import('../web/fx/fx07.js'), meta = JSON.parse(fs.readFileSync(pre + '.json')), I = fs.readFileSync(pre + '.idx'), P = fs.readFileSync(pre + '.pal');
m.E.v = 0; await m.init(fs.readFileSync(new URL('../web/assets/fx07.bin', import.meta.url)));
const ctx = { idx: new Uint8Array(32000), pal: new Uint8Array(768), h: 100 }, c = m.newState(); let nrace = 0, bad = 0, badF = 0, first = -1;
for (let i = 0; i < meta.length; i++) {
  const f = meta[i], tau = f.top[0]; if (JSON.stringify(m.paramsAt(tau)) !== JSON.stringify(f.par)) nrace++; m.pass(c, f.par, f.gen, m.isBlack(f.top[21], f.top[22])); m.draw(c, f.off >> 8, ctx);
  let n = 0; for (let k = 0; k < 32000; k++) if (ctx.idx[k] !== I[i * 32000 + k]) n++;
  if (n) { bad += n; badF++; if (first < 0) first = i; }
}
m.setPalette(ctx); let pb = 0; for (let k = 0; k < 768; k++) if (ctx.pal[k] !== Math.floor(P[k] * 255 / 63)) pb++;
console.log(`(passes whose row parameters differ from the closed form of the loop-top tick count = ISR tick between two reads: ${nrace})`);
console.log(`fx7: ${meta.length} frames, bad frames ${badF} (first ${first}), differing pixels ${bad}, differing palette bytes ${pb}`);
if (bad || pb) process.exitCode = 1;
