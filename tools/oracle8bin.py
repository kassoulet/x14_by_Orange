#!/usr/bin/env python3
"""oracle8bin.py ORACLE_DIR OUT_PREFIX: fx8 oracle (one frame per main-loop pass, hooks 0x5144d loop top / 0x514a9 crtc start) -> PREFIX.json (per pass: top = 27 state variables + vt, irqs, order, row)
+ PREFIX.idx (N x 96x320 displayed index planes) + PREFIX.pal (N x 768, 6-bit DAC at the frame hook)."""
import sys, json, numpy as np
fr = np.load(sys.argv[1] + '/fx8.npy', allow_pickle=True); out = sys.argv[2]
meta = [dict(top=f['tick'], vt=f['vt'], mt=f['mt'], irqs=f['irqs'], order=f['order'], row=f['row']) for f in fr]
d = fr[0]['dump']; print(len(fr), 'passes', fr[0]['idx'].shape, [k if not isinstance(k, tuple) else k for k in d])
json.dump(meta, open(out + '.json', 'w'))
open(out + '.idx', 'wb').write(b''.join(f['idx'].astype(np.uint8).tobytes() for f in fr)); open(out + '.pal', 'wb').write(b''.join(f['pal'].astype(np.uint8).tobytes() for f in fr))
for k, v in d.items():
    if isinstance(k, int): open(out + '.dump%x' % k, 'wb').write(v)
    elif k[1] == 'buf': open(out + '.buf%x' % k[0], 'wb').write(v)
