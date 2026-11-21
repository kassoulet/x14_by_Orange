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
HK = {0: dict(mid=0xdcdf, midctr=(0x753b, 0x753f), top=0xda4b, frame=0xdd8c, gen=0, extra=(0xd1a3,), ctr=(0x7573, 0x7577, 0x757b, 0x757f, 0x754b, 0x7553, 0x754f, 0x7557, 0x753b, 0x753f, 0x752f, 0x7533, 0x7537, 0xd1a3, 0xd1a7, 0x7529, 0x756b),
          dump=((0xd3ed, 0x400), (0xd4ed, 0x400), (0x7583, 0x4000), (0xc593, 0xc00))),
      1: dict(top=0x25e41, mid=0x25b3c, midctr=(0xfa04, 0xfa08, 0xfa14, 0xfa18, 0xf9e0), frame=0x25fd2, gen=0, extra=(0x24d24,), ctr=(0xfa04, 0xfa08, 0xfa0c, 0xfa10, 0xfa14, 0xfa18, 0xfa1c, 0xfa20, 0xf9fc, 0xf9e0, 0xf9e4, 0xf9e8, 0xf9ec, 0xf9f0, 0xf9f4, 0xf9f8, 0xf9c8, 0xf9cc, 0xf9d0, 0x24d24, 0x24d28, 0xe2bc),
          dump=((0xfc24, 0x4400), (0x24d14, 4), (0x24d18, 4), (0xf9c0, 4), (0xd5ed, 4), (0xd193, 4), (0xe2c0, 0x1500), (0xf6c0, 0x300), (0x24a14, 0x300), (0x24d49, 0x300), (0xd19f, 4)), dsz={0x24d14: 0x9600, 0x24d18: 0x10000, 0xf9c0: 0x3c00, 0xd5ed: 0x10000, 0xd193: 0x30000, 0xd19f: 0xe100}),
      2: dict(top=0x2956c, frame=0x29620, gen=0, extra=(0x26510,), ctr=tuple(range(0x26d1c, 0x26da8, 4)) + tuple(range(0x26500, 0x2651c, 4)) + (0x264fc,) + tuple(range(0x28f62, 0x28f92, 4)),
          dump=((0x275b2, 0xa04), (0x271b2, 0x400), (0x26db2, 0x400), (0x27fbe, 0x300), (0x27fba, 4), (0xd5ed, 4), (0xd19f, 4))),
      7: dict(top=0x4d7aa, frame=0x4dbbf, gen=0x4d920, ctr=(0x4c285, 0x4c289, 0x4c28d, 0x4c291, 0x4c66e, 0x4c672, 0x4c676, 0x4c67a, 0x4c610, 0x4c614, 0x4c618, 0x4c61c, 0x4c620, 0x4c624, 0x4c628, 0x4c62c, 0x4d228, 0x4c648, 0x4c650), extra=(0x4d234,), dump=(), par=(0x4c65e, 0x4c662, 0x4c666, 0x4c66a, 0x4c5f0, 0x4c5f4, 0x4c5f8, 0x4c5fc, 0x4c600, 0x4c604, 0x4c608, 0x4c60c)),
      4: dict(top=0x49a73, frame=(0x49b31, 0x497f0), gen=0, ctr=(0x2afc4, 0x2afc8, 0x2afcc, 0x2afd0, 0x2ffd0, 0x2ffd4, 0x2ffd8, 0x2ffdc, 0x2ffe0, 0x2ffe4, 0x2ffe8, 0x2ffec, 0x2fff0, 0x2fff4, 0x2fff8, 0x2fffc, 0x30000, 0x30004, 0x30008, 0x3000c, 0x30010, 0x30014, 0x30018, 0x3001c, 0x30020, 0x30024, 0x30028, 0x3002c, 0x30030, 0x30034, 0x30038, 0x3003c, 0x302f0, 0x302f4, 0x302f8, 0x302fc, 0x30300, 0x30304, 0x30308, 0x3030c, 0x30310, 0x30314, 0x30318, 0x3031c, 0x30320, 0x30324, 0x30328, 0x3032c, 0x30330, 0x30334, 0x30338, 0x3033c, 0x30340, 0x30344, 0x49ba8, 0x49bac, 0x49bb0, 0x49bb4, 0x49bb8, 0x49bbc, 0x49ebc, 0x49ec0, 0x49ec4, 0x49ec8, 0x49ecc, 0x48f10, 0x48f14, 0x48f18, 0x478d4, 0x478d8, 0x478dc), extra=(0x2afc5,),
         dump=((0x30349, 0x4010), (0x478e3, 0x1040), (0x35351, 0x10000), (0x48915, 0x600), (0x49ebc, 4), (0x3031d, 4), (0x491af, 0x40c))),
      5: dict(top=0x4bf28, frame=0x4bfe4, gen=0, up=0x4c0fd, upv=0x4a00c, extra=(0x4a00c,), ctr=(0x4a414, 0x4a418, 0x4a41c, 0x4a420, 0x4a430, 0x4a43c, 0x4a440, 0x4a444, 0x4a448, 0x4a00c),
         dump=((0x4a45d, 0xa04), (0x4b66d, 4), (0x4a459, 4), (0x4b671, 96))),
      10: dict(top=0x5ab82, frame=0x5abee, gen=0, extra=(0x5855e,), ctr=(0x5857a, 0x5857e, 0x58582, 0x5858a, 0x5858e, 0x58592, 0x58596, 0x5855e),
          dump=((0x585be, 0xa04), (0x58fc6, 0x600), (0x58562, 4), (0x58572, 4))),
      11: dict(top=0x6a0d7, frame=0x6a1bd, gen=0, extra=(0x5b34d,),
          ctr=(0x5b32b, 0x5b32f, 0x5b333, 0x5b33b, 0x5b34d, 0x5b35e, 0x5b362, 0x5b376, 0x5b37a, 0x5b37e, 0x696fa, 0x696fe, 0x69702, 0x6a363, 0x7a3a0, 0x7a39c, 0x7a3a4, 0x5b343, 0x5b344),
          dump=((0x684a2, 0xa04), (0x5b39e, 0xce00), (0x6a367, 0x2400), (0x79d8b, 0x1000), (0x5b337, 4), (0x6849e, 4))),
      8: dict(top=0x5144d, frame=0x514a9, gen=0, ctr=(0x4e24c, 0x4e250, 0x4e254, 0x4e36a, 0x4e686, 0x4e68a, 0x4e68e, 0x4e692, 0x4e672, 0x4e676, 0x4e67a, 0x4e67e, 0x4e682, 0x4e696, 0x4e69a, 0x4e69e, 0x4e6a2, 0x4e6aa, 0x4e6ae, 0x4e6a6, 0x4e6b2, 0x50ce4, 0x50ce8, 0x506d4, 0x506d8, 0x506dc, 0x506e0), extra=(0x4e24c,),
         dump=((0x4e25a, 256), (0x4eac8, 2048), (0x506e4, 0x600), (0x506d8, 4), (0x506dc, 4), (0x506e0, 4))),
      9: dict(top=0x57db2, frame=0x57e3c, gen=0x57c87, par=(0x57b99, 0x5215f, 0x519ef), parr=((0x51a37, 1024),), up=0x580b4, ctr=(0x519ff, 0x51a03, 0x51a1f, 0x51a23, 0x51a0f, 0x51a13, 0x51a2f, 0x51a33, 0x51e43, 0x51e47, 0x51e4b, 0x519ef, 0x519ee, 0x57b91, 0x57b95, 0x57b99, 0x5215f, 0x5214f, 0x52157), extra=(0x57b99, 0x519ef, 0x5215f),
              dump=((0x51a37, 1024), (0x52181, 2048), (0x51e4f, 768), (0x519ea, 4), (0x57bb2, 4)))}
midv = {}; v0 = [None]; gen = [0]; top = {}; parv = {}; upv = {}; dumped = {}
def mk_hooks(fx, h):
    d4 = lambda x: int.from_bytes(emu.mu.mem_read(B + x, 4), 'little')
    def hook_gen(uc, a, sz, _): gen[0] = ireg('ECX'); parv[fx] = [d4(x) for x in h.get('par', ())] + [bytes(emu.mu.mem_read(B + x, n)) for x, n in h.get('parr', ())]
    def hook_top(uc, a, sz, _):
        top[fx] = [d4(x) for x in h['ctr']] + [emu.vnow(), irqs[0], emu.mu.mem_read(B + 0x3575, 1)[0], int.from_bytes(emu.mu.mem_read(B + 0x3573, 2), 'little')]
        if fx in (5, 10) and fx not in dumped: v0[0] = emu.display_idx()[0].copy()
        if h['dump'] and fx not in dumped:
            dumped[fx] = {a: bytes(emu.mu.mem_read(B + a, n)) for a, n in h['dump']}
            for a, n in h['dump']:
                if n == 4: p = d4(a); dumped[fx][(a, 'ptr')] = p; dumped[fx][(p, 'buf')] = bytes(emu.mu.mem_read(B + p, h['dsz'][a] if a in h.get('dsz', {}) else 0x10000 if fx in (5, 10, 11) or (fx == 2 and a != 0xd19f) or (fx == 9 and a == 0x519ea) or (fx == 8 and a == 0x506d8) or (fx == 4 and a == 0x49ebc) else 0x3300 if fx == 8 else 0x10000 if fx == 4 and a == 0x3031d else 0x3300 if fx == 8 else 0x7d00))
    def hook_mid(uc, a, sz, _):
        if cur[0] == fx: midv[fx] = [d4(x) for x in h['midctr']] + [emu.vnow(), irqs[0]]
    def hook_frame(uc, a, sz, _):
        if cur[0] != fx or fx not in frames or fx not in top: return
        fr = dict(site='f%d' % fx, vt=emu.vnow(), mt=emu.vnow() - t0[0], irqs=irqs[0], order=emu.mu.mem_read(B + 0x3575, 1)[0], row=emu.mu.mem_read(B + 0x3572, 1)[0], gen=gen[0], par=parv.get(fx), upprev=upv.get(fx), tick=top[fx], off=d4(h['extra'][0]), extra=[d4(x) for x in h['extra']],
                  pal=np.array(emu.pal, dtype=np.uint8), crtc={k: v for k, v in emu.crtc.items() if v}, idx=emu.display_idx()[0].copy())
        if fx in dumped: fr['dump'] = dumped.pop(fx); fr['dump']['vram0'] = v0[0]
        if fx in midv: fr['mid'] = midv[fx]
        frames[fx].append(fr)
    def hook_up(uc, a, sz, _): upv[fx] = (np.array(emu.pal, dtype=np.uint8), d4(h.get('upv', 0x519ef)))   # palette as uploaded at the end of the pass (+ the fade value it was computed with)
    if h.get('mid'): emu.mu.hook_add(UC_HOOK_CODE, hook_mid, begin=B + h['mid'], end=B + h['mid'])
    if h.get('up'): emu.mu.hook_add(UC_HOOK_CODE, hook_up, begin=B + h['up'], end=B + h['up'])
    emu.mu.hook_add(UC_HOOK_CODE, hook_top, begin=B + h['top'], end=B + h['top'])
    for fa in (h['frame'] if isinstance(h['frame'], tuple) else (h['frame'],)): emu.mu.hook_add(UC_HOOK_CODE, hook_frame, begin=B + fa, end=B + fa)
    if h['gen']: emu.mu.hook_add(UC_HOOK_CODE, hook_gen, begin=B + h['gen'], end=B + h['gen'])
for fx, h in HK.items():
    if fx in FXS: mk_hooks(fx, h)
if os.environ.get('DBG1') and 1 in FXS:   # debug: per pass (first N) the warp output buffer before the blit (0x25839) and the VRAM planes after the pass -> OUTDIR/dbg1_<k>.npz; stops after N passes
    dbgk = [0]; N1 = int(os.environ['DBG1']); pend = {}
    def hook_blit(uc, a, sz, _):
        if cur[0] == 1: pend['buf'] = bytes(emu.mu.mem_read(B + 0xd19f, 4)); p = int.from_bytes(pend['buf'], 'little'); pend['buf'] = bytes(emu.mu.mem_read(B + p, 57600)); pend['pg'] = int.from_bytes(emu.mu.mem_read(B + 0x24d24, 4), 'little')
    def hook_blitend(uc, a, sz, _):
        if cur[0] == 1 and 'buf' in pend:
            np.savez('%s/dbg1_%d.npz' % (out, dbgk[0]), buf=np.frombuffer(pend['buf'], np.uint8), pg=pend['pg'], planes=np.array([np.frombuffer(bytes(p), np.uint8) for p in emu.planes]), crtc=np.array([emu.crtc.get(i, 0) for i in range(25)]),
                     ov=np.frombuffer(bytes(emu.mu.mem_read(B + 0xf9c0, 4)), np.uint8), vt=emu.vnow())
            dbgk[0] += 1; pend.clear()
            if dbgk[0] >= N1: emu.exited[0] = 1; uc.emu_stop()
    emu.mu.hook_add(UC_HOOK_CODE, hook_blit, begin=B + 0x25839, end=B + 0x25839)
    emu.mu.hook_add(UC_HOOK_CODE, hook_blitend, begin=B + 0x25f64, end=B + 0x25f64)
if os.environ.get('DBG1T') and 1 in FXS:   # debug: instruction trace of the first iterations of the 4 blit loops of the first pass
    tr = {'n': 0, 'on': 0, 'k': 0}; TF = open(out + '/trace1.txt', 'w')
    def hook_tr(uc, a, sz, _):
        if cur[0] != 1: return
        fa = a - B
        if fa in (0x258b2, 0x2592f) and not tr['on'] and tr['k'] < 6: tr['on'] = 1; tr['n'] = 0; tr['k'] += 1; TF.write('--- start %x\n' % fa)
        if tr['on']:
            TF.write('%x eax=%08x ebx=%08x edx=%08x esi=%x edi=%x ebp=%x ecx=%x\n' % (fa, ireg('EAX'), ireg('EBX'), ireg('EDX'), ireg('ESI') , ireg('EDI'), ireg('EBP'), ireg('ECX'))); tr['n'] += 1
            if tr['n'] > 150: tr['on'] = 0; TF.flush()
        if fa == 0x25f64 and tr['k'] >= 4: TF.flush(); emu.exited[0] = 1; uc.emu_stop()
    emu.mu.hook_add(UC_HOOK_CODE, hook_tr, begin=B + 0x258b2, end=B + 0x25a12)
    emu.mu.hook_add(UC_HOOK_CODE, hook_tr, begin=B + 0x25f64, end=B + 0x25f64)
if os.environ.get('DBG1W') and 1 in FXS:   # debug: log every write to VRAM offsets of interest during the first pass(es)
    WF = open(out + '/writes1.txt', 'w'); _wm = emu.wmode; wc = [0]; WATCH = set(range(0x67c0, 0x67c8)) | set(range(0x640, 0x648)) | set(range(0x640 + 0x7d00, 0x648 + 0x7d00)) | set(range(0x67c0 + 0x7d00, 0x67c8 + 0x7d00))
    def wmode_dbg(o, b):
        if cur[0] == 1 and o in WATCH: WF.write('w o=%x b=%02x mask=%x eip=%x vt=%.4f sq4=%x gc5=%x gc8=%x\n' % (o, b, emu.sq[2], ireg('EIP') - B, emu.vnow(), emu.sq[4], emu.gc[5], emu.gc[8])); wc[0] += 1; WF.flush()
        if wc[0] > 200: emu.exited[0] = 1; emu.mu.emu_stop()
        _wm(o, b)
    emu.wmode = wmode_dbg
if os.environ.get('DBG1C') and 1 in FXS:   # debug: number of VRAM writes (wmode calls) per blit segment, first passes
    _wm2 = emu.wmode; cc = [0]; seg = []; first = {}
    def wmode_cnt(o, b):
        if cur[0] == 1: cc[0] += 1; first.setdefault(len(seg), []).append(o) if len(first.get(len(seg), [])) < 3 else None
        _wm2(o, b)
    emu.wmode = wmode_cnt
    def hseg(uc, a, sz, _):
        if cur[0] == 1: seg.append((a - B, cc[0])); cc[0] = 0
        if len(seg) >= 24:
            P('segments', seg); P('first writes', {k: [hex(x) for x in v] for k, v in first.items()}); emu.exited[0] = 1; uc.emu_stop()
    emu.mu.hook_add(UC_HOOK_CODE, hseg, begin=B + 0x258b2, end=B + 0x258b2); emu.mu.hook_add(UC_HOOK_CODE, hseg, begin=B + 0x2592f, end=B + 0x2592f)
if os.environ.get('FIX1'):   # Unicorn artifact fix (fx1 blit): see NOTES; FIX1=tb flushes the TB cache after each self-modifying store of the overlay loop, FIX1=tlb selects the virtual TLB mode
    if os.environ['FIX1'] == 'tlb': emu.mu.ctl_set_tlb_mode(1)
    else:
        def hfix(uc, a, sz, _): uc.ctl_flush_tb()
        for a in (0x25947, 0x25967, 0x25987): emu.mu.hook_add(UC_HOOK_CODE, hfix, begin=B + a, end=B + a)
picdone = []
if 12 in FXS:   # fx12: static picture: record the display once, at the wait loop for order 0x3b (flat 0x7abed), after the planar copy
    def hook_pic(uc, a, sz, _):
        if cur[0] == 12 and not picdone:   # NOT 'not frames[12]': snap() already appended a palette-upload record for fx12 (site 0x7aba9) -> the old test was never true, the run never saved (16 h)
            picdone.append(1)
            frames[12].insert(0, dict(site='pic', vt=emu.vnow(), mt=emu.vnow() - t0[0], order=emu.mu.mem_read(B + 0x3575, 1)[0], pal=np.array(emu.pal, dtype=np.uint8),
                                   crtc={k: v for k, v in emu.crtc.items() if v}, planes=[bytes(p) for p in emu.planes]))
            audit(12); save(12); emu.exited[0] = 1; uc.emu_stop()   # fx12 is the last effect: nothing enters a later effect, so without this the run never saves nor stops (the 'hang' of the first oracle12 run: it recorded the picture but ran on after the demo ended)
    emu.mu.hook_add(UC_HOOK_CODE, hook_pic, begin=B + 0x7abed, end=B + 0x7abed)
fill1 = []   # fx1: the pending size [f9e4/e8/ec] at each of its two reads per plane (0x25e8d.. fill count, 0x25e98.. offset advance): (plane, 1|2, value, irq count). Pure observation (no timing change).
if 1 in FXS:
    def hfill(uc, a, sz, k):
        if cur[0] == 1: fill1.append((k[0], k[1], int.from_bytes(emu.mu.mem_read(B + 0xf9e4 + 4 * k[0], 4), "little"), irqs[0], len(frames[1])))
    for p, (r1, r2) in enumerate(((0x25e8d, 0x25e98), (0x25ee1, 0x25eec), (0x25f35, 0x25f40))):
        for r, wr in ((r1, 1), (r2, 2)): emu.mu.hook_add(UC_HOOK_CODE, hfill, (p, wr), begin=B + r, end=B + r)
# fx1 blit VRAM stores: Unicorn LOSES hooked stores in the blit loops once the overlay loop (0x2592f) has patched code in its own translation block (see NOTES 'fx1'; confirmed a harness
# artifact in 21 Nov 2026 with dosbox-x). Workaround: at the start of each blit loop (0x258b2 plain copy, 0x2592f overlay) write the stores the loop is about to make straight into the planar
# model (same values, same order-independent addresses); the native stores then only repeat them. No change of the instruction stream/timing. NOFIX1PY=1 disables it.
def mirror_blit(uc, a, sz, _):
    if cur[0] != 1: return
    ov = (a - B) == 0x2592f; esi = ireg('ESI'); edi = ireg('EDI'); rows = 16 if ov else 104; n = rows * 20; ebp = ireg('EBP')
    rd = lambda x, m: np.frombuffer(bytes(uc.mem_read(B + x, m)), np.uint8).astype(np.uint32)
    s = rd(esi, 8 * n + 0x9610); i8 = 8 * np.arange(n)
    dw = lambda arr, base, off: arr[base + off] | arr[base + off + 2] << 8 | arr[base + off + 4] << 16 | arr[base + off + 6] << 24
    A0 = dw(s, i8, 0); A1 = dw(s, i8, 0x4b00); A2 = dw(s, i8, 0x9600)
    if ov:
        o = rd(ebp, 8 * n + 0x1410); A0 = A0 | dw(o, i8, 0); A1 = A1 | dw(o, i8, 0xa00); A2 = A2 | dw(o, i8, 0x1400)
    A1 = (A1 + 0x40404040) & 0xffffffff; A2 = (A2 + 0x80808080) & 0xffffffff
    r = np.arange(n) // 20; c = np.arange(n) % 20; e = edi + r * 0xf0 + 4 * c
    for vals, d in ((A0, 0), (A1, 0x50), (A2, 0xa0)):
        for ee, v in zip((e + d).tolist(), vals.tolist()):
            o2 = B + ee - 0xa0000
            for k in range(4): emu.wmode(o2 + k, (v >> 8 * k) & 255)
if 1 in FXS and not os.environ.get('NOFIX1PY'):
    for fa in (0x258b2, 0x2592f): emu.mu.hook_add(UC_HOOK_CODE, mirror_blit, begin=B + fa, end=B + fa)
def save(f):
    if f == 1: json.dump(fill1, open(out + '/fill1.json', 'w'))
    if frames[f]:
        if f != 12: frames[f][-1]['idx'] = emu.display_idx()[0].copy()
        np.save('%s/fx%d.npy' % (out, f), np.array(frames[f], dtype=object), allow_pickle=True); P('saved fx', f, len(frames[f]), 'frames')
auditout = {}
def audit(prev):
    idx, p = emu.display_idx(); used = sorted(set(int(v) for v in np.unique(idx))); miss = [u for u in used if u not in emu.dacw]
    auditout[str(prev)] = dict(dacw=len(emu.dacw), used=len(used), unwritten_used=miss, modes=[m for m in emu.modeaudit if m[0] == prev], crtc={k: v for k, v in emu.crtc.items() if v},
        regs={repr(k): v for k, v in emu.regaudit.get(prev, {}).items()})
    json.dump(auditout, open(out + '/audit.json', 'w'), indent=0)
def fx_enter(uc, a, sz, _):
    prev = cur[0]; cur[0] = FX[a - B]
    if cur[0] == 0 and t0[0] is None: t0[0] = emu.vnow(); mu.mem_write(B + 0x5fe7, struct.pack('<I', 0))
    entry[cur[0]] = emu.vnow() - (t0[0] if t0[0] is not None else 0)
    if os.environ.get('SKIP12') and isinstance(cur[0], int) and cur[0] < 12:   # fast path to fx12: at the entry of effect k jump the virtual clock to 0.05 s before the entry time of effect k+1 (times of the full run, see the logs)
        global ninstr; ENT = [0, 20.8634, 53.9806, 74.0619, 78.1795, 95.9576, 107.3002, 118.1732, 133.9396, 147.2964, 160.6061, 172.6663, 217.2936]
        dj = ENT[cur[0] + 1] - 0.05 - (emu.vnow() - t0[0])
        if dj > 0: ninstr += int(dj * IPS); vt[0] = ninstr / IPS
    if os.environ.get('AUDIT') and prev != 'pre': audit(prev)
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
    if os.environ.get('DBG12') and cur[0] == 12 and (ninstr // CH) % 20000 == 0: P('DBG eip=%x vt=%.3f' % (ireg('EIP') - B, emu.vnow()))
for f in FXS: 
    if frames[f] and not os.path.exists('%s/fx%d.npy' % (out, f)): save(f)
json.dump(entry, open(out + '/entry.json', 'w'))
P('refresh states seen by the 3DA polls (effect, vtotal lines, Hz, seq1, misc out): ' + repr([k for k in emu.hzlog]))
