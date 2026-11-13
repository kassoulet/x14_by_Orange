#!/usr/bin/env python3
"""contact.py DIR OUT.png [COLS=6] [W=213]: contact sheet of DIR/m*.png scaled to 4:3 tiles (mode X 320x400 pixels are not square: displayed 4:3)."""
import sys, glob, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6; W = int(sys.argv[4]) if len(sys.argv) > 4 else 213; H = W * 3 // 4
fs = sorted(glob.glob(d + '/m*.png')); rows = (len(fs) + cols - 1) // cols
sh = Image.new('RGB', (cols * W, rows * H), (30, 30, 30)); dr = ImageDraw.Draw(sh)
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((W, H), Image.BILINEAR); sh.paste(im, ((i % cols) * W, (i // cols) * H))
    dr.text(((i % cols) * W + 3, (i // cols) * H + 2), '%.1fs' % (int(os.path.basename(f)[1:5]) / 10), fill=(255, 255, 0))
sh.save(out)
