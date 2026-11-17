#!/usr/bin/env python3
"""export_fx0.py: fx0 data -> web/assets/fx00.bin = M (0x500 bytes: memory window flat 0xd3ed.. that the LUT builder 0xd5f3 reads as two dword tables: first 0x400 bytes = the ORACLE's dump at the first
loop top (re/oracle0/fx0.npy; the tables A/B are generated at run time, not in x14.mem.gz), the rest from the unpacked image) | colour table 4 x 768 (flat 0xc593) | 3 raw 64 KB textures | 768 B palette buffer (static bytes of flat 0xd1ad & 63; the ramps are written over it) |
(DATA.DAT seek -0x10000, -0x20000, -0x30000 from the end)."""
import gzip, os, numpy as np
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = open(H + 'DATA.DAT', 'rb').read(); Mi = gzip.open(H + 're/x14.mem.gz').read(); B = 0x10fc0
fr = np.load(H + 're/oracle0/fx0.npy', allow_pickle=True); d = fr[0]['dump']
M = d[0xd3ed] + Mi[B + 0xd7ed:B + 0xd8ed]
assert len(M) == 0x500 and d[0xc593] == Mi[B + 0xc593:B + 0xc593 + 0xc00]
tex = b''.join(D[len(D) - 0x10000 * (k + 1):len(D) - 0x10000 * k] for k in range(3))
pal0 = bytes(b & 63 for b in Mi[B + 0xd1ad:B + 0xd1ad + 768])
open(H + 'web/assets/fx00.bin', 'wb').write(M + d[0xc593] + tex + pal0)
print('M[0x27d] imm at d66d =', M[0xd66d - 0xd3ed:0xd66d - 0xd3ed + 4].hex(), 'd5f1', M[0xd5f1 - 0xd3ed:0xd5f1 - 0xd3ed + 3].hex(), 'd5ed', M[0xd5ed - 0xd3ed:0xd5ed - 0xd3ed + 4].hex())
