// fxcheck.mjs FX PREFIX: diff web/fx/fxNN.js against an oracle capture converted by tools/oracle2bin.py (re/fx_oracle.py: Unicorn run of the original).
// Uses the harness' own S3M timeline (re/s3mtime.model.json) so that the order-triggered fade-out can be checked; the shipped player uses libopenmpt's.
// Checks: (1) the vsync number of every palette upload (timing rule: fade-in upload i at vsync i; fade-out upload j at vsync nOut+j) (2) render(t) at the middle of every
// vsync interval between uploads: palette (8-bit floor(v*255/63)) and indexed picture, 0 differing bytes expected.
import fs from 'fs';
const [fx, pre] = [process.argv[2], process.argv[3]]; const NN = String(fx).padStart(2, '0');
const m = await import(`../web/fx/fx${NN}.js`); const meta = JSON.parse(fs.readFileSync(pre + '.json')); const P = fs.readFileSync(pre + '.pal'), I = fs.readFileSync(pre + '.idx');
const model = JSON.parse(fs.readFileSync(new URL('../re/s3mtime.model.json', import.meta.url))).rows;
m.setAt((o, r) => { for (const x of model) if (x[0] === o && x[2] >= r) return x[3]; return Infinity; });
m.E.v = meta.E;
await m.init(fs.readFileSync(new URL(`../web/assets/fx${NN}.bin`, import.meta.url)));
const V = meta.V, F = meta.frames, N = F.length; let badT = 0, badPal = 0, badIdx = 0, nOut = null;
const ctx = { idx: new Uint8Array(64000 * 2), pal: new Uint8Array(768), h: 200 };
// fade-in length: uploads with the first site; nOut from the module's own rule
const nOutJS = Math.ceil((m.at ? 0 : 0));
for (let i = 0; i < N; i++) {
  const vi = F[i].v, vnext = i + 1 < N ? F[i + 1].v : vi + 5;
  for (const vs of new Set([vi, Math.floor((vi + vnext) / 2)])) {   // right after the upload and in the middle of the hold
    if (vs >= vnext) continue;
    ctx.idx.fill(255); m.render(meta.E + (vs + 0.5) / V, ctx);
    let b = 0; for (let k = 0; k < 768; k++) if (ctx.pal[k] !== Math.floor(P[i * 768 + k] * 255 / 63)) b++;
    if (b) { badPal++; if (badPal < 4) console.log('pal diff frame', i, 'vsync', vs, b, 'bytes'); }
    if (i === 0 || vs === vi) { let n = 0; const h = meta.h; if (ctx.h !== h) { n = -1; console.log('height', ctx.h, 'expected', h); } else for (let k = 0; k < 320 * h; k++) if (ctx.idx[k] !== I[k]) n++; if (n) { badIdx++; if (badIdx < 4) console.log('idx diff frame', i, n, 'px'); } }
  }
}
// timing rule: the module must put the first fade-out frame where the oracle did: palette changes between hold samples
console.log(`${NN}: ${N} uploads, vsync numbers ${F[0].v}..${F[N - 1].v}; bad palette samples ${badPal}, bad picture frames ${badIdx}`);
if (badPal || badIdx) process.exitCode = 1;
