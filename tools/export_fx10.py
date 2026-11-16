#!/usr/bin/env python3
"""export_fx10.py: fx10 data -> web/assets/fx10.bin
layout: picture 64000 B (DATA.DAT seek -0xb7301, 0xfa00 B: only its left/right 32-pixel strips are shown) | texture 65536 B (seek -0xc7301) | sin/cos table 641 i32 (flat 0x585be, cos(i) = S[129+i])
| palette 768 B (flat 0x592c6 (128 colours) then 0x59146 (128 colours), 6-bit). Static data from the unpacked program (x14.mem.gz, flat = linear - 0x10fc0)."""
import gzip, os
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = open(H + 'DATA.DAT', 'rb').read(); M = gzip.open(H + 're/x14.mem.gz').read(); B = 0x10fc0
pic = D[len(D) - 0xb7301:][:0xfa00]; tex = D[len(D) - 0xc7301:][:0x10000]; assert len(pic) == 0xfa00 and len(tex) == 0x10000
g = lambda a, n: M[B + a:B + a + n]
open(H + 'web/assets/fx10.bin', 'wb').write(pic + tex + g(0x585be, 641 * 4) + g(0x592c6, 384) + g(0x59146, 384))
