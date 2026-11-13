#!/usr/bin/env python3
"""export_fx7.py: fx7 (growing ring) static data -> web/assets/fx07.bin = blob (32000 bytes: 100 rows x 80 pairs of u16 texture offsets, DATA.DAT seek -0x83401 from the end,
read 0x7d00 by 0x4d785..0x4d790) + sine table (512 i32 at flat 0x4c820) + palette source table (48 bytes at 0x4c2ad) + steps 0x4c295, 0x4c299 (2 x i32).
The tables are static initial data of the unpacked program (x14.mem.gz, flat = linear - 0x10fc0)."""
import gzip, os, struct
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = open(H + 'DATA.DAT', 'rb').read(); M = gzip.open(H + 're/x14.mem.gz').read(); B = 0x10fc0
blob = D[len(D) - 0x83401:len(D) - 0x83401 + 0x7d00]; assert len(blob) == 0x7d00
f = lambda a, n: M[B + a:B + a + n]
sine = f(0x4c820, 2048); ptab = f(0x4c2ad, 48); steps = f(0x4c295, 4) + f(0x4c299, 4)
open(H + 'web/assets/fx07.bin', 'wb').write(blob + sine + ptab + steps)
s = struct.unpack('<512i', sine); print('sine min/max', min(s), max(s), 'steps', struct.unpack('<2i', steps), 'blob words max', max(struct.unpack('<16000H', blob)))
