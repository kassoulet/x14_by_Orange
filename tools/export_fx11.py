#!/usr/bin/env python3
"""export_fx11.py: fx11 data -> web/assets/fx11.bin
layout: sin/cos table 641 i32 (flat 0x684a2, cos(i) = S[129+i]) | texture 0xc800 B (512 x 100, DATA.DAT seek -0xd3e0b + 0x30a) | font 0x2400 B (flat 0x6a367: 36 glyph widths, bitmap 320 wide from +0x24)
| text 0x1000 B (flat 0x79d8b) | 16 colours x 3 (6-bit, DATA.DAT seek -0xd3e0b + 0xa). The 16 shade palettes (flat 0x67b9e) are built at run time by init code 0x7a6c9 (factors F below)."""
import gzip, os, sys
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = open(H + 'DATA.DAT', 'rb').read(); M = gzip.open(H + 're/x14.mem.gz').read(); B = 0x10fc0
f = D[len(D) - 0xd3e0b:][:0xcb0a]; g = lambda a, n: M[B + a:B + a + n]
tex, pal = f[0x30a:0x30a + 0xc800], f[0xa:0xa + 48]
F = [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256]
shades = bytes(min(63, p * F[j] >> 7) for j in range(16) for p in pal)
if len(sys.argv) > 1: assert shades == open(sys.argv[1], 'rb').read()[0xc800:0xcb00], 'shade palettes differ from the oracle dump'
open(H + 'web/assets/fx11.bin', 'wb').write(g(0x684a2, 641 * 4) + tex + g(0x6a367, 0x2400) + g(0x79d8b, 0x1000) + pal)
