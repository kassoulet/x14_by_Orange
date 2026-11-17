// seektest.mjs: fx07/fx09 render(t) after sequential playback == render(t) after a direct seek (pure function of t in the ideal schedule)
import fs from 'fs';
for (const [n, t0] of [['00', 4], ['07', 118.3], ['09', 148]]) {
  const m = await import(`../web/fx/fx${n}.js`); await m.init(fs.readFileSync(new URL(`../web/assets/fx${n}.bin`, import.meta.url)));
  const mk = () => ({ idx: new Uint8Array(320 * 400), pal: new Uint8Array(768), h: 0 }), a = mk(), b = mk(); const T = t0 + 6;
  let tl = 0; for (let t = t0 + 5; t <= T; t += 1 / 70.086) { m.render(t, a); tl = t; }
  m.render(t0 + 1, b); m.render(tl, b);   // b: jump back, then seek to the same instant
  let d = 0; for (let k = 0; k < a.idx.length; k++) d += a.idx[k] !== b.idx[k]; for (let k = 0; k < 768; k++) d += a.pal[k] !== b.pal[k];
  console.log('fx' + n, d === 0 ? 'PASS' : 'FAIL ' + d); if (d) process.exitCode = 1;
}
