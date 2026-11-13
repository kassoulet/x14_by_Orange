#!/usr/bin/env python3
"""extract_data.py: DATA.DAT -> re/assets/. DATA.DAT is NOT a directory-based container: it is a plain concatenation of blobs that the effects load by
absolute offset (or from the end of file) with raw read/seek; see assets/README / NOTES.md and golden/events.json (read log).
Decoded here: two RIX3 (ColoRIX) images, and a 64 KB-block overview sheet (every block as a 256x256 grey tile) to eyeball the rest."""
import numpy as np, struct, os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); A = HERE + '/assets'; os.makedirs(A, exist_ok=True)
d = open(HERE + '/../DATA.DAT', 'rb').read()
def pal6(b, n): return (np.frombuffer(b, np.uint8).reshape(n, 3).astype(int) * 255 // 63).astype(np.uint8)
# 0x00000: RIX3 640x200, 16 colours (palette 48 bytes), 4 bits/pixel high nibble first (4 sprite frames of 160x200)
w, h, pt, st = struct.unpack_from('<HHBB', d, 4); assert d[:4] == b'RIX3' and (w, h) == (640, 200)
p = pal6(d[10:58], 16); r = np.frombuffer(d[58:58 + 64000], np.uint8); px = np.stack([r >> 4, r & 15], 1).reshape(h, w)
Image.fromarray(p[px]).save(A + '/rix_000000_640x200_4bpp.png')
# 0x0fa3a: RIX3 256x200, 256 colours (palette 768), 8 bpp
o = 0xfa3a; w, h, pt, st = struct.unpack_from('<HHBB', d, o + 4); assert d[o:o + 4] == b'RIX3' and (w, h) == (256, 200)
p = pal6(d[o + 10:o + 778], 256); px = np.frombuffer(d[o + 778:o + 778 + w * h], np.uint8).reshape(h, w)
Image.fromarray(p[px]).save(A + '/rix_00fa3a_256x200_8bpp.png'); print('second RIX3 ends at', hex(o + 778 + w * h))
# overview: each 64 KB block as 256x256 grey tile
n = (len(d) + 65535) // 65536; cols = 5; rows = (n + cols - 1) // cols
sh = np.zeros((rows * 256, cols * 256), np.uint8)
for i in range(n):
    b = np.frombuffer(d[i * 65536:(i + 1) * 65536].ljust(65536, b'\0'), np.uint8).reshape(256, 256); sh[(i // cols) * 256:(i // cols + 1) * 256, (i % cols) * 256:(i % cols + 1) * 256] = b
Image.fromarray(sh).save(A + '/datdat_64k_blocks.png'); print('blocks', n, 'file', len(d))
