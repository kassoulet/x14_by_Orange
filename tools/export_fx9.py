#!/usr/bin/env python3
"""export_fx9.py: fx9 data -> web/assets/fx09.bin = texture (0x10000 bytes, DATA.DAT seek 0xfff603ff=-0x9fc01 from the end, read 0x10000 by 0x57d32..0x57d47)
+ word table (0x7d00 bytes, seek 0xfff586ff=-0xa7901, 0x57d5d..0x57d6d) + sine (512 i32 at flat 0x52181) + palette source (768 bytes at flat 0x51e4f; 6-bit values, scaled by the fade at 0x5807b).
Sine and palette source are static initial data of the unpacked program (x14.mem.gz, flat = linear - 0x10fc0)."""
import gzip, os
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = open(H + 'DATA.DAT', 'rb').read(); M = gzip.open(H + 're/x14.mem.gz').read(); B = 0x10fc0
tex = D[len(D) - 0x9fc01:][:0x10000]; tab = D[len(D) - 0xa7901:][:0x7d00]; assert len(tex) == 0x10000 and len(tab) == 0x7d00
open(H + 'web/assets/fx09.bin', 'wb').write(tex + tab + M[B + 0x52181:B + 0x52181 + 2048] + M[B + 0x51e4f:B + 0x51e4f + 768])
