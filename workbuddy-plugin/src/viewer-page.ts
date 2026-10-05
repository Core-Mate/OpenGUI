import { workbenchShell, workbenchScript } from './workbench-page.ts'
/** Device canvas with a scoped workbench capability; no arbitrary phone input route. */
export function viewerPage(): string {
  return String.raw`${workbenchShell()}<script>
const base=location.pathname, cards=new Map();let ended=false;
const presence=new WebSocket(location.origin.replace('http:','ws:')+base+'presence');
presence.onclose=()=>{if(!ended)document.querySelector('#task').textContent='画面服务已关闭，请在 WorkBuddy 对话中重新打开工作台'};

function codec(data){for(let i=0;i+7<data.length;i++){const n=data[i]===0&&data[i+1]===0?(data[i+2]===1?i+3:data[i+2]===0&&data[i+3]===1?i+4:-1):-1;if(n>=0&&(data[n]&31)===7)return 'avc1.'+[data[n+1],data[n+2],data[n+3]].map(v=>v.toString(16).padStart(2,'0')).join('')}return 'avc1.42e01e'}
function reset(c){c.generation=(c.generation||0)+1;c.rendered=false;c.waitKey=true;c.config=[];if(c.decoder){try{c.decoder.close()}catch{}c.decoder=null}c.canvas.classList.add('stale')}
function note(c,text,retry=false){c.message.textContent=text;c.retry.hidden=!retry}
function stop(c){clearTimeout(c.timer);if(c.ws){c.ws.onclose=null;c.ws.close();c.ws=null}reset(c)}
function connect(c){
 if(document.hidden||ended)return;stop(c);note(c,c.hadFrame?'正在重新连接画面…':'');
 const ws=new WebSocket(location.origin.replace('http:','ws:')+base+(c.route||'stream')+'?deviceId='+encodeURIComponent(c.id));c.ws=ws;ws.binaryType='arraybuffer';
 ws.onmessage=async e=>{if(c.ws!==ws)return;try{
 if(typeof e.data==='string'){const m=JSON.parse(e.data);if(m.type==='connection'){c.connectionId=m.connectionId;c.challenge=m.challenge}
 else if(m.type==='session'||m.type==='reset')reset(c);
 else if(m.type==='error'){note(c,'画面暂时不可用，正在重试…');c.message.title=String(m.message||'');c.canvas.classList.add('stale')}
 return}
 const data=new Uint8Array(e.data),flags=data[0],key=!!(flags&2),payload=data.subarray(9);c.receivedAt=Date.now();
 if(flags===4){
  if(c.imagePending)return;c.imagePending=true;
  const generation=c.generation,capturedAt=Number(new DataView(e.data).getBigUint64(1));
  try{const frame=await createImageBitmap(new Blob([payload],{type:'image/jpeg'}));
   try{if(c.ws!==ws||document.hidden||generation!==c.generation)return;
    if(c.canvas.width!==frame.width)c.canvas.width=frame.width;if(c.canvas.height!==frame.height)c.canvas.height=frame.height;
    c.canvas.getContext('2d',{alpha:false}).drawImage(frame,0,0);c.canvas.classList.remove('stale');c.rendered=true;c.hadFrame=true;c.retries=0;c.frames++;c.lastPTS=capturedAt;c.decodedAt=Date.now();
    note(c,'间隔截图 · 更新于 '+new Date(capturedAt).toLocaleTimeString());c.onFrame?.();void receipt(c);
   }finally{frame.close()}
  }finally{c.imagePending=false}return;
 }
 if(!globalThis.VideoDecoder){note(c,'当前环境不支持视频解码，请更新 WorkBuddy 后重试',true);ws.close();return}
 if(flags&1){reset(c);c.config=[payload.slice()];return}
 // Reconnect replays a whole GOP at once; only a sustained backlog is worth dropping to the next key frame.
 if(c.decoder&&c.decoder.decodeQueueSize>8){c.backlogSince??=Date.now();if(Date.now()-c.backlogSince>1000){c.decoder.reset();c.decoder.close();c.decoder=null;c.waitKey=true;c.backlogSince=undefined}}else c.backlogSince=undefined;
 if(c.waitKey&&!key)return;
 let bytes=payload;
 if(key){let size=payload.length;for(const p of c.config)size+=p.length;bytes=new Uint8Array(size);let i=0;for(const p of c.config){bytes.set(p,i);i+=p.length}bytes.set(payload,i)}
 if(!c.decoder){const context=c.canvas.getContext('2d',{alpha:false,desynchronized:true});
 c.decoder=new VideoDecoder({output(frame){try{if(c.ws!==ws||document.hidden)return;if(c.canvas.width!==frame.displayWidth)c.canvas.width=frame.displayWidth;if(c.canvas.height!==frame.displayHeight)c.canvas.height=frame.displayHeight;context.drawImage(frame,0,0);c.canvas.classList.remove('stale');c.rendered=true;c.hadFrame=true;c.retries=0;c.frames++;c.lastPTS=frame.timestamp;c.decodedAt=Date.now();if(c.message.textContent)note(c,'');c.onFrame?.();void receipt(c)}finally{frame.close()}},error(){note(c,'画面解码失败，正在重新连接…');ws.close()}});
 c.decoder.configure({codec:codec(bytes),optimizeForLatency:true,hardwareAcceleration:'prefer-hardware'})}
 c.waitKey=false;c.decoder.decode(new EncodedVideoChunk({type:key?'key':'delta',timestamp:Number(new DataView(e.data).getBigUint64(1)),data:bytes}));
 }catch{note(c,'画面解码失败，正在重新连接…');ws.close()}};
 ws.onclose=e=>{if(c.ws!==ws)return;c.ws=null;reset(c);if(c.preview){if(e.reason!=='preview_ended')c.onFail?.();return}if(document.hidden||ended)return;if(c.retries++<3){note(c,'画面连接中断，正在重连…');c.timer=setTimeout(()=>connect(c),500*2**c.retries)}else note(c,'画面已断开，点击「重试」重新连接',true)};
}
// The start page's live view of a candidate device; its frames never count as the task's display.
let previewCard=null;
globalThis.openguiPreview={open(id,canvas,onFrame,onFail){this.close();if(!globalThis.VideoDecoder||ended)return false;previewCard={id,route:'preview-stream',preview:true,canvas,onFrame,onFail,message:{textContent:''},retry:{hidden:true},ws:null,decoder:null,config:[],waitKey:true,retries:0,frames:0,lastReceipt:0,pending:false,rendered:false,hadFrame:false};connect(previewCard);return true},close(){if(previewCard){const c=previewCard;previewCard=null;stop(c)}}};
function lagging(c){return c.receivedAt-c.decodedAt>3000}
async function receipt(c){if(c.preview||document.hidden||!c.rendered||!c.ws||c.pending||lagging(c)||Date.now()-c.lastReceipt<1000)return;c.pending=true;c.lastReceipt=Date.now();const ws=c.ws;try{const r=await fetch(base+'frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:c.connectionId,challenge:c.challenge,deviceId:c.id,visible:true})});if(r.ok){const m=await r.json();if(c.ws===ws)c.challenge=m.challenge}else{note(c,'画面校验未通过，正在重新连接…');ws.close()}}catch{}finally{c.pending=false}}
function card(d){const el=document.createElement('section');el.className='phone';const name=document.createElement('h2');name.textContent=d.name;const canvas=document.createElement('canvas'),message=document.createElement('p'),retry=document.createElement('button');canvas.width=540;canvas.height=1170;message.className='message';retry.className='retry';retry.textContent='重试';retry.hidden=true;const screen=document.createElement('div'),watermark=document.createElement('div');screen.className='screen';watermark.className='watermark';watermark.className='watermark placeholder';watermark.textContent='正在连接设备画面…';screen.append(canvas,watermark);el.append(name,screen,message,retry);document.querySelector('#wall').append(el);const c={id:d.id,el,watermark,canvas,message,retry,ws:null,decoder:null,config:[],waitKey:true,retries:0,frames:0,lastReceipt:0,pending:false,rendered:false,hadFrame:false};retry.onclick=()=>{c.retries=0;connect(c)};cards.set(d.id,c);connect(c)}
async function status(){try{const r=await fetch(base+'status');if(!r.ok)throw Error('viewer_unavailable');const s=await r.json();renderBoard(s);if(s.state==='closed'){ended=true;presence.close();for(const c of cards.values())stop(c);document.querySelector('#task').textContent='画面已关闭';return}for(const d of s.devices)if(!cards.has(d.id))card(d);for(const c of cards.values()){if(c.ws&&c.rendered&&lagging(c)){c.canvas.classList.add('stale');note(c,'正在刷新画面…')}void receipt(c)}}catch{document.querySelector('#task').textContent='画面服务已退出，请在 WorkBuddy 对话中重新打开工作台'}}
document.addEventListener('visibilitychange',()=>{for(const c of cards.values()){if(document.hidden){stop(c);note(c,'页面隐藏，播放已暂停')}else{c.retries=0;connect(c)}}});addEventListener('pagehide',()=>{ended=true;presence.close();for(const c of cards.values())stop(c)});addEventListener('DOMContentLoaded',()=>void status());setInterval(()=>{if(!document.hidden&&!ended)void status()},1000);
</script>${workbenchScript()}</body></html>`
}
