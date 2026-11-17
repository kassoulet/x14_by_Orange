#!/usr/bin/env python3
"""oracle01bin.py ORACLE_DIR OUT_PREFIX FX: fx0/fx1 oracle (fx_oracle.py HK[0], HK[1]) -> PREFIX.json (per pass: top = counters at the loop top + [vt, irqs, order, row], mid = counters read at the
middle hook (fx0: 0xdc99 [753b,753f], fx1: 0x25b3c phases), vt, mt, order), PREFIX.idx (N x 400 x 320 displayed), PREFIX.pal (DAC at the frame hook), PREFIX.dump<addr>/.buf<addr> (first-top dumps)."""
import sys, json, numpy as np
fx = sys.argv[3]; fr = np.load(sys.argv[1] + '/fx%s.npy' % fx, allow_pickle=True); out = sys.argv[2]
json.dump([dict(top=[int(x) if isinstance(x, (int, np.integer)) else float(x) for x in f['tick']], mid=list(map(float, f['mid'])) if f.get('mid') else None, vt=f['vt'], mt=f['mt'], order=f['order']) for f in fr], open(out + '.json', 'w'))
open(out + '.idx', 'wb').write(b''.join(f['idx'].astype(np.uint8).tobytes() for f in fr)); open(out + '.pal', 'wb').write(b''.join(f['pal'].astype(np.uint8).tobytes() for f in fr))
print(len(fr), 'passes', fr[0]['idx'].shape, 'order', fr[0]['order'], '..', fr[-1]['order'])
for k, v in fr[0]['dump'].items():
    if isinstance(k, int): open(out + '.dump%x' % k, 'wb').write(v)
    elif isinstance(k, tuple) and k[1] == 'buf': open(out + '.buf%x' % k[0], 'wb').write(v)
