#!/usr/bin/env python3
"""s3mtime.py: walk X14.S3M (speed A, tempo T, jump B, break C, pattern loop SBx, delay SEx) -> s3mtime.json
rows=[order,pattern,row,start_time_sec] in play order (first pass only, stops when an order is revisited)."""
import struct,json,sys
d=open(sys.argv[1] if len(sys.argv)>1 else '../X14.S3M','rb').read()
name=d[:28].split(b'\0')[0]; ordn,insn,patn,flags,ver,ffi=struct.unpack_from('<6H',d,0x20)
gv,speed,tempo=d[0x30],d[0x31],d[0x32]
orders=list(d[0x60:0x60+ordn]); pp=struct.unpack_from('<%dH'%patn,d,0x60+ordn+2*insn)
def pat(i):
    o=pp[i]*16; rows=[[] for _ in range(64)]
    if not o: return rows
    ln=struct.unpack_from('<H',d,o)[0]; p=o+2; r=0
    while r<64 and p<o+ln:
        b=d[p]; p+=1
        if b==0: r+=1; continue
        ch=b&31
        if b&32: p+=2
        if b&64: p+=1
        if b&128: rows[r].append((d[p],d[p+1])); p+=2
    return rows
P={}
t=0.0; o=0; r=0; out=[]; seen=set(); loopmark={}; loopcnt={}
while o<len(orders):
    pn=orders[o]
    if pn>=254: o+=1; r=0; continue
    if pn>=patn: break
    if (o,r)in seen: break
    seen.add((o,r))
    P.setdefault(pn,pat(pn)); row=P[pn][r]
    out.append([o,pn,r,round(t,4)])
    nxt=None; brk=None; delay=0; spd_chg=False
    for cmd,info in row:
        c=chr(64+cmd) if cmd else ''
        if c=='A' and info: speed=info
        elif c=='T' and info>=32: tempo=info
        elif c=='B': nxt=info
        elif c=='C': brk=(info>>4)*10+(info&15)
        elif c=='S':
            if info>>4==0xE: delay=info&15
            elif info>>4==0xB:
                x=info&15
                if x==0: loopmark[o]=r
                else:
                    k=(o,r)
                    if loopcnt.get(k,0)<x and o in loopmark: loopcnt[k]=loopcnt.get(k,0)+1; brk=-1; nxt=('loop',loopmark[o])
    t+=speed*(1+delay)*2.5/tempo
    if isinstance(nxt,tuple): r=nxt[1]; continue
    if nxt is not None: o=nxt; r=brk if brk and brk>0 else 0
    elif brk is not None: o+=1; r=brk
    else:
        r+=1
        if r>=64: o+=1; r=0
print('orders',ordn,'patterns',patn,'rows played',len(out),'duration %.1fs'%t,'init speed/tempo',speed,tempo,'name',name)
json.dump({'rows':out,'orders':orders,'duration':t},open('s3mtime.json','w'))
