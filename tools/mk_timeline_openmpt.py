#!/usr/bin/env python3
"""mk_timeline_openmpt.py: replace the row start times of re/s3mtime.json (play order from the model, re/s3mtime.py) by libopenmpt's
(set_position_order_row + get_position_seconds), so the effects' row-keyed events are locked to the audio the web player plays.
The model (tick = 2.5/tempo s exact, saved as re/s3mtime.model.json) differs from libopenmpt (tick rounded to whole samples) by 0.07%: 0.2 s at the end.
Then run tools/mk_timeline.py."""
import ctypes,json,os
H=os.path.dirname(os.path.abspath(__file__)); L=ctypes.CDLL('libopenmpt.so.0'); P=ctypes.c_void_p
d=open(H+'/../X14.S3M','rb').read()
L.openmpt_module_create_from_memory2.restype=P; L.openmpt_module_create_from_memory2.argtypes=[ctypes.c_char_p,ctypes.c_size_t]+[P]*7
L.openmpt_module_get_position_seconds.restype=ctypes.c_double; L.openmpt_module_get_position_seconds.argtypes=[P]
L.openmpt_module_set_position_order_row.argtypes=[P,ctypes.c_int,ctypes.c_int]
L.openmpt_module_get_current_order.argtypes=[P]; L.openmpt_module_get_current_row.argtypes=[P]
m=L.openmpt_module_create_from_memory2(d,len(d),None,None,None,None,None,None,None)
j=json.load(open(H+'/../re/s3mtime.model.json')); out=[]; bad=0
for o,p,r,_ in j['rows']:
    L.openmpt_module_set_position_order_row(m,o,r)
    if (L.openmpt_module_get_current_order(m),L.openmpt_module_get_current_row(m))!=(o,r): bad+=1
    out.append([o,p,r,round(L.openmpt_module_get_position_seconds(m),4)])
assert all(a[3]<=b[3] for a,b in zip(out,out[1:])),'not monotonic'
j['rows']=out; j['duration']=out[-1][3]; json.dump(j,open(H+'/../re/s3mtime.json','w'))
print(len(out),'rows, positions not reached exactly:',bad,'last row at %.2f s'%out[-1][3])
