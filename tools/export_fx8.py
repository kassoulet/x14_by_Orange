#!/usr/bin/env python3
"""export_fx8.py: fx8 data -> web/assets/fx08.bin = texture (0xc800 bytes: DATA.DAT seek 0xfff703ff=-0x8fc01 from the end, read 0xc800, 0x62329..0x6234a)
+ sine (512 i32, flat 0x4eac8) + shade table (256 bytes, flat 0x4e25a) + palette source (96 bytes, flat 0x506e4+0x300 = first 32 colours, 6-bit).
Sine, shade table and palette source are static initial data of the unpacked program (x14.mem.gz, flat = linear - 0x10fc0)."""
import gzip, os
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = open(H + 'DATA.DAT', 'rb').read(); M = gzip.open(H + 're/x14.mem.gz').read(); B = 0x10fc0
tex = D[len(D) - 0x8fc01:][:0xc800]; assert len(tex) == 0xc800
open(H + 'web/assets/fx08.bin', 'wb').write(tex + M[B + 0x4eac8:B + 0x4eac8 + 2048] + M[B + 0x4e25a:B + 0x4e25a + 256] + M[B + 0x506e4 + 0x300:B + 0x506e4 + 0x300 + 96])
