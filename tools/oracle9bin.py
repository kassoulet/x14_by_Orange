#!/usr/bin/env python3
"""oracle9bin.py ORACLE_DIR OUT_PREFIX: fx9 oracle (re/fx_oracle.py, one frame per main-loop pass) -> PREFIX.json (per frame: order,row, top = loop-top counters, b99 = [0x57b99] at the blit,
T = table 0x51a37 at the blit, F = fade value of the palette uploaded at the end of this pass) + PREFIX.idx (N x 133x320) + PREFIX.pal (N x 768, 6-bit, the pass's own upload)."""
import sys, json, numpy as np
fr = np.load(sys.argv[1] + '/fx9.npy', allow_pickle=True); out = sys.argv[2]; N = len(fr) - 1   # pass k's upload is recorded by pass k+1 (upprev): drop the last pass
meta = [dict(vt=f['vt'], mt=f['mt'], order=f['order'], row=f['row'], top=f['tick'], b99=f['par'][0], page=f['par'][1], T=[int(x) for x in np.frombuffer(f['par'][3], '<i4')], F=fr[k + 1]['upprev'][1]) for k, f in enumerate(fr[:N])]
json.dump(meta, open(out + '.json', 'w')); print(N, 'frames', fr[0]['idx'].shape)
open(out + '.idx', 'wb').write(b''.join(f['idx'].astype(np.uint8).tobytes() for f in fr[:N]))
open(out + '.pal', 'wb').write(b''.join(fr[k + 1]['upprev'][0].astype(np.uint8).tobytes() for k in range(N)))
