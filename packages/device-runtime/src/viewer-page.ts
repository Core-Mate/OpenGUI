/** Read-only H.264 canvas. No model image capture or phone input route exists here. */
export function viewerPage(): string {
  return String.raw`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenGUI · 实时设备墙</title>
<style>body{margin:0;background:#101318;color:#edf2f6;font:14px system-ui}header{padding:16px;border-bottom:1px solid #303640}h1{font-size:18px;margin:0 0 8px}#wall{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:16px}.phone{background:#1b2029;border-radius:14px;padding:12px}canvas{display:block;max-width:100%;max-height:75vh;margin:auto;background:#080a0d}p{color:#aeb9ca;overflow-wrap:anywhere}button{background:#d9efcf;border:0;border-radius:8px;padding:8px 16px;cursor:pointer}canvas.stale{opacity:.3}</style>
<header><h1>OpenGUI 实时设备墙</h1><span id="task">准备中</span><p>画面仅供观看。停止 AI 任务请使用聊天中的停止入口。</p></header><main id="wall"></main>
<script>
const base=location.pathname, cards=new Map();let ended=false;
const presence=new WebSocket(location.origin.replace('http:','ws:')+base+'presence');
presence.onclose=()=>{if(!ended)document.querySelector('#task').textContent='viewer_disconnected：观看服务已关闭，请重新打开设备墙'};

function codec(data){for(let i=0;i+7<data.length;i++){const n=data[i]===0&&data[i+1]===0?(data[i+2]===1?i+3:data[i+2]===0&&data[i+3]===1?i+4:-1):-1;if(n>=0&&(data[n]&31)===7)return 'avc1.'+[data[n+1],data[n+2],data[n+3]].map(v=>v.toString(16).padStart(2,'0')).join('')}return 'avc1.42e01e'}
function reset(c){c.rendered=false;c.waitKey=true;c.config=[];if(c.decoder){try{c.decoder.close()}catch{}c.decoder=null}c.canvas.classList.add('stale')}
function stop(c){clearTimeout(c.timer);if(c.ws){c.ws.onclose=null;c.ws.close();c.ws=null}reset(c)}
function connect(c){
 if(document.hidden||ended)return;stop(c);c.message.textContent='正在连接实时视频…';
 if(!globalThis.VideoDecoder){c.message.textContent='decoder_unavailable：当前浏览器没有 VideoDecoder';return}
 const ws=new WebSocket(location.origin.replace('http:','ws:')+base+'stream?deviceId='+encodeURIComponent(c.id));c.ws=ws;ws.binaryType='arraybuffer';
 ws.onmessage=e=>{if(c.ws!==ws)return;try{
 if(typeof e.data==='string'){const m=JSON.parse(e.data);if(m.type==='connection'){c.connectionId=m.connectionId;c.challenge=m.challenge}
 else if(m.type==='session'||m.type==='reset')reset(c);
 else if(m.type==='error'){c.message.textContent=m.message;c.canvas.classList.add('stale')}
 return}
 const data=new Uint8Array(e.data),flags=data[0],key=!!(flags&2),payload=data.subarray(9);
 if(flags&1){reset(c);c.config=[payload.slice()];return}
 if(c.decoder&&c.decoder.decodeQueueSize>3){c.decoder.reset();c.decoder.close();c.decoder=null;c.waitKey=true}
 if(c.waitKey&&!key)return;
 let bytes=payload;
 if(key){let size=payload.length;for(const p of c.config)size+=p.length;bytes=new Uint8Array(size);let i=0;for(const p of c.config){bytes.set(p,i);i+=p.length}bytes.set(payload,i)}
 if(!c.decoder){const context=c.canvas.getContext('2d',{alpha:false,desynchronized:true});
 c.decoder=new VideoDecoder({output(frame){try{if(c.ws!==ws||document.hidden)return;if(c.canvas.width!==frame.displayWidth)c.canvas.width=frame.displayWidth;if(c.canvas.height!==frame.displayHeight)c.canvas.height=frame.displayHeight;context.drawImage(frame,0,0);c.canvas.classList.remove('stale');c.rendered=true;c.frames++;c.lastPTS=frame.timestamp;c.decodedAt=Date.now();c.message.textContent='实时播放';void receipt(c)}finally{frame.close()}},error(err){c.message.textContent='decode_failed: '+err.message;ws.close()}});
 c.decoder.configure({codec:codec(bytes),optimizeForLatency:true,hardwareAcceleration:'prefer-hardware'})}
 c.waitKey=false;c.decoder.decode(new EncodedVideoChunk({type:key?'key':'delta',timestamp:Number(new DataView(e.data).getBigUint64(1)),data:bytes}));
 }catch(err){c.message.textContent='decode_failed: '+err.message;ws.close()}};
 ws.onclose=()=>{if(c.ws!==ws)return;c.ws=null;reset(c);if(document.hidden||ended)return;if(c.retries++<3){c.message.textContent='视频连接中断，正在重连…';c.timer=setTimeout(()=>connect(c),500*2**c.retries)}else c.message.textContent='video_disconnected：重连已停止，请点击重试'};
}
async function receipt(c){if(document.hidden||!c.rendered||!c.ws||c.pending||Date.now()-c.lastReceipt<1000)return;c.pending=true;c.lastReceipt=Date.now();const ws=c.ws;try{const r=await fetch(base+'frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:c.connectionId,challenge:c.challenge,deviceId:c.id,visible:true})});if(r.ok){const m=await r.json();if(c.ws===ws)c.challenge=m.challenge}else{c.message.textContent='frame_receipt_rejected';ws.close()}}catch{}finally{c.pending=false}}
function card(d){const el=document.createElement('section');el.className='phone';const name=document.createElement('h2');name.textContent=d.name;const canvas=document.createElement('canvas'),message=document.createElement('p'),retry=document.createElement('button');retry.textContent='重试视频';el.append(name,canvas,message,retry);document.querySelector('#wall').append(el);const c={id:d.id,canvas,message,ws:null,decoder:null,config:[],waitKey:true,retries:0,frames:0,lastReceipt:0,pending:false,rendered:false};retry.onclick=()=>{c.retries=0;connect(c)};cards.set(d.id,c);connect(c)}
async function status(){try{const r=await fetch(base+'status');if(!r.ok)throw Error('viewer_unavailable');const s=await r.json();document.querySelector('#task').textContent=s.message||({preparing:'准备中',executing:'执行中',ended:'任务已结束 · 继续投屏'})[s.taskState];if(s.state==='closed'){ended=true;presence.close();for(const c of cards.values())stop(c);document.querySelector('#task').textContent='设备墙已关闭';return}for(const d of s.devices)if(!cards.has(d.id))card(d);for(const c of cards.values())void receipt(c)}catch{document.querySelector('#task').textContent='viewer_disconnected：服务已退出，请重新打开设备墙'}}
document.addEventListener('visibilitychange',()=>{for(const c of cards.values()){if(document.hidden){stop(c);c.message.textContent='页面隐藏，播放已暂停'}else{c.retries=0;connect(c)}}});addEventListener('pagehide',()=>{ended=true;presence.close();for(const c of cards.values())stop(c)});void status();setInterval(()=>{if(!document.hidden&&!ended)void status()},1000);
</script></html>`
}
