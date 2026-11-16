#!/usr/bin/env python3
"""oracle4bin.py ORACLE_DIR OUT_PREFIX: fx4 oracle (loop top 0x49a73 / frame hooks 0x49b31, 0x497f0) -> PREFIX.json (per pass: v = {hex flat address: dword} for every state variable the pass/tick use, incl. the
unaligned ones (rebuilt from the aligned snapshot dwords), a2 = dword at 0x2afc5, vt, irqs, order, row, tick-in-order = word 0x3573) + PREFIX.idx (N x 200x320 displayed index planes) + PREFIX.pal (N x 768, 6-bit DAC)."""
import sys, json, struct, numpy as np
sys.path.insert(0, __file__.rsplit('/', 2)[0] + '/re')
src = open(__file__.rsplit('/', 2)[0] + '/re/fx_oracle.py').read(); i = src.index('      4: dict(top=0x49a73'); seg = src[i:src.index('extra=', i)]
ctr = [int(x, 16) for x in __import__('re').findall(r'0x[0-9a-f]+', seg[seg.index('ctr='):])]
fr = np.load(sys.argv[1] + '/fx4.npy', allow_pickle=True); out = sys.argv[2]
NEED = [0x2ffd5, 0x2ffd9, 0x2ffdd, 0x2ffe1, 0x2ffed, 0x302f5, 0x302f9, 0x302fd, 0x30309, 0x30315, 0x30319, 0x30329, 0x30339, 0x478d5, 0x49bac, 0x49bb0, 0x49bb4, 0x49bb8, 0x49ec0, 0x49ec4, 0x49ec8, 0x48f15, 0x2afc5]
def mk(f):
    m = {}
    for a, v in zip(ctr, f['tick']): m[a] = v & 0xffffffff
    m[0x2afc5] = f['extra'][0] & 0xffffffff
    b = {}
    for a, v in m.items():
        if a % 4 == 0: b.update({a + k: (v >> 8 * k) & 255 for k in range(4)})
    return {hex(a): (m[a] if a in m and a % 4 == 0 else sum(b.get(a + k, 0) << 8 * k for k in range(4))) for a in NEED}
meta = [dict(v=mk(f), vt=f['vt'], irqs=f['irqs'], order=f['order'], row=f['row'], tw=f['tick'][-3 - 0] if False else None) for f in fr]
print(len(fr), 'passes', fr[0]['idx'].shape, 'order', fr[0]['order'], '..', fr[-1]['order'], 'ctr', len(ctr), 'tick', len(fr[0]['tick']))
json.dump(meta, open(out + '.json', 'w'))
open(out + '.idx', 'wb').write(b''.join(f['idx'].astype(np.uint8).tobytes() for f in fr)); open(out + '.pal', 'wb').write(b''.join(f['pal'].astype(np.uint8).tobytes() for f in fr))
for k, v in fr[0]['dump'].items():
    if isinstance(k, int): open(out + '.dump%x' % k, 'wb').write(v)
