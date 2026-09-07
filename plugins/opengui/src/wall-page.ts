/** Render only inert text from device metadata; never interpolate a phone's UI as HTML. */
export function wallPage(sessionId: string): string {
  const encoded = JSON.stringify(sessionId).replaceAll('<', '\\u003c')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenGUI Device Wall</title><style>
:root{color-scheme:dark;background:#0b1110;color:#e6efeb;font-family:ui-sans-serif,system-ui,sans-serif}
body{margin:0;padding:24px}header{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:20px}
h1{font-size:22px;margin:0}.state,.detail{color:#9eaaa5;font-size:13px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.card{background:#141e1b;border:1px solid #2a3b34;border-radius:16px;overflow:hidden}.meta{padding:14px}.name{font-weight:650}.detail{margin-top:5px}
img{display:block;width:100%;max-height:70vh;aspect-ratio:9/16;object-fit:contain;background:#060a08}
footer{color:#9eaaa5;font-size:12px;margin-top:20px}</style></head>
<body><header><h1>OpenGUI <span class="state">Device wall</span></h1><div class="state" id="state" role="status">Connecting…</div></header>
<main class="grid" id="grid"></main><footer>Read-only · hidden pages pause · monitoring does not renew the session lease</footer>
<script>
const sessionId=${encoded};
const base=location.pathname.endsWith('/')?location.pathname.slice(0,-1):location.pathname;
const grid=document.getElementById('grid'),state=document.getElementById('state'),cards=new Map();
let stopped=false,busy=false,timer,active;
async function refresh(){
 if(stopped||document.hidden||busy)return;
 busy=true;active=new AbortController();
 try{
  const response=await fetch(base+'/api/status?sessionId='+encodeURIComponent(sessionId),{cache:'no-store',signal:active.signal});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'Status unavailable');
  state.textContent=value.state+' · '+value.mode+' · '+value.devices.length+' device(s)';
  if(value.state!=='active'){stopped=true;return;}
  await Promise.all(value.devices.map(async device=>{
   let card=cards.get(device.id);
   if(!card){
    const node=document.createElement('section');node.className='card';
    const meta=document.createElement('div');meta.className='meta';
    const name=document.createElement('div');name.className='name';name.textContent=device.name;
    const detail=document.createElement('div');detail.className='detail';
    const image=document.createElement('img');image.alt=device.name+' screenshot';
    meta.append(name,detail);node.append(meta,image);grid.append(node);card={node,detail,image,url:null};cards.set(device.id,card);
   }
   if(!device.connected||!device.authorized){card.detail.textContent='Disconnected or unauthorized';return;}
   try{
    const response=await fetch(base+'/api/preview?sessionId='+encodeURIComponent(sessionId)+'&deviceId='+encodeURIComponent(device.id),{cache:'no-store',signal:active.signal});
    if(!response.ok)throw new Error('Preview unavailable');
    const url=URL.createObjectURL(await response.blob()),previous=card.url;
    card.image.src=url;card.url=url;if(previous)URL.revokeObjectURL(previous);
    await card.image.decode();
    card.detail.textContent=device.operationCount+' operations · last frame '+new Date().toLocaleTimeString();
   }catch(error){if(!active.signal.aborted)card.detail.textContent=String(error);}
  }));
 }catch(error){if(!active.signal.aborted)state.textContent=String(error);}
 finally{busy=false;if(!stopped&&!document.hidden)timer=setTimeout(refresh,1500);}
}
document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(document.hidden){if(active)active.abort();}else if(!busy){refresh();}});
window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);if(active)active.abort();for(const card of cards.values())if(card.url)URL.revokeObjectURL(card.url);});
refresh();
</script></body></html>`
}
