#!/usr/bin/env python3
"""unpack_pklite.py EXE OUT_PREFIX - unpack a PKLITE'd real-mode DOS EXE by running its own stub under Unicorn.
Loads the MZ like DOS (PSP at 0x1000:0, image at 0x1010, relocations applied), emulates minimal int 21h, and watches memory writes:
the first instruction fetched from a page that the stub WROTE earlier and that is not in the stub's own (relocated) copy = the unpacked program's entry.
Writes OUT_PREFIX.mem (1 MB real-mode memory at stop) and prints entry cs:ip and the extent of written memory. Needs unicorn (user site, no python -I)."""
import sys, struct, os
from unicorn import *; from unicorn.x86_const import *
exe, out = sys.argv[1], sys.argv[2]
d = open(exe, 'rb').read()
last, pages, nrel, hdr, mina, maxa, ss, sp, _, ip, cs, relo = struct.unpack('<HHHHHHHHHHHH', d[2:26])
size = (pages - 1) * 512 + last if last else pages * 512
img = d[hdr * 16:size]
PSP = 0x1000; LOAD = PSP + 0x10
mu = Uc(UC_ARCH_X86, UC_MODE_16); mu.mem_map(0, 0x100000 + 0x10000)
mu.mem_write(LOAD * 16, img)
for i in range(nrel):
    off, seg = struct.unpack('<HH', d[relo + i * 4:relo + i * 4 + 4]); a = (LOAD + seg) * 16 + off
    v = struct.unpack('<H', bytes(mu.mem_read(a, 2)))[0]; mu.mem_write(a, struct.pack('<H', (v + LOAD) & 0xffff))
mu.mem_write(PSP * 16, b'\xcd\x20' + struct.pack('<H', 0x9fc0)); mu.mem_write(PSP * 16 + 0x80, b'\x00\r')
for n in range(256):   # IVT -> 0xF000:n*4 stubs (iret)
    mu.mem_write(0xF0000 + n * 4, b'\xcf'); mu.mem_write(n * 4, struct.pack('<HH', n * 4, 0xF000))
R = mu.reg_write; G = mu.reg_read
R(UC_X86_REG_CS, (LOAD + cs) & 0xffff); R(UC_X86_REG_IP, ip); R(UC_X86_REG_SS, (LOAD + ss) & 0xffff); R(UC_X86_REG_SP, sp)
R(UC_X86_REG_DS, PSP); R(UC_X86_REG_ES, PSP)
written = set(); stub = set(range(LOAD * 16 >> 12, (LOAD * 16 + len(img) + 0xfff) >> 12))
res = {}
def wr(uc, acc, a, sz, v, _): written.add(a >> 4)
def fetch(uc, a, sz, _):
    if (a >> 4) in written and LOAD * 16 <= a < 0x60000 and 'hit' not in res and len(written) > 0x400:
        res['hit'] = (G(UC_X86_REG_CS), G(UC_X86_REG_IP)); uc.emu_stop()
mu.hook_add(UC_HOOK_MEM_WRITE, wr); mu.hook_add(UC_HOOK_CODE, fetch)
def intr(uc, n, _):
    ax = G(UC_X86_REG_AX); ah = ax >> 8
    if n == 0x21 and ah == 0x4c: res['exit'] = ax & 255; uc.emu_stop()
mu.hook_add(UC_HOOK_INTR, intr)
try: mu.emu_start((LOAD + cs) * 16 + ip, 0, timeout=60 * 1000000)
except UcError as e: print('err', e, hex(G(UC_X86_REG_CS)), hex(G(UC_X86_REG_IP)))
print('result', {k: (tuple(hex(x) for x in v) if isinstance(v, tuple) else v) for k, v in res.items()}, 'PSP seg', hex(PSP), 'load seg', hex(LOAD))
lo, hi = min(written) * 16, max(written) * 16 + 16
print('written paragraphs', len(written), hex(lo), hex(hi))
open(out + '.mem', 'wb').write(bytes(mu.mem_read(0, 0x100000)))
