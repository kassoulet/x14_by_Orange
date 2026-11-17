#!/usr/bin/env python3
"""export_fx2.py: fx2 static data -> web/assets/fx02.bin (from the unpacked image x14.mem.gz, flat = linear - 0x10fc0)
layout: sin/cos table 641 i32 (flat 0x275b2; cos(i) = S[129+i]) | A 256 i32 (0x271b2) | B 256 i32 (0x26db2) | palette 768 B 6-bit (0x27fbe)
| initial counters 0x26d1c..0x26da8 (35 i32) | 0x26500..0x2651c (7 i32) | 0x28f62..0x28f92 (12 i32)"""
import gzip, os
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
M = gzip.open(H + 're/x14.mem.gz').read(); B = 0x10fc0
g = lambda a, n: M[B + a:B + a + n]
open(H + 'web/assets/fx02.bin', 'wb').write(g(0x275b2, 641 * 4) + g(0x271b2, 1024) + g(0x26db2, 1024) + g(0x27fbe, 768) + g(0x26d1c, 0x8c) + g(0x26500, 0x1c) + g(0x28f62, 0x30))
