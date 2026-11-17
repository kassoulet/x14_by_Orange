#!/usr/bin/env python3
"""export_fx12.py: fx12 picture -> web/assets/fx12.bin = 0xfa3a bytes of DATA.DAT at len-0xe3845 (loaded by 0x179ca, see fx12.js for the layout)."""
import os
H = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = open(H + 'DATA.DAT', 'rb').read(); b = D[len(D) - 0xe3845:][:0xfa3a]; assert len(b) == 0xfa3a
open(H + 'web/assets/fx12.bin', 'wb').write(b)
