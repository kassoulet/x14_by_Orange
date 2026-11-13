#!/usr/bin/env python3
"""oracle7bin.py ORACLE_DIR OUT_PREFIX: fx7 oracle (re/fx_oracle.py, one frame per main-loop pass) -> PREFIX.json (per frame: vt, mt, irqs, order, row, gen, tick = counters at the loop top)
+ PREFIX.idx (N x 320x100 indexed pictures) + PREFIX.pal (768 bytes, 6-bit, of the last frame)."""
import sys, json, numpy as np
fr = np.load(sys.argv[1] + '/fx7.npy', allow_pickle=True); out = sys.argv[2]
meta = [dict(par=f.get('par'), off=f.get('off'), vt=f['vt'], mt=f['mt'], irqs=f['irqs'], order=f['order'], row=f['row'], gen=f['gen'], top=f['tick']) for f in fr]
h = fr[0]['idx'].shape; print(len(fr), 'frames', h, {k: v for k, v in fr[0]['crtc'].items() if k in (9, 0x12, 0x13, 7, 0x18)})
json.dump(meta, open(out + '.json', 'w'))
open(out + '.idx', 'wb').write(b''.join(f['idx'].astype(np.uint8).tobytes() for f in fr)); open(out + '.pal', 'wb').write(fr[-1]['pal'].astype(np.uint8).tobytes())
