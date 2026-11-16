#!/usr/bin/env python3
"""export_fx5.py: fx5 data -> web/assets/fx05.bin
layout: picture 64000 B (DATA.DAT seek -0x7b701, 0xfa00 B, each byte >> 4 & 15 as the routine does at 0x5cecb) | sin/cos table 641 i32 (flat 0x4a45d, cos(i) = dword at 0x4a661+4i = S[129+i]) | palette source 96 B (flat 0x4b671, 32 colours).
Static data comes from the unpacked program (x14.mem.gz, flat = linear - 0x10fc0)."""
import gzip, os
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = open(H + 'DATA.DAT', 'rb').read(); M = gzip.open(H + 're/x14.mem.gz').read(); B = 0x10fc0
pic = D[len(D) - 0x7b701:][:0xfa00]; assert len(pic) == 0xfa00
g = lambda a, n: M[B + a:B + a + n]
open(H + 'web/assets/fx05.bin', 'wb').write(bytes(v >> 4 & 15 for v in pic) + g(0x4a45d, 641 * 4) + g(0x4b671, 96))
