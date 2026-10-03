/** Native entrypoint for the shared workbench. */
export const CODEX_WORKBENCH_RESOURCE_URI = 'ui://opengui/workbench.html'
export const CODEX_WORKBENCH_RESOURCE_MIME = 'text/html;profile=mcp-app'
export const codexWorkbenchResource = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>OpenGUI</title><p id="status">正在打开手机工作台…</p><script>
const initId='opengui-init-'+crypto.randomUUID();
let initialized=false,pendingUrl='',navigated=false;
function open(){if(!initialized||!pendingUrl||navigated)return;navigated=true;window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height:640}},'*');location.replace(pendingUrl)}
window.addEventListener('message',event=>{
 if(event.source!==window.parent)return;
 const m=event.data;if(!m||m.jsonrpc!=='2.0')return;
 if(m.id===initId){if(m.error){document.getElementById('status').textContent='宿主工作台连接失败，请重新打开。';return}initialized=true;window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');open()}
 if(m.method==='ui/notifications/tool-result'){
  try{const u=new URL(m.params?.structuredContent?.url),host=new URL(location.origin);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.pathname!=='/'||!u.searchParams.get('owner')||host.protocol!=='http:'||host.hostname!=='127.0.0.1'||!host.port)throw Error();u.searchParams.set('mcpApp','codex');u.searchParams.set('hostOrigin',host.origin);u.hash='';pendingUrl=u.href;open()}
  catch{document.getElementById('status').textContent='工作台地址不可用，请从当前聊天重新打开。'}
 }
});
window.parent.postMessage({jsonrpc:'2.0',id:initId,method:'ui/initialize',params:{protocolVersion:'2026-01-26',appInfo:{name:'OpenGUI',version:'1'},appCapabilities:{}}},'*');
</script></html>`
