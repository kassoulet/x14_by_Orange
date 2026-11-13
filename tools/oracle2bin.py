#!/usr/bin/env python3
"""oracle2bin.py ORACLE_DIR FX OUT_PREFIX: re/fx_oracle.py capture -> OUT_PREFIX.json (per palette upload: vt, mt, irqs, order, row, site; t0 = music clock origin; grid-aligned
entry E), OUT_PREFIX.pal (N x 768 bytes, 6-bit DAC), OUT_PREFIX.idx (displayed indices at the end of the effect = the picture, h x 320)."""
import sys, json, re, numpy as np
d, fx, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]; skip = int(sys.argv[4]) if len(sys.argv) > 4 else 0   # skip = leading uploads before the picture exists (fx6: the black-palette init upload)
fr = np.load('%s/fx%d.npy' % (d, fx), allow_pickle=True); last = fr[-1]['idx']; fr = fr[skip:]
log = open(d + '/log.txt').read(); t0 = float(re.search(r'effect 0 vt=([\d.]+)', log).group(1))   # logged to 4 decimals
V = 70.086
k0 = round(fr[0]['vt'] * V)   # retrace edges of the harness are at k/V of the absolute virtual clock (3DA model), uploads follow them
meta = dict(t0=t0, V=V, k0=k0, E=k0 / V - t0, frames=[dict(vt=f['vt'], mt=f['mt'], irqs=int(f['irqs']), order=int(f['order']), row=int(f['row']), site=hex(f['site']), v=round(f['vt'] * V) - k0) for f in fr], h=int(last.shape[0]), skip=skip)
json.dump(meta, open(out + '.json', 'w')); open(out + '.pal', 'wb').write(b''.join(np.asarray(f['pal'], np.uint8).tobytes() for f in fr)); open(out + '.idx', 'wb').write(np.asarray(last, np.uint8).tobytes())
print(len(fr), 'frames, E=%.5f, vsync number of uploads (first 3, last 3):' % meta['E'], [f['v'] for f in meta['frames'][:3]], [f['v'] for f in meta['frames'][-3:]])
