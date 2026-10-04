import { workbenchShell, workbenchScript } from './workbench-page.ts'
/** Device canvas with a scoped workbench capability; no arbitrary phone input route. */
export function viewerPage(): string {
  return String.raw`${workbenchShell()}<script>
const base=location.pathname, cards=new Map();let ended=false;
const presence=new WebSocket(location.origin.replace('http:','ws:')+base+'presence');
presence.onclose=()=>{if(!ended)document.querySelector('#task').textContent='画面服务已关闭，请在 WorkBuddy 对话中重新打开工作台'};
presence.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='action')showDeviceAction(m.deviceId,m.action)}catch{}};

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
// 接管设备: the person operates the phone with mouse and keyboard on the live picture. Events go in
// video-frame coordinates; the server re-checks the takeover state for every event, and input stops
// when control returns to the agent. Scrcpy sends no frames for a static screen, so input never
// waits on a new frame.
const takeoverQueue=[];let takeoverSending=false,takeoverNotice='';
function takeoverInput(c,event){if(c.takeover){takeoverQueue.push({c,event});void flushTakeover()}}
async function flushTakeover(){
 if(takeoverSending)return;takeoverSending=true;
 try{while(takeoverQueue.length){
  const c=takeoverQueue[0].c,events=[];
  while(takeoverQueue.length&&takeoverQueue[0].c===c&&events.length<64)events.push(takeoverQueue.shift().event);
  const r=await fetch(base+'input',{method:'POST',headers:{'Content-Type':'application/json','X-OpenGUI-Board':boardToken||''},body:JSON.stringify({deviceId:c.id,events})});
  if(!r.ok){takeoverQueue.length=0;const m=(await r.json().catch(()=>({}))).error||'输入没有发送到手机';if(takeoverNotice!==m){takeoverNotice=m;toast(m);setTimeout(()=>{takeoverNotice=''},3000)}}
 }}catch{takeoverQueue.length=0;toast('输入没有发送到手机，请检查连接')}finally{takeoverSending=false}
}
function framePoint(c,e){const r=c.canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*c.canvas.width,y:(e.clientY-r.top)/r.height*c.canvas.height,width:c.canvas.width,height:c.canvas.height}}
function sendTakeoverText(c,text){text.split(/\r?\n/).forEach((line,i)=>{if(i)takeoverInput(c,{type:'key',key:'Enter'});const chars=[...line];for(let k=0;k<chars.length;k+=300)takeoverInput(c,{type:'text',text:chars.slice(k,k+300).join('')})})}
const takeoverKeys={Enter:'Enter',Backspace:'Backspace',Delete:'Delete',Tab:'Tab',Escape:'Back',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight',PageUp:'PageUp',PageDown:'PageDown',Home:'MoveHome',End:'MoveEnd'};
function attachTakeover(c){
 if(c.keys)return;
 const canvas=c.canvas,keys=document.createElement('textarea'),bar=document.createElement('div');
 keys.className='takeover-keys';keys.setAttribute('aria-label','向手机输入文字');keys.autocomplete='off';keys.spellcheck=false;c.screen.append(keys);c.keys=keys;
 bar.className='takeover-bar';const hint=document.createElement('p');hint.textContent='点击或拖动操作手机 · 右键返回 · 滚轮滑动 · 可直接打字';bar.append(hint);
 for(const[label,key]of[['返回','Back'],['主页','Home'],['多任务','AppSwitch']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{takeoverInput(c,{type:'key',key});keys.focus({preventScroll:true})};bar.append(b)}
 c.screen.after(bar);c.bar=bar;
 canvas.addEventListener('pointerdown',e=>{if(!c.takeover)return;e.preventDefault();keys.focus({preventScroll:true});
  if(e.button===2){takeoverInput(c,{type:'key',key:'Back'});return}if(e.button===1){takeoverInput(c,{type:'key',key:'Home'});return}if(e.button!==0)return;
  canvas.setPointerCapture(e.pointerId);c.pressed=e.pointerId;takeoverInput(c,{type:'touch',action:'down',...framePoint(c,e)})});
 canvas.addEventListener('pointermove',e=>{if(!c.takeover||c.pressed!==e.pointerId)return;
  if(!c.pendingMove)requestAnimationFrame(()=>{const p=c.pendingMove;c.pendingMove=null;if(p&&c.pressed!=null)takeoverInput(c,{type:'touch',action:'move',...p})});c.pendingMove=framePoint(c,e)});
 const release=e=>{if(c.pressed!==e.pointerId)return;c.pressed=null;const p=c.pendingMove;c.pendingMove=null;if(p)takeoverInput(c,{type:'touch',action:'move',...p});takeoverInput(c,{type:'touch',action:'up',...framePoint(c,e)})};
 canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
 canvas.addEventListener('contextmenu',e=>{if(c.takeover)e.preventDefault()});
 canvas.addEventListener('wheel',e=>{if(!c.takeover)return;e.preventDefault();const notch=e.deltaMode===1?3:e.deltaMode===2?0.1:100;
  c.wheel=c.wheel||{dx:0,dy:0};c.wheel.dx-=e.deltaX/notch;c.wheel.dy-=e.deltaY/notch;c.wheelPoint=framePoint(c,e);
  if(!c.wheelFrame)c.wheelFrame=requestAnimationFrame(()=>{c.wheelFrame=0;const w=c.wheel;c.wheel=null;if(w&&(Math.abs(w.dx)>0.01||Math.abs(w.dy)>0.01))takeoverInput(c,{type:'scroll',...c.wheelPoint,dx:w.dx,dy:w.dy})})},{passive:false});
 // Typed text goes through the hidden textarea so Chinese input methods compose normally.
 keys.addEventListener('keydown',e=>{if(!c.takeover||e.isComposing||e.keyCode===229)return;const ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&['a','c','x','z'].includes(e.key.toLowerCase())){e.preventDefault();takeoverInput(c,{type:'key',key:e.key.toLowerCase(),ctrl:true});return}
  if(ctrl)return;const key=takeoverKeys[e.key];if(!key)return;e.preventDefault();takeoverInput(c,{type:'key',key})});
 keys.addEventListener('input',e=>{if(!c.takeover||e.isComposing)return;const text=keys.value;keys.value='';if(text)sendTakeoverText(c,text)});
 keys.addEventListener('compositionend',()=>{const text=keys.value;keys.value='';if(c.takeover&&text)sendTakeoverText(c,text)});
 keys.addEventListener('paste',e=>{if(!c.takeover)return;e.preventDefault();const text=e.clipboardData?.getData('text/plain');if(text)sendTakeoverText(c,text)});
}
globalThis.openguiTakeover=(c,on)=>{if(on)attachTakeover(c);if(Boolean(c.takeover)===on)return;c.takeover=on;c.el.classList.toggle('takeover',on);
 if(!on){c.pressed=null;c.pendingMove=null;for(let i=takeoverQueue.length-1;i>=0;i--)if(takeoverQueue[i].c===c)takeoverQueue.splice(i,1);c.keys?.blur()}};
// Device action cursor, ported from CoreMate's canvas: the pointer glides to the target and presses with a
// ripple for taps, draws a trail for swipes and shows a label for keys and text. Display only.
let actionSeq=0;
const actionPct=v=>(Math.min(1,Math.max(0,Number(v)||0))*100)+'%';
function actionPlace(el,x,y){el.style.left=actionPct(x);el.style.top=actionPct(y)}
function actionLayer(c){let layer=c.actionLayer;if(!layer){layer=document.createElement('div');layer.className='device-action-layer';c.screen.append(layer);c.actionLayer=layer}
 layer.style.left=c.canvas.offsetLeft+'px';layer.style.top=c.canvas.offsetTop+'px';layer.style.width=c.canvas.clientWidth+'px';layer.style.height=c.canvas.clientHeight+'px';return layer}
function actionPointer(layer){let p=layer.querySelector('.device-pointer');if(p)return p;p=document.createElement('span');p.className='device-pointer';
 p.innerHTML='<svg class="device-pointer-arrow" width="20" height="24" viewBox="0 0 20 24" aria-hidden="true"><path d="M2 2 L2 19 L6.6 14.6 L9.6 21.4 L12.4 20.2 L9.4 13.6 L15.6 13.6 Z"/></svg>';layer.append(p);return p}
function actionMove(p,x,y,ms){const first=!p.classList.contains('is-placed');p.style.transitionDuration=(first?0:ms)+'ms';actionPlace(p,x,y);p.classList.add('is-placed')}
function actionPress(p,ms){p.classList.add('is-pressing');clearTimeout(p.pressTimer);p.pressTimer=setTimeout(()=>p.classList.remove('is-pressing'),Math.max(ms,160))}
function actionMarker(layer,el,ms){el.style.setProperty('--visible-ms',ms+'ms');layer.append(el);const all=layer.querySelectorAll('.device-action');for(let i=0;i<all.length-6;i++)all[i].remove();setTimeout(()=>el.remove(),ms)}
function showDeviceAction(deviceId,action){
 const c=cards.get(deviceId);if(!c||document.hidden||!action)return;const layer=actionLayer(c),p=actionPointer(layer);
 if(action.type==='tap'){actionMove(p,action.x,action.y,50);setTimeout(()=>{actionPress(p,160);const m=document.createElement('span');m.className='device-action is-tap';actionPlace(m,action.x,action.y);m.innerHTML='<span class="device-action-ring"></span>';actionMarker(layer,m,900)},50)}
 else if(action.type==='swipe'){const ms=Math.min(Math.max(Number(action.durationMs)||350,150),3000),id='device-arrow-'+(++actionSeq);actionMove(p,action.x1,action.y1,50);
  setTimeout(()=>{actionPress(p,ms);const m=document.createElement('span');m.className='device-action is-swipe';
   m.innerHTML='<svg class="device-action-trail" width="100%" height="100%" aria-hidden="true"><defs><marker id="'+id+'" markerHeight="5" markerWidth="5" orient="auto" refX="8" refY="5" viewBox="0 0 10 10"><path d="M0,0 L10,5 L0,10 z"/></marker></defs><line marker-end="url(#'+id+')" x1="'+actionPct(action.x1)+'" y1="'+actionPct(action.y1)+'" x2="'+actionPct(action.x2)+'" y2="'+actionPct(action.y2)+'"/></svg>';
   const dot=document.createElement('span');dot.className='device-action-dot';actionPlace(dot,action.x1,action.y1);m.append(dot);actionMarker(layer,m,ms+1600);actionMove(p,action.x2,action.y2,ms)},50)}
 else if(action.type==='key'&&action.label){const m=document.createElement('span');m.className='device-action is-key';m.textContent=action.label;actionMarker(layer,m,1600)}
}
// The start page's live view of a candidate device; its frames never count as the task's display.
let previewCard=null;
globalThis.openguiPreview={open(id,canvas,onFrame,onFail){this.close();if(!globalThis.VideoDecoder||ended)return false;previewCard={id,route:'preview-stream',preview:true,canvas,onFrame,onFail,message:{textContent:''},retry:{hidden:true},ws:null,decoder:null,config:[],waitKey:true,retries:0,frames:0,lastReceipt:0,pending:false,rendered:false,hadFrame:false};connect(previewCard);return true},close(){if(previewCard){const c=previewCard;previewCard=null;stop(c)}}};
function lagging(c){return c.receivedAt-c.decodedAt>3000}
async function receipt(c){if(c.preview||document.hidden||!c.rendered||!c.ws||c.pending||lagging(c)||Date.now()-c.lastReceipt<1000)return;c.pending=true;c.lastReceipt=Date.now();const ws=c.ws;try{const r=await fetch(base+'frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:c.connectionId,challenge:c.challenge,deviceId:c.id,visible:true})});if(r.ok){const m=await r.json();if(c.ws===ws)c.challenge=m.challenge}else{note(c,'画面校验未通过，正在重新连接…');ws.close()}}catch{}finally{c.pending=false}}
function card(d){const el=document.createElement('section');el.className='phone';const name=document.createElement('h2');name.textContent=d.name;const canvas=document.createElement('canvas'),message=document.createElement('p'),retry=document.createElement('button');canvas.width=540;canvas.height=1170;message.className='message';retry.className='retry';retry.textContent='重试';retry.hidden=true;const screen=document.createElement('div'),watermark=document.createElement('div');screen.className='screen';watermark.className='watermark';watermark.className='watermark placeholder';watermark.textContent='正在连接设备画面…';screen.append(canvas,watermark);el.append(name,screen,message,retry);document.querySelector('#wall').append(el);const c={id:d.id,os:d.os,el,screen,watermark,canvas,message,retry,ws:null,decoder:null,config:[],waitKey:true,retries:0,frames:0,lastReceipt:0,pending:false,rendered:false,hadFrame:false};retry.onclick=()=>{c.retries=0;connect(c)};cards.set(d.id,c);connect(c)}
async function status(){try{const r=await fetch(base+'status');if(!r.ok)throw Error('viewer_unavailable');const s=await r.json();renderBoard(s);if(s.state==='closed'){ended=true;presence.close();for(const c of cards.values())stop(c);document.querySelector('#task').textContent='画面已关闭';return}for(const d of s.devices)if(!cards.has(d.id))card(d);for(const c of cards.values()){if(c.ws&&c.rendered&&lagging(c)){c.canvas.classList.add('stale');note(c,'正在刷新画面…')}void receipt(c)}}catch{document.querySelector('#task').textContent='画面服务已退出，请在 WorkBuddy 对话中重新打开工作台'}}
document.addEventListener('visibilitychange',()=>{for(const c of cards.values()){if(document.hidden){stop(c);note(c,'页面隐藏，播放已暂停')}else{c.retries=0;connect(c)}}});addEventListener('pagehide',()=>{ended=true;presence.close();for(const c of cards.values())stop(c)});addEventListener('DOMContentLoaded',()=>void status());setInterval(()=>{if(!document.hidden&&!ended)void status()},1000);
</script>${workbenchScript()}</body></html>`
}
