#!/usr/bin/env python3
"""oracle12bin.py ORACLE_DIR OUT_PREFIX: fx12 oracle (one record at the wait loop for order 0x3b, after the planar copy) -> PREFIX.json {E, order, crtc} (E = music seconds of the record),
PREFIX.planes (4 x 65536 VRAM plane bytes) + PREFIX.pal (768 B, 6-bit DAC)."""
import sys, json, numpy as np
f = np.load(sys.argv[1] + '/fx12.npy', allow_pickle=True)[0]; out = sys.argv[2]
json.dump(dict(E=f['mt'], order=int(f['order']), crtc={str(k): int(v) for k, v in f['crtc'].items()}), open(out + '.json', 'w'))
open(out + '.planes', 'wb').write(b''.join(f['planes'])); open(out + '.pal', 'wb').write(np.asarray(f['pal'], dtype=np.uint8).tobytes())
print('E', f['mt'], 'order', f['order'], 'crtc', f['crtc'])
