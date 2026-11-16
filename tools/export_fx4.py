#!/usr/bin/env python3
"""export_fx4.py: fx4 data -> web/assets/fx04.bin
layout: texture 65536 B (PCX in DATA.DAT, seek -0x6bd01 from the end, 0xc76a bytes: 0x80 header, RLE (b&0xc0==0xc0: run (b&63) x next byte) until 0x10000 px, 1 skip byte, 768 B palette >>2 -> palette source)
| sin/cos table 5122 i32 (flat 0x30349; cos(i) = dword at 0x3134d+4i) | shade table 4160 B (flat 0x478e3) | palette source 96 B (first 32 colours of the PCX palette, >>2)
| block-0 palette 96 B (static flat 0x49bbc) | start picture 64000 B (DATA.DAT seek -0x5f597, 0xfa00 B) | initial DAC 768 B (static flat 0x2fff1).
Static data comes from the unpacked program (x14.mem.gz, flat = linear - 0x10fc0)."""
import gzip, os
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = open(H + 'DATA.DAT', 'rb').read(); M = gzip.open(H + 're/x14.mem.gz').read(); B = 0x10fc0
f = D[len(D) - 0x6bd01:][:0xc76a]; assert len(f) == 0xc76a
s = 0x80; tex = bytearray()
while len(tex) != 0x10000:
    b = f[s]; s += 1
    if b & 0xc0 == 0xc0: tex += bytes([f[s]]) * (b & 63); s += 1
    else: tex.append(b)
s += 1; pal = bytes(v >> 2 for v in f[s:s + 768])
pic = D[len(D) - 0x5f597:][:0xfa00]; assert len(pic) == 0xfa00
g = lambda a, n: M[B + a:B + a + n]
open(H + 'web/assets/fx04.bin', 'wb').write(bytes(tex) + g(0x30349, 5122 * 4) + g(0x478e3, 0x1040) + pal[:96] + g(0x49bbc, 96) + pic + g(0x2fff1, 768))
print(len(tex), s)
