#!/usr/bin/env python3
"""export_fx1.py: fx1 data -> web/assets/fx01.bin from the ORACLE's first-loop-top dumps (re/oracle1c/fx1.npy: map, texture, LUT are built at run time by the init 0x25a14 / the LUT builder, not in x14.mem.gz):
sine table 4096 i32 (flat 0xfc24) | warp map 160x120 u16 (24d14) | texture planes 3 x 64 KB (d193; 4th 64 KB = 0) | blend LUT 64 KB (d5ed) | overlay source 0x1500 (e2c0) | colour table 0x300 (f6c0) | base palette 0x300 (24d49)."""
import os, numpy as np
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
fr = np.load(H + 're/oracle1c/fx1.npy', allow_pickle=True); d = fr[0]['dump']
pk = lambda a: next(v for k, v in d.items() if isinstance(k, tuple) and k[1] == 'buf' and k[0] == a)
ptr = lambda a: d[(a, 'ptr')]
parts = [d[0xfc24][:0x4000], pk(ptr(0x24d14)), pk(ptr(0xd193)).ljust(0x40000, b'\0'), pk(ptr(0xd5ed)), d[0xe2c0], d[0xf6c0], d[0x24d49], pk(ptr(0xd19f))]
print([len(p) for p in parts]); open(H + 'web/assets/fx01.bin', 'wb').write(b''.join(parts))
