// fxcheck9.mjs PREFIX: validates fx09.js blit()/tableT()/fade against the Unicorn oracle (tools/oracle9bin.py) with the ORACLE's own per-pass inputs (T table, base), and the closed forms
// (tableAt/b99At from the loop-top tick count) on the passes where no ISR tick fell between the counter reads.
import fs from 'fs';
const pre = process.argv[2], m = await import('../web/fx/fx09.js'), meta = JSON.parse(fs.readFileSync(pre + '.json')), I = fs.readFileSync(pre + '.idx'), P = fs.readFileSync(pre + '.pal');
m.E.v = 0; await m.init(fs.readFileSync(new URL('../web/assets/fx09.bin', import.meta.url)));
const ctx = { idx: new Uint8Array(133 * 320), pal: new Uint8Array(768) }, vram = new Uint8Array(65536); let bad = 0, badF = 0, badP = 0, closedT = 0, closedB = 0;
const SZ = 133 * 320; let split = 0, palSplit = 0;
const diff = (idx, i) => { let n = 0, first = -1; for (let k = 0; k < SZ; k++) if (idx[k] !== I[i * SZ + k]) { n++; if (first < 0) first = k; } return [n, first]; };
// The ISR (0x57ec3) advances b99 and the fade value F while the main loop is inside the blit / the palette loop (the harness delivers IRQ0 every 2000 instructions): a pass whose
// output differs from the single-value model is accepted ONLY if one switch point (word / palette entry) to the value of a later tick (b99At(tau+d), F+4d) reproduces it exactly.
for (let i = 0; i < meta.length; i++) {
  const f = meta[i], T = Int32Array.from(f.T); vram.fill(0); m.blit(vram, T, f.b99); m.showVram(vram, ctx);
  let [n, first] = diff(ctx.idx, i);
  if (n) {   // the blit's second part used the b99 of a later tick
    const tau = (1229 * f.top[9]) & 0x7ff; let ok = false;
    for (let d = 1; d <= 6 && !ok; d++) { const b2 = m.b99At(tau + d); for (let j = Math.max(0, ((first - 0x1400) >> 1) - 400); j <= Math.max(0, (first - 0x1400) >> 1) && !ok; j++) {
      vram.fill(0); m.blit(vram, T, f.b99, b2, j); m.showVram(vram, ctx); if (diff(ctx.idx, i)[0] === 0) { ok = true; split++; } } }
    if (!ok) {   // several ticks inside one blit: per word the oracle texel must equal the texel of a b99 candidate (b0, then later ticks), candidate index non-decreasing
      let cur = 0, good = true; const cand = [f.b99]; for (let d = 1; d <= 8; d++) cand.push(m.b99At(tau + d));
      for (let w = 0; w < 16000 && good; w++) { const want = I[i * SZ + 0x1400 + 2 * w], wd = m.word(w); let c = cur;
        for (; c < cand.length; c++) if (m.texel(wd, cand[c], T) === want) break; if (c === cand.length) good = false; else cur = c; }
      if (good) { ok = true; split++; } }
    if (!ok) { bad += n; badF++; if (badF < 4) console.log('pic diff pass', i, n, 'px first', first); }
  }
  let pb = 0; m.setPal(ctx, f.F); for (let k = 0; k < 768; k++) if (ctx.pal[k] !== Math.floor(P[i * 768 + k] * 255 / 63)) pb++;
  if (pb) { let ok = false; for (let d = -6; d <= 6 && !ok; d++) for (let j = 1; j < 768 && !ok && d; j++) { for (let k = 0; k < 768; k++) ctx.pal[k] = m.to8(m.fade(k < j ? Math.max(0, Math.min(512, f.F - 4 * d)) : f.F, k)); let q = 0; for (let k = 0; k < 768; k++) if (ctx.pal[k] !== Math.floor(P[i * 768 + k] * 255 / 63)) q++; if (!q) { ok = true; palSplit++; } } if (!ok) badP += pb; }
  const tau2 = (1229 * f.top[9]) & 0x7ff; if (m.tableAt(tau2).every((v, j) => v === T[j])) closedT++;
  if (m.b99At(tau2) === f.b99) closedB++;
}
console.log(`(passes explained by one mid-pass ISR switch: blit ${split}, palette ${palSplit})`);
console.log(`fx9: ${meta.length} passes, bad pictures ${badF} (${bad} px), differing palette bytes ${badP}; closed-form table T matches ${closedT}/${meta.length}, base b99 ${closedB}/${meta.length}`);
if (bad || badP) process.exitCode = 1;
