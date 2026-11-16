#!/usr/bin/env python3
"""oracle5bin.py ORACLE_DIR OUT_PREFIX [FX=5]: fx5 oracle (loop top 0x4bf28, frame hook 0x4bfe4 after the vsync wait, palette upload hook 0x4c0fd) -> PREFIX.json (per pass: v = state at the loop top
[p14,p18,p1c,p20,p30,p3c,p40,p44,p48,fade], upfade = fade used by the upload, vt, mt, irqs, order, top = tick list for mk_entries) + PREFIX.idx (N x H x 320 displayed) + PREFIX.pal (DAC at the frame hook) + PREFIX.vram0 + dumps."""
import sys, json, numpy as np
fr = np.load(sys.argv[1] + '/fx%s.npy' % (sys.argv[3] if len(sys.argv)>3 else '5') + '', allow_pickle=True); out = sys.argv[2]
meta = [dict(v=list(f['tick'][:10]), upfade=(f['upprev'][1] if f.get('upprev') else None), vt=f['vt'], mt=f['mt'], irqs=f['irqs'], order=f['order'], top=list(f['tick'])) for f in fr]
json.dump(meta, open(out + '.json', 'w'))
open(out + '.idx', 'wb').write(b''.join(f['idx'].astype(np.uint8).tobytes() for f in fr)); open(out + '.pal', 'wb').write(b''.join(f['pal'].astype(np.uint8).tobytes() for f in fr))
print(len(fr), 'passes', fr[0]['idx'].shape, 'order', fr[0]['order'], '..', fr[-1]['order'])
d = fr[0]['dump']
for k, v in d.items():
    if isinstance(k, int): open(out + '.dump%x' % k, 'wb').write(v)
    elif isinstance(k, tuple) and k[1] == 'buf': open(out + '.buf%x' % k[0], 'wb').write(v)
    elif k == 'vram0' and v is not None: open(out + '.vram0', 'wb').write(v.astype(np.uint8).tobytes())
