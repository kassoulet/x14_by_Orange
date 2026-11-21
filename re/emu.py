#!/usr/bin/env python3
"""emu.py - run the unpacked X14 under Unicorn from the PKLITE-unpacked memory dump (re/x14.mem.gz) at 1010:03D9.
The program starts in real mode, switches itself to 32-bit protected mode with its own GDT/IDT ("raw" mode: no DPMI/VCPI/XMS needed,
only int 15h/88 for extended memory + A20) and then runs flat-ish code. Host side: DOS int 21h (DATA.DAT, X14.S3M), int 10h mode set,
int 16h keys, VGA ports (DAC, CRTC/seq/GC planar shadow for mode X, retrace 3DA), PIT/IRQ0 injection in real or protected mode.
usage: python3 emu.py [Minstr]  (smoke run, logs int/port traffic).  Needs unicorn from user site (no python -I).
env X14_MEM = path of the gunzipped 1 MB dump (default: gunzipped on the fly)."""
import os, struct, sys, collections, gzip
from unicorn import *
from unicorn.x86_const import *
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = HERE + '/..'
R = lambda n: getattr(sys.modules['unicorn.x86_const'], 'UC_X86_REG_' + n)
FILES = {'data.dat': open(ROOT + '/DATA.DAT', 'rb').read(), 'x14.s3m': open(ROOT + '/X14.S3M', 'rb').read()}
EXTMB = 24
mu = Uc(UC_ARCH_X86, UC_MODE_16)
mu.mem_map(0, (1 + EXTMB) * 0x100000 + 0x10000)
_m = os.environ.get('X14_MEM')
mu.mem_write(0, open(_m, 'rb').read() if _m else gzip.open(HERE + '/x14.mem.gz').read())
def ireg(n): return mu.reg_read(R(n))
def w(r, v): mu.reg_write(R(r), v & 0xffffffff)
def wax(v): w('EAX', (ireg('EAX') & 0xffff0000) | (v & 0xffff))
def setcf(v): f = ireg('EFLAGS'); mu.reg_write(UC_X86_REG_EFLAGS, (f | 1) if v else (f & ~1))
for n in range(256): mu.mem_write(n * 4, struct.pack('<HH', n * 4, 0xF000)); mu.mem_write(0xF0000 + n * 4, b'\xcf')
mu.mem_write(0x1000 * 16 + 0x2c, struct.pack('<H', 0x0ff0))   # env seg (unused)
START = (0x1010, 0x3d9)
w('CS', 0x1010); w('DS', 0x1010); w('ES', 0x1000); w('SS', 0x9000); w('ESP', 0xf000); w('EIP', 0x3d9)
def pmode(): return ireg('CR0') & 1
def gdtbase(sel):
    g = mu.reg_read(UC_X86_REG_GDTR); d = bytes(mu.mem_read(g[1] + (sel & ~7), 8))
    return d[2] | d[3] << 8 | d[4] << 16 | d[7] << 24
def lin(seg, off):
    return (seg << 4) + (off & 0xffff) if not pmode() else gdtbase(ireg(seg_names[seg]) if False else seg) + off
seg_names = {}
def dsx(off, seg='DS'):
    s = ireg(seg); return ((s << 4) + (off & 0xffff)) if not pmode() else gdtbase(s) + off
def cstr(a):
    b = b''
    while True:
        c = bytes(mu.mem_read(a, 1))
        if c == b'\0': return b.decode('latin1')
        b += c; a += 1
files = {}; nextfd = [5]; KEYQ = []; clk = [0]; cnt = collections.Counter(); exited = [0]; modes = []; curmode = [3]; evlog = []; curfx = ['pre']
def hostfile(name): return FILES.get(name.lower().replace('\\', '/').split('/')[-1])
BASE = 0x10fc0                      # kernel flat base (GDT sel 0x08/0x10); real-mode call block lives at BASE+0xd0 (dwords: si?,bx,dx,cx,ax,flags,ds/es words at +0xe6/+0xe8)
BLK = {'EBX': 0xd4, 'EDX': 0xd8, 'ECX': 0xdc, 'EAX': 0xe0}
class Regs:
    """register file for one emulated interrupt: the CPU (real-mode/PM software int) or the extender's real-mode call block (int 33h gate)"""
    def __init__(s, blk): s.blk = blk
    def g(s, n):
        if s.blk: return struct.unpack('<I', bytes(mu.mem_read(BASE + BLK[n], 4)))[0]
        return ireg(n)
    def p(s, n, v):
        if s.blk: mu.mem_write(BASE + BLK[n], struct.pack('<I', v & 0xffffffff))
        else: w(n, v)
    def wax(s, v): s.p('EAX', (s.g('EAX') & 0xffff0000) | (v & 0xffff))
    def cf(s, v):
        if s.blk: f = struct.unpack('<I', bytes(mu.mem_read(BASE + 0xe4, 4)))[0]; mu.mem_write(BASE + 0xe4, struct.pack('<I', (f | 1) if v else (f & ~1)))
        setcf(v)   # the gate returns the flags of the real-mode call in the caller's EFLAGS: `jb` after int 33h tests THIS CF
    def zf(s, v): f = ireg('EFLAGS'); mu.reg_write(UC_X86_REG_EFLAGS, (f | 0x40) if v else (f & ~0x40))
    def ptr(s, off):   # DS:off as linear
        if s.blk: return (struct.unpack('<H', bytes(mu.mem_read(BASE + 0xe8, 2)))[0] << 4) + (off & 0xffff)
        return dsx(off)
def dos21(r, al, ah):
    G = lambda n: r.g(n) & 0xffff
    if ah == 0x09: print('PRINT', cstr(r.ptr(G('EDX'))).split('$')[0]); return 1
    if ah == 0x30: r.wax(5); return 1
    if ah == 0x2c: t = clk[0] // 10000; r.p('ECX', ((t // 360000 % 24) << 8) | (t // 6000 % 60)); r.p('EDX', ((t // 100 % 60) << 8) | (t % 100)); return 1
    if ah == 0x3d:
        n = cstr(r.ptr(G('EDX'))); f = hostfile(n); evlog.append(('open', n, clk[0] / 1e6)); print('OPEN', n, f is not None, 't=%.2f' % (clk[0] / 1e6))
        if f is None: r.wax(2); r.cf(1); return 1
        fd = nextfd[0]; nextfd[0] += 1; files[fd] = [f, 0]; r.wax(fd); r.cf(0); return 1
    if ah == 0x3e: files.pop(G('EBX'), None); r.cf(0); return 1
    if ah == 0x3f:
        f = files.get(G('EBX')); n = G('ECX')
        if f is None: r.wax(6); r.cf(1); return 1
        b = f[0][f[1]:f[1] + n]; mu.mem_write(r.ptr(G('EDX')), b); evlog.append(('read', f[1], len(b), r.ptr(G('EDX')), curfx[0], round(clk[0] / 1e6, 3))); f[1] += len(b); r.wax(len(b)); r.cf(0); return 1
    if ah == 0x42:
        f = files.get(G('EBX'))
        if f is None: r.wax(6); r.cf(1); return 1
        o = struct.unpack('<i', struct.pack('<I', (G('ECX') << 16 | G('EDX'))))[0]
        f[1] = o if al == 0 else f[1] + o if al == 1 else len(f[0]) + o
        r.wax(f[1] & 0xffff); r.p('EDX', f[1] >> 16 & 0xffff); r.cf(0); return 1
    if ah == 0x40:
        n = G('ECX'); print('[write %d] ' % G('EBX') + bytes(mu.mem_read(r.ptr(G('EDX')), n)).decode('latin1').rstrip()); r.wax(n); r.cf(0); return 1
    if ah == 0x4c: print('EXIT', al); exited[0] = 1; mu.emu_stop(); return 1
    if ah in (0x0b,): r.wax(0xff00 if KEYQ else 0); return 1
    if ah in (0x01, 0x07, 0x08): r.wax(KEYQ.pop(0) if KEYQ else 0); return 1
    if ah == 0x44: r.p('EDX', 0x80); r.cf(0); return 1
    if ah in (0x0e, 0x19, 0x1a, 0x2a): return 1
    return 0
def realint(r, no, ax):
    ah = (ax >> 8) & 0xff; al = ax & 0xff
    cnt[(no, ah)] += 1
    if no == 0x21 and dos21(r, al, ah): return 1
    if no == 0x10:
        if ah == 0: curmode[0] = al; modes.append(al); setbiosmode(al); evlog.append(('mode', al, clk[0] / 1e6)); print('SETMODE', hex(al), 't=%.2f' % (clk[0] / 1e6)); return 1
        if ah == 0x0f: r.wax((40 << 8) | curmode[0]); return 1
        if ah in (1, 2, 5, 6, 7, 9, 0x0a, 0x0b, 0x0c, 0x10, 0x11, 0x12, 0x0e): return 1
    if no == 0x15 and ah == 0x88: r.wax(0x5000); r.cf(0); return 1                  # 20 MB of extended memory
    if no == 0x2f and ax == 0x1687: return 1                                         # no DPMI host (ax stays != 0)
    if no == 0x2f and ah == 0x43: return 1                                            # no XMS (al != 0x80)
    if no == 0x16:
        if ah in (0, 0x10): r.wax(KEYQ.pop(0) if KEYQ else 0); return 1
        if ah in (1, 0x11): r.zf(not KEYQ); return 1
    if no == 0x33: r.wax(0); return 1                                                 # mouse driver: not installed
    return 0
def intr(uc, no, _):
    eax = ireg('EAX')
    if pmode() and no == 0x33:   # the extender's "call real-mode interrupt AL with the register block at BASE+0xd0" gate
        blk = Regs(True); rn = eax & 0xff; ax = blk.g('EAX')
        if realint(blk, rn, ax): return
        print('UNHANDLED real-mode int via gate %02x ax=%04x' % (rn, ax)); uc.emu_stop(); return
    r = Regs(False)
    if no == 0x67: r.wax(0x8400); return
    if realint(r, no, eax & 0xffff): return
    print(f"UNHANDLED INT {no:02x} ax={eax&0xffff:04x} bx={ireg('EBX'):x} cx={ireg('ECX'):x} dx={ireg('EDX'):x} cs:eip={ireg('CS'):x}:{ireg('EIP'):x} pm={pmode()}")
    uc.emu_stop()
def mem_inv(uc, access, addr, size, val, _): print('MEMFAULT', access, hex(addr), size, 'eip', hex(ireg('EIP')), 'cs', hex(ireg('CS'))); return False
hzper = [0]; hzlast = [None]; hzlog = collections.Counter(); portlog = collections.Counter(); ports = {}; warp = [0.0]; vt = [0.0]; outlog = []
# ---- VGA: DAC, CRTC/seq/GC registers, planar shadow memory (mode X) fed by memory hooks on 0xa0000..0xaffff (from stv/re/emu.py) ----
pal = [[0, 0, 0] for _ in range(256)]; pstate = {'wi': 0, 'comp': 0, 'ri': 0, 'rcomp': 0}
planes = [bytearray(0x10000) for _ in range(4)]; latch = [0, 0, 0, 0]
sq = {i: 0 for i in range(8)}; gc = {i: 0 for i in range(16)}; crtc = {i: 0 for i in range(0x20)}; sqi = [0]; gci = [0]; crtci = [0]
sq[1] = 1; sq[2] = 0xf; sq[4] = 0xe
for i, v in enumerate([0x5f, 0x4f, 0x50, 0x82, 0x54, 0x80, 0xbf, 0x1f, 0, 0x41, 0, 0, 0, 0, 0, 0, 0x9c, 0x8e, 0x8f, 0x28, 0x40, 0x96, 0xb9, 0xa3, 0xff]): crtc[i] = v   # BIOS mode 13h
gc.update({5: 0x40, 6: 5, 7: 0xf, 8: 0xff})   # the program never calls int 10h: it assumes it was started in mode 13h
# ---- PIT channel 0 (virtual time): mode 0 one-shot (the demo re-arms it every frame, synced to retrace) or mode 2/3 periodic ----
PITHZ = 1193182.0
pitst = {'mode': 3, 'count': 65536, 'armed': None, 'acc': 0, 'hi': False, 'next': None, 'lat': None, 'rd': 0}
def vnow(): return vt[0] + warp[0]
def pit_ctl(v):
    if v >> 6 != 0: return
    if v & 0x30 == 0: pitst['lat'] = pit_cur(); pitst['rd'] = 0; return
    pitst['mode'] = (v >> 1) & 7; pitst['hi'] = False; pitst['acc'] = 0; pitst['armed'] = None; pitst['next'] = None
def pit_write(v):
    st = pitst
    if not st['hi']: st['acc'] = v; st['hi'] = True; return
    st['hi'] = False; c = st['acc'] | v << 8; st['count'] = c or 65536; t = vnow()
    st['armed'] = t; st['next'] = t + st['count'] / PITHZ
def pit_cur():
    st = pitst
    if st['armed'] is None: return 0
    return int(st['count'] - (vnow() - st['armed']) * PITHZ) & 0xffff if st['mode'] in (0, 1) else int(st['count'] - ((vnow() - st['armed']) * PITHZ) % st['count']) & 0xffff
def pit_read():
    st = pitst; v = st['lat'] if st['lat'] is not None else pit_cur(); b = (v >> (8 * st['rd'])) & 255
    st['rd'] ^= 1
    if st['rd'] == 0: st['lat'] = None
    return b
pit = []
def refresh_per():
    hzper[0] = 1 / refresh_hz(); return hzper[0]
def refresh_hz():
    """vertical refresh from the live CRTC/sequencer/misc-output state (CPU independent): lines = vtotal(reg 6 + overflow bits 0 and 5 of reg 7) + 2, line = (reg0 + 5) chars
    x (8 or 9 dots), dot clock 25.175 / 28.322 MHz (misc output bits 2-3, halved by seq 1 bit 3). Normalised so the 449-line mode 13h timing is exactly the old constant 70.086 Hz
    (25.175 MHz / (800 x 449) = 70.085); the 0.93 'retrace' phase window of the 3DA model is unchanged (a simplification: the real retrace is a few lines)."""
    r = crtc; lines = (r[6] | (r[7] & 1) << 8 | (r[7] >> 5 & 1) << 9) + 2
    clk = (25.175e6 if (ports.get(0x3c2, 0x63) >> 2) & 3 == 0 else 28.322e6) / (2 if sq[1] & 8 else 1)
    f = (25.175e6 / clk) * (449 * 800) / (lines * (r[0] + 5) * (8 if sq[1] & 1 else 9))
    hz = 70.086 * f; k = (curfx[0], lines, round(hz, 3), sq[1], ports.get(0x3c2, 0x63))
    if hzlast[0] != k: hzlast[0] = k; hzlog[k] += 1   # observation only: distinct (effect, lines, Hz, seq1, misc) states seen by the 3DA polls
    return 70.086 if f == 1.0 else hz
def _in(uc, port, size, _):
    portlog[('in', port)] += 1
    if port == 0x3da:   # retrace from virtual time (70 Hz); every poll warps the clock 60 us so spin loops stay cheap
        warp[0] += 60e-6; t = vt[0] + warp[0]; per = hzper[0] or refresh_per(); return 9 if (t % per) / per > 0.93 else 0
    if port == 0x3c9:
        v = pal[pstate['ri']][pstate['rcomp']]; pstate['rcomp'] += 1
        if pstate['rcomp'] == 3: pstate['rcomp'] = 0; pstate['ri'] = (pstate['ri'] + 1) & 255
        return v
    if port == 0x3d5: return crtc[crtci[0]]
    if port == 0x3cf: return gc[gci[0]]
    if port == 0x3c5: return sq[sqi[0]]
    if port == 0x64: return 0
    if port == 0x40: return pit_read()
    return ports.get(port, 0)
dacw = set(); regaudit = collections.defaultdict(collections.Counter); modeaudit = []   # observation only: DAC entries written since the last BIOS mode set; per-effect (register, value) writes of the video ports
def _out(uc, port, size, val, _):
    portlog[('out', port)] += 1
    if port == 0x3c9 and size == 1: dacw.add(pstate['wi'])
    if size == 1 and port in (0x3c0, 0x3c2, 0x3c6, 0x3c5, 0x3cf, 0x3d5):
        regaudit[curfx[0]][(port, {0x3c5: sqi[0], 0x3cf: gci[0], 0x3d5: crtci[0]}.get(port), val)] += 1
    if port in (0x3d5, 0x3c5, 0x3c2): hzper[0] = 0   # refresh model cache (CRTC / sequencer / misc output)
    if size == 2 and port in (0x3c4, 0x3ce, 0x3d4): _out(uc, port, 1, val & 255, _); _out(uc, port + 1, 1, val >> 8, _); return
    if port not in (0x3c9, 0x3c8, 0x3da) and len(outlog) < 4000: outlog.append((port, size, val, ireg('EIP')))
    if port == 0x3c9:
        ps = pstate; pal[ps['wi']][ps['comp']] = val & 63; c = ps['comp'] + 1
        if c == 3: c = 0; ps['wi'] = (ps['wi'] + 1) & 255
        ps['comp'] = c; return
    if port == 0x3c4: sqi[0] = val & 7
    elif port == 0x3c5: sq[sqi[0]] = val
    elif port == 0x3ce: gci[0] = val & 15
    elif port == 0x3cf: gc[gci[0]] = val
    elif port == 0x3d4: crtci[0] = val & 31
    elif port == 0x3d5: crtc[crtci[0]] = val
    elif port == 0x40: pit_write(val)
    elif port == 0x43: pit_ctl(val)
    elif port == 0x3c8: pstate['wi'] = val & 255; pstate['comp'] = 0
    elif port == 0x3c7: pstate['ri'] = val & 255; pstate['rcomp'] = 0
    ports[port] = val
def _wr(uc, access, addr, size, val, _):
    o = addr - 0xa0000
    for i in range(size): wmode(o + i, (val >> (8 * i)) & 255)
def wmode(o, b):
    if not sq[4] & 8 and gc[5] & 3 == 0 and gc[3] == 0 and gc[1] == 0 and gc[8] == 0xff:
        mm = sq[2]
        for p in range(4):
            if mm >> p & 1: planes[p][o] = b
        return
    if sq[4] & 8: planes[o & 3][o >> 2] = b; return    # chain4 (mode 13h)
    a = o; wm = gc[5] & 3; mm = sq[2]; rot = gc[3] & 7
    if wm == 1:
        for p in range(4):
            if mm >> p & 1: planes[p][a] = latch[p]
        return
    if wm == 0:
        b = ((b >> rot) | (b << (8 - rot))) & 255
        for p in range(4):
            if not mm >> p & 1: continue
            v = b
            if gc[1] >> p & 1: v = 255 if gc[0] >> p & 1 else 0
            f = (gc[3] >> 3) & 3; bm = gc[8]; l = latch[p]
            if f == 1: v &= l
            elif f == 2: v |= l
            elif f == 3: v ^= l
            planes[p][a] = (v & bm) | (l & ~bm & 255)
    elif wm == 2:
        bm = gc[8]
        for p in range(4):
            if not mm >> p & 1: continue
            v = 255 if b >> p & 1 else 0; l = latch[p]; f = (gc[3] >> 3) & 3
            if f == 1: v &= l
            elif f == 2: v |= l
            elif f == 3: v ^= l
            planes[p][a] = (v & bm) | (l & ~bm & 255)
    elif wm == 3:
        bm = b & gc[8]
        for p in range(4):
            if mm >> p & 1: planes[p][a] = ((255 if gc[0] >> p & 1 else 0) & bm) | (latch[p] & ~bm & 255)
def _rd(uc, access, addr, size, val, _):
    o = addr - 0xa0000
    if sq[4] & 8:
        for i in range(size): uc.mem_write(addr + i, bytes([planes[(o + i) & 3][(o + i) >> 2]]))
        return
    for p in range(4): latch[p] = planes[p][o]
    rm = gc[4] & 3
    for i in range(size): uc.mem_write(addr + i, bytes([planes[rm][o + i]]))
def default_dac():
    """the IBM VGA BIOS default 256-colour DAC loaded by every BIOS mode set (int 10h ax=00xx; AL bit 7 only keeps VRAM): 16 CGA colours, 16 greys, 9 x 24 hue ramps
    (max/min 63/0, 63/31, 63/45, 28/0, 28/14, 28/20, 16/0, 16/8, 16/11), 8 black. Same values as dosbox-x (vga_palette)."""
    P = [(0,0,0),(0,0,42),(0,42,0),(0,42,42),(42,0,0),(42,0,42),(42,21,0),(42,42,42),(21,21,21),(21,21,63),(21,63,21),(21,63,63),(63,21,21),(63,21,63),(63,63,21),(63,63,63)]
    P += [(g, g, g) for g in (0,5,8,11,14,17,20,24,28,32,36,40,45,50,56,63)]
    for mx, mn in ((63,0),(63,31),(63,45),(28,0),(28,14),(28,20),(16,0),(16,8),(16,11)):
        s = [mn + (mx - mn) * k / 4 for k in range(1, 4)]; s = [int(-(-(v - 0.5) // 1)) for v in s]   # ceil(x - 0.5): halves round down
        P += [(mn,mn,mx),(s[0],mn,mx),(s[1],mn,mx),(s[2],mn,mx),(mx,mn,mx),(mx,mn,s[2]),(mx,mn,s[1]),(mx,mn,s[0]),(mx,mn,mn),(mx,s[0],mn),(mx,s[1],mn),(mx,s[2],mn),
              (mx,mx,mn),(s[2],mx,mn),(s[1],mx,mn),(s[0],mx,mn),(mn,mx,mn),(mn,mx,s[0]),(mn,mx,s[1]),(mn,mx,s[2]),(mn,mx,mx),(mn,s[2],mx),(mn,s[1],mx),(mn,s[0],mx)]
    return P + [(0,0,0)] * 8
def setbiosmode(m):
    for i, c in enumerate(default_dac()): pal[i][:] = list(c)   # BIOS mode set reloads the default DAC palette (the demo's own uploads follow)
    pstate.update({'wi': 0, 'comp': 0, 'ri': 0, 'rcomp': 0})
    modeaudit.append((curfx[0], m, round(clk[0] / 1e6, 3), len(dacw))); dacw.clear()
    if m & 0x7f == 0x13:
        for i, v in enumerate([0x5f, 0x4f, 0x50, 0x82, 0x54, 0x80, 0xbf, 0x1f, 0, 0x41, 0, 0, 0, 0, 0, 0, 0x9c, 0x8e, 0x8f, 0x28, 0x40, 0x96, 0xb9, 0xa3, 0xff]): crtc[i] = v
        hzper[0] = 0; ports[0x3c2] = 0x63; sq.update({1: 1, 2: 0xf, 3: 0, 4: 0xe}); gc.update({0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0x40, 6: 5, 7: 0xf, 8: 0xff})
        for p in planes: p[:] = bytes(len(p))
    if m & 0x7f == 0x12:   # BIOS mode 12h (640x480x16; fx12 sets it through the extender's int 33h gate: word [0xe0]=0x12): standard registers, start address 0, VRAM cleared (bit 7 of AL would keep it)
        for i, v in enumerate([0x5f, 0x4f, 0x50, 0x82, 0x54, 0x80, 0x0b, 0x3e, 0, 0x40, 0, 0, 0, 0, 0, 0, 0xea, 0x8c, 0xdf, 0x28, 0, 0xe7, 0x04, 0xe3, 0xff]): crtc[i] = v
        hzper[0] = 0; ports[0x3c2] = 0xe3; sq.update({1: 1, 2: 0xf, 3: 0, 4: 6}); gc.update({0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 5, 7: 0xf, 8: 0xff})
        if not m & 0x80:
            for p in planes: p[:] = bytes(len(p))
def display_idx():
    """(indices (h,w) uint8, palette (256,3) 6-bit) of what the CRT shows now, from planar shadow + CRTC (start address, stride,
    max-scan-line doubling, LINE COMPARE split: scan lines after crtc 0x18/7.4/9.6 restart at address 0)"""
    import numpy as np
    r = crtc; wpx = (r[1] + 1) * 4
    ov = r[7]; vde = ((ov & 2) << 7 | (ov & 0x40) << 3 | r[0x12]) + 1; ch = (r[9] & 0x1f) + 1; h = vde // ch
    lc = r[0x18] | (ov & 0x10) << 4 | (r[9] & 0x40) << 3
    start = (r[0xc] << 8 | r[0xd]) & 0xffff; stride = max(r[0x13] * 2, 1)
    P = np.array([np.frombuffer(bytes(p), np.uint8) for p in planes])
    s = np.arange(h) * ch   # first scan line of each char row
    row = np.where(s <= lc, s // ch, (s - lc - 1) // ch); base = np.where(s <= lc, start, 0)
    xs = np.arange(wpx)[None, :]
    idx = (base[:, None] + row[:, None] * stride + (xs >> 2)) & 0xffff
    return P[xs & 3, idx], np.array(pal, dtype=np.uint8)
def display():
    import numpy as np
    out, p = display_idx(); return (p.astype(np.uint16)[out] * 255 // 63).astype(np.uint8)
def attach(uc):
    uc.hook_add(UC_HOOK_INTR, intr); uc.hook_add(UC_HOOK_MEM_UNMAPPED, mem_inv)
    uc.hook_add(UC_HOOK_MEM_WRITE, _wr, begin=0xa0000, end=0xaffff); uc.hook_add(UC_HOOK_MEM_READ, _rd, begin=0xa0000, end=0xaffff); uc.hook_add(UC_HOOK_INSN, _in, None, 1, 0, UC_X86_INS_IN); uc.hook_add(UC_HOOK_INSN, _out, None, 1, 0, UC_X86_INS_OUT)
def to_pm32():
    """run the real-mode stub until it far-jumps into the 32-bit kernel (8:0x259), then clone the state into a UC_MODE_32 Unicorn
    (a 16-bit Unicorn cannot restart at eip > 64K). After this `mu` is the 32-bit machine."""
    global mu
    attach(mu)
    hit = []
    mu.hook_add(UC_HOOK_CODE, lambda uc, a, s, _: (hit.append(1), uc.emu_stop()), begin=0x10fc0 + 0x259, end=0x10fc0 + 0x259)
    mu.emu_start(START[0] * 16 + START[1], 0, count=20000000)
    assert hit and pmode(), 'stub did not reach the PM entry'
    regs = {r: ireg(r) for r in ('EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'EBP', 'ESP', 'EFLAGS', 'CR0')}
    gd, idt = mu.reg_read(UC_X86_REG_GDTR), mu.reg_read(UC_X86_REG_IDTR); sel = {s: ireg(s) for s in ('CS', 'DS', 'ES', 'SS', 'FS', 'GS')}
    mem = bytes(mu.mem_read(0, (1 + EXTMB) * 0x100000))
    m2 = Uc(UC_ARCH_X86, UC_MODE_32); m2.mem_map(0, (1 + EXTMB) * 0x100000 + 0x10000); m2.mem_write(0, mem)
    m2.reg_write(UC_X86_REG_GDTR, gd); m2.reg_write(UC_X86_REG_IDTR, idt); m2.reg_write(UC_X86_REG_CR0, regs.pop('CR0'))
    for r, v in regs.items(): m2.reg_write(R(r), v)
    for r, v in sel.items(): m2.reg_write(R(r), v)
    m2.reg_write(UC_X86_REG_EIP, 0x259); attach(m2); mu = m2
    for a in OUTSB: m2.hook_add(UC_HOOK_CODE, _rep_outsb, begin=BASE + a, end=BASE + a)
# Unicorn cannot hook OUTS: emulate the 33 'rep outsb' (all palette uploads to 3C9) found by byte search (f3 6e) in the 32-bit code
OUTSB = [0x7344, 0xd9a4, 0xde2a, 0xe0e4, 0x25c90, 0x26067, 0x26324, 0x293ef, 0x29db4, 0x2a7c9, 0x2a887, 0x2a96d, 0x2aa22, 0x2aad6, 0x2ade4, 0x4965f, 0x497a6, 0x49856, 0x49b97, 0x4beff, 0x4c133, 0x4d7a8, 0x4e076, 0x513ee, 0x51587, 0x57db0, 0x580b2, 0x58374, 0x5a9f0, 0x5ab23, 0x5ae90, 0x5b290, 0x7aba9]
def _rep_outsb(uc, a, sz, _):
    dx = ireg('EDX') & 0xffff; esi = ireg('ESI'); n = ireg('ECX')
    for b in bytes(uc.mem_read(BASE + esi, n)): _out(uc, dx, 1, b, None)
    w('ESI', esi + n); w('ECX', 0); uc.reg_write(UC_X86_REG_EIP, (a - BASE) + 2)
def run(n=50000000):
    try: mu.emu_start(ireg('EIP'), 0, count=n)
    except UcError as e: print('ERR', e, hex(ireg('CS')), hex(ireg('EIP')))
if __name__ == '__main__':
    to_pm32()
    run(int(float(sys.argv[1] if len(sys.argv) > 1 else 5) * 1e6))
    print('cs:eip', hex(ireg('CS')), hex(ireg('EIP')), 'modes', modes)
    print(sorted(cnt.items(), key=lambda x: -x[1])[:20]); print(sorted(portlog.items(), key=lambda x: -x[1])[:20])
