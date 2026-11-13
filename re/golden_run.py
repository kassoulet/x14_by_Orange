#!/usr/bin/env python3
"""golden_run.py OUTDIR [IPS=12e6] [EVERY=2] [TMAX=260]: run the whole ORIGINAL demo once under Unicorn, no sound card, virtual clock.
No-sound path: the effects' IRQ0 handlers would count rows/orders themselves (70 rows/s, wrong tempo), so [0x5fe7] ('no sound' flag) is set to 0
once the effect sequence starts (their handlers then skip the counting) and the S3M position variables are driven from s3mtime.json instead:
  [0x3572] row byte, [0x3573] row word, [0x3575]/[0x3576] order, [0x3578] pattern   (the GUS player's variables; effects key on the ORDER).
IRQ0 is injected from the PIT model in emu.py (mode 0 one-shot re-armed every frame by the demo, retrace-synced) through the program's own IDT[8].
Writes OUTDIR/mNNN.png (every EVERY music-seconds, the frame the CRT shows at the first IRQ0 after the boundary), OUTDIR/log.txt (effect starts, mode sets, file reads)."""
import sys, os, struct, json, bisect, time
import emu
from emu import *
out = sys.argv[1]; IPS = float(sys.argv[2]) if len(sys.argv) > 2 else 12e6
EVERY = float(sys.argv[3]) if len(sys.argv) > 3 else 2; TMAX = float(sys.argv[4]) if len(sys.argv) > 4 else 260
os.makedirs(out, exist_ok=True)
rows = json.load(open(HERE + '/s3mtime.json'))['rows']; TS = [r[3] for r in rows]; ORD = json.load(open(HERE + '/s3mtime.json'))['orders']
from PIL import Image
emu.to_pm32()
B = emu.BASE
FX = {0x25a14: 'intro', 0xd8ef: 0, 0x25c55: 1, 0x2939d: 2, 0x2a607: 3, 0x495bc: 4, 0x4be79: 5, 0x2a8bf: 6, 0x4d5c5: 7, 0x512fd: 8, 0x57cf9: 9, 0x5a9a4: 10, 0x69fb2: 11, 0x7aae4: 12}
cur = emu.curfx; t0 = [None]; L = open(out + '/log.txt', 'w'); wall0 = time.process_time()
def P(*a):
    s = ' '.join(map(str, a)); print(s, flush=True); L.write(s + '\n'); L.flush()
def fx_enter(uc, a, sz, _):
    cur[0] = FX[a - B]
    if cur[0] == 0 and t0[0] is None:   # first effect call (b5e): music starts here in the original (call *0x3548 is the player init)
        t0[0] = emu.vnow(); mu.mem_write(B + 0x5fe7, struct.pack('<I', 0))
    P('effect', cur[0], 'vt=%.2f' % emu.vnow(), 'music_t=%.2f' % (emu.vnow() - t0[0] if t0[0] is not None else -1), 'cpu_s=%.0f' % (time.process_time() - wall0))
for a in FX: emu.mu.hook_add(UC_HOOK_CODE, fx_enter, begin=B + a, end=B + a)
CH = 20000; ninstr = 0; irqs = 0; nshot = 0; shot_pending = False; last_ev = 0
def inject(vec):
    g = bytes(emu.mu.mem_read(emu.mu.reg_read(UC_X86_REG_IDTR)[1] + vec * 8, 8)); off = struct.unpack('<H', g[:2])[0] | struct.unpack('<H', g[6:])[0] << 16
    if off in (0x952, 0x939): return False
    esp = ireg('ESP'); fl = ireg('EFLAGS')
    for v in (fl, 8, ireg('EIP')): esp -= 4; emu.mu.mem_write(B + esp, struct.pack('<I', v))
    w('ESP', esp); emu.mu.reg_write(UC_X86_REG_EIP, off); w('EFLAGS', fl & ~0x200); return True
while not emu.exited[0]:
    vt[0] = ninstr / IPS; T = emu.vnow(); clk[0] = int(T * 1e6)
    mt = None
    if t0[0] is not None:
        mt = T - t0[0]; k = max(0, bisect.bisect_right(TS, mt) - 1); o, p, r, _ = rows[k]
        emu.mu.mem_write(B + 0x3572, bytes([r])); emu.mu.mem_write(B + 0x3573, struct.pack('<H', r)); emu.mu.mem_write(B + 0x3575, bytes([o, o]))
        emu.mu.mem_write(B + 0x3578, bytes([p]))
        if mt >= (nshot) * EVERY: shot_pending = True
        if mt > TMAX: break
    st = emu.pitst
    if st['next'] is not None and T >= st['next'] and ireg('EFLAGS') & 0x200 and st['mode'] in (0, 2, 3, 1):
        if inject(8):
            irqs += 1; st['next'] = None if st['mode'] in (0, 1) else T + st['count'] / emu.PITHZ
            if shot_pending:
                im = emu.display()
                if im.shape[0] >= 16:
                    Image.fromarray(im).save('%s/m%04d.png' % (out, int(nshot * EVERY * 10))); P(' shot m%.1f fx%s order %d row %d' % (nshot * EVERY, cur[0], o, r)); nshot += 1; shot_pending = False
    try: emu.mu.emu_start(ireg('EIP'), 0, count=CH)
    except UcError as e: P('ERR', e, hex(ireg('EIP'))); break
    ninstr += CH
P('end irqs', irqs); json.dump(emu.evlog, open(out + '/events.json', 'w'))
if os.environ.get('DBG'):
    import numpy as np
    print('crtc', {hex(k): hex(v) for k, v in emu.crtc.items() if v}, 'sq', emu.sq, 'gc', {k: v for k, v in emu.gc.items() if v})
    for i in range(4): b = np.frombuffer(bytes(emu.planes[i]), np.uint8); print('plane', i, 'nonzero', np.count_nonzero(b))
    print('pal max', max(max(p) for p in emu.pal), 'nonzero', sum(1 for p in emu.pal if max(p)), 'eip', hex(ireg('EIP')), cur)
    print([(hex(p), sz, hex(v), hex(e)) for p, sz, v, e in emu.outlog[-30:]])
if os.environ.get('DBG'):
    ix, pl = emu.display_idx(); print('idx nonzero', np.count_nonzero(ix), 'uniq', np.unique(ix)[:20], 'pal', [tuple(pl[i]) for i in np.unique(ix)[:8]])
    for i in range(4):
        b = np.frombuffer(bytes(emu.planes[i]), np.uint8); nz = np.nonzero(b)[0]; print('plane', i, 'range', nz.min() if len(nz) else None, nz.max() if len(nz) else None, np.unique(b)[:10])
