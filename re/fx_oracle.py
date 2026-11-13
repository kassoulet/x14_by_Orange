#!/usr/bin/env python3
"""fx_oracle.py OUTDIR FXS [IPS=12e6] [CH=2000]: per-frame ORACLE of the original X14 under Unicorn (same driver as golden_run.py).
FXS = comma list of effect indices (0..12) to record. For those effects every palette upload (all 33 'rep outsb' sites; each is one
vsync-paced step of the effects' fade loops) is a frame: stores mt (music s since fx0 entry), vt, irq count, order, row, the 256x3 6-bit DAC,
and (first/last frame + every EVERYIDX-th frame) the displayed index plane (display_idx, line compare + start address honoured), the CRTC regs.
Stops when the last requested effect is left. Output OUTDIR/fx<N>.npy (list of dicts, pickled). CH = instructions per Python chunk
(IRQ0 injection granularity; golden_run.py uses 20000)."""
import sys, os, struct, json, bisect, time
import numpy as np
import emu
from emu import *
out = sys.argv[1]; FXS = [int(x) for x in sys.argv[2].split(',')]
IPS = float(sys.argv[3]) if len(sys.argv) > 3 else 12e6; CH = int(sys.argv[4]) if len(sys.argv) > 4 else 2000
EVERYIDX = int(os.environ.get('EVERYIDX', '1000000'))
os.makedirs(out, exist_ok=True)
J = json.load(open(HERE + '/s3mtime.model.json')); rows = J['rows']; TS = [r[3] for r in rows]
B = emu.BASE
FX = {0x25a14: 'intro', 0xd8ef: 0, 0x25c55: 1, 0x2939d: 2, 0x2a607: 3, 0x495bc: 4, 0x4be79: 5, 0x2a8bf: 6, 0x4d5c5: 7, 0x512fd: 8, 0x57cf9: 9, 0x5a9a4: 10, 0x69fb2: 11, 0x7aae4: 12}
cur = emu.curfx; t0 = [None]; frames = {f: [] for f in FXS}; irqs = [0]; entry = {}
L = open(out + '/log.txt', 'w')
def P(*a):
    s = ' '.join(map(str, a)); print(s, flush=True); L.write(s + '\n'); L.flush()
_orig = emu._rep_outsb
def snap(a):
    f = cur[0]
    if f not in frames or f in HK: return
    d4 = lambda x: int.from_bytes(emu.mu.mem_read(B + x, 4), 'little')
    fr = dict(site=a, vt=emu.vnow(), mt=emu.vnow() - t0[0], irqs=irqs[0], order=emu.mu.mem_read(B + 0x3575, 1)[0], row=emu.mu.mem_read(B + 0x3572, 1)[0],
              pal=np.array(emu.pal, dtype=np.uint8), crtc={k: v for k, v in emu.crtc.items() if v}, sq=dict(emu.sq), gc=dict(emu.gc))
    n = len(frames[f])
    if n == 0 or n % EVERYIDX == 0: fr['idx'] = emu.display_idx()[0].copy()
    frames[f].append(fr)
def outsb(uc, a, sz, _):
    _orig(uc, a, sz, _); snap(a - B)
emu._rep_outsb = outsb
emu.to_pm32()
# per-pass capture for effects driven by a main loop + ISR counters (fx7, fx9): one frame per pass = state read when the page has been drawn and the crtc start set
# (frame addr); the counters the pass is computed from are read at the loop top (the ISR may advance them later). dump = static tables read once at the first pass.
HK = {7: dict(top=0x4d7aa, frame=0x4dbbf, gen=0x4d920, ctr=(0x4c285, 0x4c289, 0x4c28d, 0x4c291, 0x4c66e, 0x4c672, 0x4c676, 0x4c67a, 0x4c610, 0x4c614, 0x4c618, 0x4c61c, 0x4c620, 0x4c624, 0x4c628, 0x4c62c, 0x4d228, 0x4c648, 0x4c650), extra=(0x4d234,), dump=(), par=(0x4c65e, 0x4c662, 0x4c666, 0x4c66a, 0x4c5f0, 0x4c5f4, 0x4c5f8, 0x4c5fc, 0x4c600, 0x4c604, 0x4c608, 0x4c60c)),
      9: dict(top=0x57db2, frame=0x57e3c, gen=0x57c87, par=(0x57b99, 0x5215f, 0x519ef), parr=((0x51a37, 1024),), up=0x580b4, ctr=(0x519ff, 0x51a03, 0x51a1f, 0x51a23, 0x51a0f, 0x51a13, 0x51a2f, 0x51a33, 0x51e43, 0x51e47, 0x51e4b, 0x519ef, 0x519ee, 0x57b91, 0x57b95, 0x57b99, 0x5215f, 0x5214f, 0x52157), extra=(0x57b99, 0x519ef, 0x5215f),
              dump=((0x51a37, 1024), (0x52181, 2048), (0x51e4f, 768), (0x519ea, 4), (0x57bb2, 4)))}
gen = [0]; top = {}; parv = {}; upv = {}; dumped = {}
def mk_hooks(fx, h):
    d4 = lambda x: int.from_bytes(emu.mu.mem_read(B + x, 4), 'little')
    def hook_gen(uc, a, sz, _): gen[0] = ireg('ECX'); parv[fx] = [d4(x) for x in h.get('par', ())] + [bytes(emu.mu.mem_read(B + x, n)) for x, n in h.get('parr', ())]
    def hook_top(uc, a, sz, _):
        top[fx] = [d4(x) for x in h['ctr']] + [emu.vnow(), irqs[0], emu.mu.mem_read(B + 0x3575, 1)[0], int.from_bytes(emu.mu.mem_read(B + 0x3573, 2), 'little')]
        if h['dump'] and fx not in dumped:
            dumped[fx] = {a: bytes(emu.mu.mem_read(B + a, n)) for a, n in h['dump']}
            for a, n in h['dump']:
                if n == 4: p = d4(a); dumped[fx][(a, 'ptr')] = p; dumped[fx][(p, 'buf')] = bytes(emu.mu.mem_read(B + p, 0x10000 if fx == 9 and a == 0x519ea else 0x7d00))
    def hook_frame(uc, a, sz, _):
        if cur[0] != fx or fx not in frames: return
        fr = dict(site='f%d' % fx, vt=emu.vnow(), mt=emu.vnow() - t0[0], irqs=irqs[0], order=emu.mu.mem_read(B + 0x3575, 1)[0], row=emu.mu.mem_read(B + 0x3572, 1)[0], gen=gen[0], par=parv.get(fx), upprev=upv.get(fx), tick=top[fx], off=d4(h['extra'][0]), extra=[d4(x) for x in h['extra']],
                  pal=np.array(emu.pal, dtype=np.uint8), crtc={k: v for k, v in emu.crtc.items() if v}, idx=emu.display_idx()[0].copy())
        if fx in dumped: fr['dump'] = dumped.pop(fx)
        frames[fx].append(fr)
    def hook_up(uc, a, sz, _): upv[fx] = (np.array(emu.pal, dtype=np.uint8), d4(0x519ef))   # palette as uploaded at the end of the pass (+ the fade value it was computed with)
    if h.get('up'): emu.mu.hook_add(UC_HOOK_CODE, hook_up, begin=B + h['up'], end=B + h['up'])
    emu.mu.hook_add(UC_HOOK_CODE, hook_top, begin=B + h['top'], end=B + h['top'])
    emu.mu.hook_add(UC_HOOK_CODE, hook_frame, begin=B + h['frame'], end=B + h['frame'])
    if h['gen']: emu.mu.hook_add(UC_HOOK_CODE, hook_gen, begin=B + h['gen'], end=B + h['gen'])
for fx, h in HK.items():
    if fx in FXS: mk_hooks(fx, h)
def save(f):
    if frames[f]:
        frames[f][-1]['idx'] = emu.display_idx()[0].copy()
        np.save('%s/fx%d.npy' % (out, f), np.array(frames[f], dtype=object), allow_pickle=True); P('saved fx', f, len(frames[f]), 'frames')
def fx_enter(uc, a, sz, _):
    prev = cur[0]; cur[0] = FX[a - B]
    if cur[0] == 0 and t0[0] is None: t0[0] = emu.vnow(); mu.mem_write(B + 0x5fe7, struct.pack('<I', 0))
    entry[cur[0]] = emu.vnow() - (t0[0] if t0[0] is not None else 0)
    P('effect', cur[0], 'vt=%.4f' % emu.vnow(), 'music_t=%.4f' % (emu.vnow() - t0[0] if t0[0] is not None else -1), 'irqs', irqs[0])
    if prev in frames: save(prev)
    if prev in FXS and prev == max(FXS): emu.exited[0] = 1; uc.emu_stop()
for a in FX: emu.mu.hook_add(UC_HOOK_CODE, fx_enter, begin=B + a, end=B + a)
def inject(vec):
    g = bytes(emu.mu.mem_read(emu.mu.reg_read(UC_X86_REG_IDTR)[1] + vec * 8, 8)); off = struct.unpack('<H', g[:2])[0] | struct.unpack('<H', g[6:])[0] << 16
    if off in (0x952, 0x939): return False
    esp = ireg('ESP'); fl = ireg('EFLAGS')
    for v in (fl, 8, ireg('EIP')): esp -= 4; emu.mu.mem_write(B + esp, struct.pack('<I', v))
    w('ESP', esp); emu.mu.reg_write(UC_X86_REG_EIP, off); w('EFLAGS', fl & ~0x200); return True
ninstr = 0
def setpos():
    mt = emu.vnow() - t0[0]; k = max(0, bisect.bisect_right(TS, mt) - 1); o, p, r, _ = rows[k]
    emu.mu.mem_write(B + 0x3572, bytes([r])); emu.mu.mem_write(B + 0x3573, struct.pack('<H', r)); emu.mu.mem_write(B + 0x3575, bytes([o, o])); emu.mu.mem_write(B + 0x3578, bytes([p]))
# the 3DA polls warp the clock by 60 us each (up to 30 ms inside one chunk): refresh the S3M variables from the exact clock at every READ of them, not only per chunk
emu.mu.hook_add(UC_HOOK_MEM_READ, lambda uc, a, s, sz, v, _: setpos() if t0[0] is not None else None, begin=B + 0x3572, end=B + 0x3578)
while not emu.exited[0]:
    vt[0] = ninstr / IPS; T = emu.vnow(); clk[0] = int(T * 1e6)
    if t0[0] is not None: setpos()
    st = emu.pitst
    if st['next'] is not None and T >= st['next'] and ireg('EFLAGS') & 0x200 and st['mode'] in (0, 2, 3, 1):
        if inject(8): irqs[0] += 1; st['next'] = None if st['mode'] in (0, 1) else T + st['count'] / emu.PITHZ
    try: emu.mu.emu_start(ireg('EIP'), 0, count=CH)
    except UcError as e: P('ERR', e, hex(ireg('EIP'))); break
    ninstr += CH
for f in FXS: 
    if frames[f] and not os.path.exists('%s/fx%d.npy' % (out, f)): save(f)
json.dump(entry, open(out + '/entry.json', 'w'))
