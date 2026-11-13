#!/usr/bin/env python3
"""export_assets.py: cut the blobs the ported effects load out of DATA.DAT into web/assets/ (+ re/assets previews).
Offsets from the original code (flat offsets in re/NOTES.md): the loader 0x6a0a seeks (int 21h/42h whence 2 = from END of file) by the
signed 32-bit value in EAX, 0x6aad reads ECX bytes to EDX. Effects 3 and 6 call it as below, then RLE-decode with 0x2a5b3 (skips a 128 byte PCX header; PCX RLE:
byte>=0xC0 = run of (b&0x3f) of the next byte, else literal) until 64000 pixels, skip 1 byte (PCX 0x0C marker), then 768 palette bytes (8 bit, the code shifts >>2)."""
import sys, os, struct
import numpy as np
from PIL import Image
D = open(os.path.dirname(os.path.abspath(__file__)) + '/../DATA.DAT', 'rb').read()
HERE = os.path.dirname(os.path.abspath(__file__)) + '/../'
BLOBS = {3: (-0x44480, 0x4480), 6: (0xfffb0469 - (1 << 32), 0xb6e1)}   # fx: (seek from end, bytes read)
def pcx(b):
    o = bytearray(); i = 0x80   # 0x2a5b3 starts with add esi,0x80: PCX header skipped
    while len(o) < 64000:
        c = b[i]; i += 1
        if c & 0xc0 == 0xc0: n = c & 0x3f; o += bytes([b[i]]) * n; i += 1
        else: o.append(c)
    assert len(o) == 64000, len(o)
    return bytes(o), b[i + 1:i + 1 + 768], b[i]   # pixels, palette, the skipped byte
if __name__ == '__main__':
    for fx, (off, n) in BLOBS.items():
        b = D[len(D) + off:len(D) + off + n]; assert len(b) == n
        pix, pal, marker = pcx(b); pal = pal + bytes(768 - len(pal))   # fx6: the 46817-byte read ends 54 bytes short of the palette; the tail entries (>=238, unused by the picture, max index 157) are heap garbage in the original
        print('fx%d: file offset %d (0x%x), %d bytes, marker byte 0x%02x, pal bytes %d, max pal %d' % (fx, len(D) + off, len(D) + off, n, marker, len(pal), max(pal)))
        open(HERE + 'web/assets/fx%02d.bin' % fx, 'wb').write(pix + bytes(pal))   # 64000 indices + 768 palette bytes (8-bit as stored)
        p = np.frombuffer(pal, np.uint8).reshape(256, 3) >> 2; im = (p.astype(np.uint16)[np.frombuffer(pix, np.uint8).reshape(200, 320)] * 255 // 63).astype(np.uint8)
        Image.fromarray(im).save(HERE + 're/assets/fx%02d_320x200.png' % fx)
