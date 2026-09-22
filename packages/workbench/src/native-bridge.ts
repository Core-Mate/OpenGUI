/** Only an explicit native entrypoint attempts a host handshake. */
export const nativeBridgeScript = String.raw`
(() => {
 const nativeHost=new URLSearchParams(location.search).get('mcpApp');
 if(!['1','codex'].includes(nativeHost))return;
 const pending=new Map();let stopped=false,owner='';
 const notice=document.createElement('p');notice.setAttribute('role','status');notice.className='notice';notice.textContent='正在连接宿主工作台…';document.querySelector('main').prepend(notice);
 function request(method,params){return new Promise((resolve,reject)=>{
  if(stopped){reject(Error('宿主连接已关闭'));return}
  const id='opengui-'+crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('宿主连接超时，请从当前聊天重新打开工作台。'))},10000);
  pending.set(id,{resolve,reject,timer});window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*');
 })}
 function receive(event){if(event.source!==window.parent)return;const m=event.data;if(!m||m.jsonrpc!=='2.0'||typeof m.id!=='string'||!pending.has(m.id))return;
  const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('宿主连接失败，请从当前聊天重新打开。')):p.resolve(m.result);
 }
 window.addEventListener('message',receive);
 window.addEventListener('pagehide',()=>{stopped=true;window.removeEventListener('message',receive);for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('工作台已关闭'))}pending.clear()},{once:true});
 function mainOwner(value){try{if(typeof value!=='string'||!value.startsWith('workbuddy:'))return false;const identity=JSON.parse(value.slice(10));return Array.isArray(identity)&&identity.length===2&&typeof identity[0]==='string'&&identity[0].length>0&&identity[0].length<=256&&identity[1]===null}catch{return false}}
 // WorkBuddy's standard MCP App runtime currently returns null for this extension.
 // Its message service still dispatches to the artifact record's owning session.
 // The broker's hook-bound mailbox claim remains the execution authorization boundary.
 function sessionMatches(session,value){return mainOwner(value)&&(session===null||(typeof session==='string'&&value==='workbuddy:'+JSON.stringify([session,null])))}
 async function identityMatches(value){
  if(nativeHost!=='codex')return sessionMatches(await request('host/getWBCurrentSessionId',{}),value);
  if(typeof value!=='string'||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))return false;
  const result=await request('tools/call',{name:'opengui_open_workbench',arguments:{}});
  if(result?.isError)return false;
  try{const url=new URL(result?.structuredContent?.url);return url.origin===location.origin&&url.pathname===location.pathname&&!url.search&&!url.hash}catch{return false}
 }
 async function connect(){
  const initialized=await request('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'OpenGUI',version:'1'},appCapabilities:{}});
  window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');
  const response=await fetch(location.pathname+'state');if(!response.ok)throw Error('工作台状态不可用');const state=await response.json();
  if(!await identityMatches(state.workbenchOwner))throw Error('工作台与宿主聊天不匹配，请从原聊天重新打开。');
  if(!initialized?.hostCapabilities?.message)throw Error('当前宿主没有开放工作台消息入口。');
  owner=state.workbenchOwner;
  notice.textContent='已连接宿主消息通道';notice.dataset.hostBridge='connected';
 }
 const ready=connect().then(()=>true,error=>{notice.textContent=error.message;notice.dataset.hostBridge='unavailable';return false});
 window.openguiHostBridge={async continueTask(task){
  try{
   if(!await ready)throw Error('宿主连接不可用。任务已保留，请从原聊天接手。');
   if(!task||typeof task.id!=='string'||! /^[a-f0-9-]{36}$/.test(task.id)||!Number.isSafeInteger(task.sequence)||task.sequence<0||task.owner!==owner)throw Error('任务与当前聊天不匹配，未发送执行请求。');
    if(!await identityMatches(owner))throw Error('当前聊天已切换。请回到原聊天接手此任务。');
   const key='opengui-host-wake:'+owner+':'+task.id+':'+task.sequence;
   if(sessionStorage.getItem(key)){notice.textContent='已尝试通知宿主，请查看任务进度；不会重复发送。';return false}
   // Persist before dispatch: an RPC timeout cannot prove that the host did not receive it.
   sessionStorage.setItem(key,'attempted');
   try{
    const delivered=await request('ui/message',{role:'user',content:[{type:'text',text:'Continue the accepted OpenGUI phone task '+task.id+'. Do not submit a duplicate task. Use opengui_manage_task next/decide with this taskId and your current host model. Inspect each returned image and follow its coordinate and completion contracts. Continue until terminal or waiting for user help. Verify the result with status. Keep the existing native workbench open; it already displays progress and evidence. Do not call present_files or open another workbench/preview tab, including in the final response. Do not substitute shell/ADB or configure another model.'}]});
    if(delivered?.isError)throw Error('Host did not accept the message');
   }catch{throw Error('任务已保留，宿主是否收到通知尚不确定。请在原聊天查看任务 '+task.id+'；不会自动重发。')}
   notice.textContent='已通知宿主，等待接手；执行进度以任务状态为准。';return true;
  }catch(error){notice.textContent=error.message;return false}
 }};
})();
`
