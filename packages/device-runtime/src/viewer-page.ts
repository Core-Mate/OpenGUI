/** Read-only H.264 canvas. No model image capture or phone input route exists here. */
export function viewerPage(): string {
  return String.raw`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenGUI · 实时设备墙</title>
<style>body{height:100vh;display:flex;flex-direction:column;margin:0;background:#101318;color:#edf2f6;font:14px system-ui}header{flex:none;padding:16px;border-bottom:1px solid #303640}h1{font-size:18px;margin:0 0 8px}#wall{flex:1;min-height:0;display:grid;grid-auto-rows:minmax(0,1fr);grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:16px}.phone{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto auto;background:#1b2029;border-radius:14px;padding:12px}canvas{display:block;width:100%;height:100%;min-height:0;object-fit:contain;max-width:100%;margin:auto;background:#080a0d}p{color:#aeb9ca;overflow-wrap:anywhere}button{background:#d9efcf;border:0;border-radius:8px;padding:8px 16px;cursor:pointer}canvas.stale{opacity:.3}.embedded header{display:none}.embedded #wall{padding:0;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}.embedded .phone h2{font-size:16px;margin:0 0 8px}.embedded body{background:#fff;color:#24312f;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.embedded .phone{background:#eef1ef;border-radius:4px;padding:10px}.embedded .phone h2{font-size:13px;margin-bottom:6px}.embedded p{color:#626f69;font-size:12px;margin:6px 0}.embedded button{background:#fff;border:1px solid #dce2de;border-radius:6px;color:#24312f;font:inherit;cursor:pointer}.embedded canvas{background:#eef1ef}</style>
<header><h1>OpenGUI 实时设备墙</h1><span id="task">准备中</span><p>画面仅供观看。自主任务请在工作台停止；逐步控制请使用宿主停止入口。</p></header><main id="wall"></main>
<script>
document.documentElement.classList.toggle('embedded',parent!==window);
const base=location.pathname, cards=new Map();let ended=false;
const presence=new WebSocket(location.origin.replace('http:','ws:')+base+'presence');
presence.onclose=()=>{if(!ended)document.querySelector('#task').textContent='viewer_disconnected：观看服务已关闭，请重新打开设备墙'};

function codec(data){for(let i=0;i+7<data.length;i++){const n=data[i]===0&&data[i+1]===0?(data[i+2]===1?i+3:data[i+2]===0&&data[i+3]===1?i+4:-1):-1;if(n>=0&&(data[n]&31)===7)return 'avc1.'+[data[n+1],data[n+2],data[n+3]].map(v=>v.toString(16).padStart(2,'0')).join('')}return 'avc1.42e01e'}
function reset(c){c.rendered=false;c.waitKey=true;c.config=[];if(c.decoder){try{c.decoder.close()}catch{}c.decoder=null}c.canvas.classList.add('stale')}
function stop(c){clearTimeout(c.timer);if(c.ws){c.ws.onclose=null;c.ws.close();c.ws=null}reset(c)}
function connect(c){
 if(document.hidden||ended)return;stop(c);c.message.hidden=true;
 if(!globalThis.VideoDecoder){c.message.textContent='当前浏览器不支持实时视频';c.message.hidden=false;return}
 const ws=new WebSocket(location.origin.replace('http:','ws:')+base+'stream?deviceId='+encodeURIComponent(c.id));c.ws=ws;ws.binaryType='arraybuffer';
 ws.onmessage=e=>{if(c.ws!==ws)return;try{
 if(typeof e.data==='string'){const m=JSON.parse(e.data);if(m.type==='connection'){c.connectionId=m.connectionId;c.challenge=m.challenge}
 else if(m.type==='session'||m.type==='reset')reset(c);
 else if(m.type==='error'){c.message.textContent=m.message;c.canvas.classList.add('stale')}
 return}
 const data=new Uint8Array(e.data),flags=data[0],key=!!(flags&2),payload=data.subarray(9);
 if(flags&1){reset(c);c.config=[payload.slice()];return}
 if(c.waitKey&&!key)return;
 let bytes=payload;
 if(key){let size=payload.length;for(const p of c.config)size+=p.length;bytes=new Uint8Array(size);let i=0;for(const p of c.config){bytes.set(p,i);i+=p.length}bytes.set(payload,i)}
 if(!c.decoder){const context=c.canvas.getContext('2d',{alpha:false,desynchronized:true});
 c.decoder=new VideoDecoder({output(frame){try{if(c.ws!==ws||document.hidden)return;if(c.canvas.width!==frame.displayWidth)c.canvas.width=frame.displayWidth;if(c.canvas.height!==frame.displayHeight)c.canvas.height=frame.displayHeight;context.drawImage(frame,0,0);c.canvas.classList.remove('stale');c.rendered=true;c.frames++;c.retries=0;c.lastPTS=frame.timestamp;c.decodedAt=Date.now();void receipt(c)}finally{frame.close()}},error(err){c.message.textContent='decode_failed: '+err.message;ws.close()}});
 c.decoder.configure({codec:codec(bytes),optimizeForLatency:true,hardwareAcceleration:'prefer-hardware'})}
 c.waitKey=false;c.decoder.decode(new EncodedVideoChunk({type:key?'key':'delta',timestamp:Number(new DataView(e.data).getBigUint64(1)),data:bytes}));
 }catch(err){c.message.textContent='decode_failed: '+err.message;ws.close()}};
 ws.onclose=()=>{if(c.ws!==ws)return;c.ws=null;reset(c);if(document.hidden||ended)return;const delay=Math.min(10_000,500*2**Math.min(c.retries++,5));c.timer=setTimeout(()=>connect(c),delay)};
}
async function receipt(c){if(document.hidden||!c.visible||!c.rendered||!c.ws||c.pending||Date.now()-c.lastReceipt<1000)return;c.pending=true;c.lastReceipt=Date.now();const ws=c.ws;try{const r=await fetch(base+'frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:c.connectionId,challenge:c.challenge,deviceId:c.id,visible:true})});if(r.ok){const m=await r.json();if(c.ws===ws)c.challenge=m.challenge}else{c.message.textContent='frame_receipt_rejected';ws.close()}}catch{}finally{c.pending=false}}
function card(d){const el=document.createElement('section');el.className='phone';const name=document.createElement('h2');name.textContent=d.name;const canvas=document.createElement('canvas'),message=document.createElement('p');message.hidden=true;el.append(name,canvas,message);document.querySelector('#wall').append(el);const c={id:d.id,canvas,message,ws:null,decoder:null,config:[],waitKey:true,retries:0,frames:0,lastReceipt:0,pending:false,rendered:false,visible:false};new IntersectionObserver(entries=>{c.visible=entries.some(e=>e.isIntersecting&&e.intersectionRatio>0);if(c.visible)void receipt(c)}).observe(canvas);cards.set(d.id,c);connect(c)}
async function status(){try{const r=await fetch(base+'status');if(!r.ok)throw Error('viewer_unavailable');const s=await r.json();document.querySelector('#task').textContent=s.message||({preparing:'准备中',executing:'执行中',ended:'任务已结束 · 继续投屏'})[s.taskState];if(s.state==='closed'){ended=true;presence.close();for(const c of cards.values())stop(c);document.querySelector('#task').textContent='设备墙已关闭';return}for(const d of s.devices)if(!cards.has(d.id))card(d);for(const c of cards.values())void receipt(c)}catch{document.querySelector('#task').textContent='viewer_disconnected：服务已退出，请重新打开设备墙'}}
document.addEventListener('visibilitychange',()=>{for(const c of cards.values()){if(document.hidden){stop(c);c.message.textContent='页面隐藏，播放已暂停'}else{c.retries=0;connect(c)}}});addEventListener('pagehide',()=>{ended=true;presence.close();for(const c of cards.values())stop(c)});void status();setInterval(()=>{if(!document.hidden&&!ended)void status()},1000);
</script></html>`
}
