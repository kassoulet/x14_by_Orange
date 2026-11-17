// UI smoke test (headless google-chrome, CDP): play advances time, pause holds, seek jumps (slider + x14.seek), effects render (non-empty canvas),
// canvas shown 4:3 (CSS box and a 320x400 effect), no page exceptions. Serves web/ itself.  usage: node tools/uitest.mjs
import {spawn} from 'child_process';import fs from 'fs';import http from 'http';import path from 'path';import {fileURLToPath} from 'url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'../web');
const srv=http.createServer((q,r)=>{let p=path.join(root,q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}const m={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.wasm':'application/wasm'};r.writeHead(200,{'content-type':m[path.extname(p)]||'application/octet-stream'});r.end(d);});}).listen(0);
const ch=spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required','--window-size=1100,900','--remote-debugging-port=9337','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,2000));
const tabs=await (await fetch('http://localhost:9337/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pend={};let exc=0;ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id])pend[d.id](d);if(d.method==='Runtime.exceptionThrown'){exc++;console.log('EXC',JSON.stringify(d.params.exceptionDetails).slice(0,300));}};
const send=(method,params={})=>new Promise(r=>{pend[++id]=r;ws.send(JSON.stringify({id,method,params}))});
const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.result.value;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ok=(n,c,x='')=>{console.log(c?'PASS':'FAIL',n,x);if(!c)process.exitCode=1};
await send('Runtime.enable');await send('Page.navigate',{url:`http://localhost:${srv.address().port}/index.html`});await wait(1500);
const tm=()=>ev('document.getElementById("tm").textContent'), cur=()=>ev('x14.cur()');
const box=await ev('(()=>{const r=document.getElementById("stage").getBoundingClientRect();return [r.width,r.height]})()');
ok('stage is 4:3',Math.abs(box[0]/box[1]-4/3)<0.02,box.join('x'));
await ev('document.getElementById("pp").click()');await wait(3500);const t1=await cur();ok('time advances while playing',t1>2,t1.toFixed(2)+' s');
await ev('document.getElementById("pp").click()');const a=await cur();await wait(1200);const b=await cur();ok('pause holds',a===b,a.toFixed(2)+' '+b.toFixed(2));
await ev('(()=>{const s=document.getElementById("seek");s.value=1000;s.dispatchEvent(new Event("input"));})()');await wait(600);
const s1=await cur();ok('slider seek to 100 s',Math.abs(s1-100)<0.5,s1.toFixed(2));
await ev('document.getElementById("pp").click()');await wait(2000);const p1=await cur();ok('play resumes from seek',p1>101.5&&p1<104.5,p1.toFixed(2));
await ev('document.getElementById("pp").click()');
// per-effect: seek in, canvas non-empty, size
const px=()=>ev('(()=>{const c=document.getElementById("c"),d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]|d[i+1]|d[i+2])n++;return [c.width,c.height,n]})()');
// ported effects (fx02, fx03..fx12): seek in, the canvas shows the picture (not the placeholder), size; seeking back and forth gives the same picture (pure functions of t)
const snap=()=>ev('(()=>{const c=document.getElementById("c");return Array.from(c.getContext("2d").getImageData(0,0,c.width,c.height).data.filter((v,i)=>i%97===0)).join()})()');
for(const [t,name,h] of [[75.6,'fx03',240],[99.5,'fx05',133],[110,'fx06',200],[125,'fx07',100],[140,'fx08',96],[84,'fx04',200],[155,'fx09',133],[165,'fx10',120],[185,'fx11',400],[60,'fx02',240],[230,'fx12',240]]){await ev(`x14.seek(${t})`);await wait(1500);const [w,hh,n]=await px();ok(name+` at ${t}s renders`,n>1000,`${w}x${hh} nonblack=${n}`);
  if(!name.includes('placeholder'))ok(name+' is the ported effect (canvas '+w+'x'+h+')',w===(name==='fx12'?640:320)&&hh===h);}
await ev('x14.seek(110)');await wait(500);const h1=await snap();await ev('x14.seek(76)');await wait(300);await ev('x14.seek(110)');await wait(500);const h2=await snap();
ok('fx06 seek(110) twice gives the same picture',h1===h2);
ok('no page exceptions',exc===0);
ch.kill();srv.close();process.exit(process.exitCode||0);
