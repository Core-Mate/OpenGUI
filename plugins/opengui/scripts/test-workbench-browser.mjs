import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { PhoneRuntime } from '../.artifacts/workbench/runtime.js'
import { HostExecutor } from '../.artifacts/workbench/hostExecutor.js'
import { Workbench } from '../.artifacts/workbench/workbench.js'
const exec = promisify(execFile), root = await mkdtemp(join(tmpdir(), 'opengui-workbench-browser-'))
const session = 'workbench-' + randomUUID(), timers = new Set()
let embeddedBrowser, testPage, testFrame
const browser = async (...args) => {
  if (!testPage) {
    if (args[0] === 'click') await exec('agent-browser', ['--session', session, 'eval', `document.querySelector(${JSON.stringify(args[1])})?.scrollIntoView({block:"center"})`], { timeout: 30000 })
    return (await exec('agent-browser', ['--session', session, ...args], { timeout: 30000 })).stdout
  }
  // This fixture owns its headless browser. Use a real Frame for iframe waits;
  // agent-browser's wait/eval commands address the top-level page in this version.
  const [command, value, extra] = args
  if(command==='frame') {testFrame=value==='main'?testPage.mainFrame():await (await testPage.$(value)).contentFrame();return ''}
  if(command==='snapshot') return testFrame.evaluate(()=>document.body.innerText)
  if(command==='wait') {await testFrame.waitForFunction(value==='--text'?'document.body.innerText.includes('+JSON.stringify(extra)+')':extra,{timeout:25000});return ''}
  if(command==='fill') {await testFrame.type(value,extra);return ''}
  if(command==='click') {await testFrame.click(value);return ''}
  if(command==='scrollintoview') {await testFrame.$eval(value,el=>el.scrollIntoView({block:'center'}));return ''}
  if(command==='eval') return JSON.stringify(await testFrame.evaluate(value))
  if(command==='screenshot') {await testPage.screenshot({path:value,fullPage:true});return ''}
  if(command==='close') {await embeddedBrowser.close();return ''}
  throw Error('Unsupported embedded fixture command: '+command)
}
let runtime, web, embedServer, steered = false, frames = 0, probeFails = false
try {
  const video = join(root, 'fixture.h264')
  await exec('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=blue:s=160x320:r=30','-frames:v','1','-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-pix_fmt','yuv420p','-f','h264',video])
  const jpegPath=join(root,'fixture.jpg')
  await exec('ffmpeg',['-v','error','-i',video,'-frames:v','1',jpegPath])
  const jpeg=await readFile(jpegPath)
  const bytes = await readFile(video), starts = []
  for (let i=0;i+4<bytes.length;i++) if(bytes[i]===0&&bytes[i+1]===0&&(bytes[i+2]===1||bytes[i+2]===0&&bytes[i+3]===1)) { const n=bytes[i+2]===1?3:4;starts.push({i,type:bytes[i+n]&31});i+=n-1 }
  const config=Buffer.concat(starts.flatMap((n,i)=>[7,8].includes(n.type)?[bytes.subarray(n.i,starts[i+1]?.i??bytes.length)]:[]))
  const device = {id:'fixture',serial:'synthetic-only',name:'测试手机',authorized:true,connected:true,state:'device'}
  let fixturePhones=[device]
  const hardware = {
    videoStreams: { async prepare(){},async dispose(){for(const timer of timers)clearInterval(timer)},async subscribe(_device,sink){
      sink.sendText(JSON.stringify({type:'session',width:160,height:320}))
      const header=Buffer.alloc(9+config.length);header[0]=1;config.copy(header,9);sink.sendBinary(header)
      const timer=setInterval(()=>{const packet=Buffer.alloc(9+bytes.length);packet[0]=2;packet.writeBigUInt64BE(BigInt(Date.now())*1000n,1);bytes.copy(packet,9);sink.sendBinary(packet)},33)
      timers.add(timer);return()=>{clearInterval(timer);timers.delete(timer)}
    }},
    listDevices:async()=>fixturePhones,resolveDevices:async ids=>fixturePhones.filter(d=>!ids||ids.includes(d.id)),assignTarget(){},
    observe:async()=>({observationId:'frame-'+ ++frames,serial:device.serial,width:160,height:320,image:{data:jpeg,mediaType:'image/jpeg',width:160,height:320,bytes:jpeg.length,name:'fixture.jpg'}}),
    act:async()=>{throw Error('No physical actions in browser fixture')},async releaseDevice(){},async dispose(){},
  }
  const executor={async plan(p){const goal=p.goal.split('\n')[0];return {kind:'branches',branches:goal==='排队手机测试'?p.devices.flatMap(d=>[0,1].map(n=>({goal:goal+' '+d.id+' '+n,successCriteria:'蓝色画面可见',eligibleDeviceIds:[d.id]}))):goal==='双手机测试'?p.devices.map(d=>({goal:goal+' '+d.id,successCriteria:'蓝色画面可见',eligibleDeviceIds:[d.id]})):[{goal,successCriteria:goal,eligibleDeviceIds:['fixture']}]}} ,async probe(){if(probeFails)throw Error('fixture capability failure')},async run(e){
    let finish;const continued=new Promise(resolve=>finish=resolve)
    e.bindSteer(text=>{steered=text==='现在完成';finish()})
    await e.observe()
    if(e.task.goal==='登录手机测试')await e.waitForUser('请在原手机完成登录，然后点击已处理继续。');else await Promise.race([continued,new Promise((_,reject)=>{if(e.signal.aborted)reject(e.signal.reason);else e.signal.addEventListener('abort',()=>reject(e.signal.reason),{once:true})})])
    const frame=await e.observe();await e.finish('已核验测试画面',[{criterion:e.task.successCriteria,status:'passed',evidenceId:frame.observationId}],'completed')
  }}
  const hostExecutor=process.env.OPENGUI_TEST_HOST_MODE ? new HostExecutor() : null
  const embedded=!!process.env.OPENGUI_TEST_EMBEDDED_HOST
  runtime=new PhoneRuntime({root,host:embedded?'dsh':'codex',hardware,executor:hostExecutor||executor,leaseRoot:join(root,'leases'),credentials:{get:async()=> 'fixture-only',set:async()=>{}}})
  await runtime.initialize();runtime.profiles.set('older',{id:'older',protocol:'openai-completions',baseUrl:'http://127.0.0.1',model:'旧模型',credentialRef:'fixture'});runtime.profiles.set('fixture',{id:'fixture',protocol:'openai-completions',baseUrl:'http://127.0.0.1',model:'测试模型',credentialRef:'fixture'})
  web=new Workbench(runtime);const url=await web.open(hostExecutor ? 'fixture-host' : undefined)
  if(hostExecutor) {
    runtime.profiles.clear()
    await browser('open',url);await browser('snapshot','-i')
    await browser('wait','--fn','document.querySelector("#homeDevices").textContent.includes("测试手机")')
    await browser('wait','--fn','!!document.querySelector("#homeDevices iframe")')
    assert.match(await browser('eval','/查看画面|放大查看|刷新手机/.test(document.querySelector("#homePage").textContent)'),/false/)
    assert.match(await browser('eval','/刷新手机|放大查看/.test(document.querySelector("#devicesPage").textContent)'),/false/)
    assert.match(await browser('eval','document.querySelector("#homeDevices h3 a")?.getAttribute("href")'),/device\/fixture/)
    assert.match(await browser('eval','document.querySelector("#submit").textContent'),/开始任务/)
    await browser('open',url+'#settings');await browser('snapshot','-i')
    await browser('wait','--fn','document.querySelector("#byokSettings").hidden&&!document.querySelector("#hostModeNotice").hidden')
    await browser('set','viewport','375','844')
    await browser('screenshot',new URL('../.artifacts/workbench/host-settings-narrow.png',import.meta.url).pathname,'--full')
    const denied=await fetch(new URL('model'+new URL(url).search,url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});assert.equal(denied.status,400)
    if(embedded) {
      embedServer=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<iframe id="workbench" src="${url}#home" style="width:100%;height:800px;border:0"></iframe><script>window.accepted=[];window.continued=[];window.routes=[];window.addEventListener('message',e=>{if(e.origin===${JSON.stringify(new URL(url).origin)}&&e.source===document.querySelector('iframe').contentWindow&&e.data.type==='opengui-task-accepted')accepted.push(e.data.taskId);if(e.origin===${JSON.stringify(new URL(url).origin)}&&e.source===document.querySelector('iframe').contentWindow&&e.data.type==='opengui-task-continued')continued.push(e.data);if(e.origin===${JSON.stringify(new URL(url).origin)}&&e.source===document.querySelector('iframe').contentWindow&&e.data.type==='opengui-workbench-route')routes.push(e.data.route)})</script>`)})
      await new Promise(resolve=>embedServer.listen(0,'127.0.0.1',resolve))
      const parentOrigin='http://127.0.0.1:'+embedServer.address().port
      web.allowEmbedding(parentOrigin)
      await browser('close')
      const puppeteer=createRequire(new URL('../../../deepseek-harness-plugin/package.json',import.meta.url))('puppeteer-core')
      embeddedBrowser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
      testPage=await embeddedBrowser.newPage();await testPage.setViewport({width:375,height:844})
      await testPage.goto(parentOrigin);await browser('frame','#workbench')
      await browser('wait','--text','测试手机')
    } else await browser('open',url+'#home')
    await browser('snapshot','-i')
    const longGoal='宿主核对蓝色画面。'+ '只读观察，保留完整任务要求，不修改手机设置。'.repeat(8)
    await browser('fill','#goal',longGoal);await browser('scrollintoview','#submit');await browser('click','#submit');await browser('snapshot','-i')
    await browser('wait','--fn','location.hash.startsWith("#task/")');assert.match(await browser('eval','!document.querySelector("#homePage").hidden&&!document.querySelector("#taskPage").hidden&&!!document.querySelector("#queueTasks .workspace-task-card")&&!!document.querySelector("#taskForm")'),/true/)
    for(let n=0;n<50&&!hostExecutor.next('fixture-host');n++)await new Promise(r=>setTimeout(r,100))
    let request=hostExecutor.next('fixture-host');assert.equal(request.kind,'plan')
    assert.equal(runtime.goals.get(request.taskId).owner,'fixture-host')
    assert.equal(hostExecutor.next('different-host',request.taskId),undefined)
    await browser('wait','--fn','document.querySelector("#state").textContent.includes("等待宿主规划")')
    assert.match(await browser('eval','document.querySelector("#goalView").textContent'),/宿主核对蓝色画面/)
    assert.match(await browser('eval','document.querySelector("#goalDetails").hidden'),/false/)
    assert.match(await browser('eval','document.querySelector("#fullGoal").textContent.length'),new RegExp(String(longGoal.length)))
    await browser('click','#goalDetails summary')
    assert.match(await browser('eval','document.querySelector("#goalDetails").open'),/true/)
    await browser('click','#goalDetails summary')
    assert.match(await browser('eval','document.querySelector("#taskNotice").textContent'),/正在规划任务/)
    assert.doesNotMatch(await browser('eval','document.querySelector("#taskNotice").textContent'),/首帧/)
    await browser('screenshot',new URL('../.artifacts/workbench/host-planning-narrow.png',import.meta.url).pathname,'--full')
    hostExecutor.respond('fixture-host',request.id,{kind:'clarification',question:'请确认需要核对的画面颜色。'})
    await browser('wait','--fn','document.querySelector("#state").textContent.includes("等待补充信息")')
    assert.match(await browser('eval','document.querySelector("#taskNotice").textContent'),/请补充任务信息/)
    assert.match(await browser('eval','document.querySelector("#reuse").hidden'),/true/)
    await browser('click','#historyToggle');await browser('click','[data-filter="active"]')
    assert.match(await browser('eval','document.querySelector("#history").textContent'),/等待补充信息/)
    await browser('click','[data-filter="done"]')
    assert.doesNotMatch(await browser('eval','document.querySelector("#history").textContent'),/宿主核对蓝色画面/)
    await browser('click','[data-filter="active"]');await browser('click','#history .task-title')
    await browser('screenshot',new URL('../.artifacts/workbench/host-clarification-narrow.png',import.meta.url).pathname,'--full')
    await browser('fill','#instruction','核对蓝色画面');await browser('scrollintoview','#steer');await browser('click','#steer')
    for(let n=0;n<50&&!hostExecutor.next('fixture-host');n++)await new Promise(r=>setTimeout(r,100))
    request=hostExecutor.next('fixture-host');assert.equal(request.kind,'plan')
    assert.equal(runtime.goals.list().length,1)
    assert.match(request.context.clarification,/核对蓝色画面/)
    hostExecutor.respond('fixture-host',request.id,{kind:'branches',branches:[{goal:'核对蓝色画面',successCriteria:'蓝色画面可见',eligibleDeviceIds:['fixture']}]})
    await browser('wait','--text','测试手机 · 正在执行');assert.match(await browser('eval','!document.querySelector("#homePage").hidden&&!document.querySelector("#taskPage").hidden&&!!document.querySelector("#queueTasks .workspace-task-card[aria-current=true]")'),/true/)
    assert.match(await browser('eval','document.querySelector("#branchCards iframe").getBoundingClientRect().height>=490'),/true/)
    let decision=hostExecutor.next('fixture-host');assert.equal(decision.kind,'step')
    hostExecutor.respond('fixture-host',decision.id,{operation:'observe'})
    for(let n=0;n<50&&!hostExecutor.next('fixture-host')?.context.image;n++)await new Promise(r=>setTimeout(r,100))
    decision=hostExecutor.next('fixture-host');assert(decision.context.image)
    // A later reply must wake the same task again after a host turn waits for help.
    hostExecutor.respond('fixture-host',decision.id,{operation:'help',reason:'请确认画面已准备好'})
    await browser('wait','--fn','document.querySelector("#steer").textContent.includes("已处理，继续")')
    await browser('scrollintoview','#steer');await browser('click','#steer')
    for(let n=0;n<50&&!hostExecutor.next('fixture-host');n++)await new Promise(r=>setTimeout(r,100))
    decision=hostExecutor.next('fixture-host');assert.equal(decision.kind,'step')
    hostExecutor.respond('fixture-host',decision.id,{operation:'observe'})
    for(let n=0;n<50&&!hostExecutor.next('fixture-host')?.context.image;n++)await new Promise(r=>setTimeout(r,100))
    decision=hostExecutor.next('fixture-host');assert(decision.context.image)
    hostExecutor.respond('fixture-host',decision.id,{operation:'finish',outcome:'completed',summary:'宿主已核对蓝色画面',checks:[{criterion:'蓝色画面可见',status:'passed',evidenceId:decision.context.observationId}]})
    await browser('wait','--fn','document.querySelector("#state").textContent.includes("已完成")')
    assert.equal(runtime.goals.list()[0].phase,'completed')
    await browser('wait','--fn','!document.querySelector("#evidenceImage").hidden&&document.querySelector("#evidenceImage").naturalWidth===160')
    const proofTask=runtime.list().find(t=>t.parentId===runtime.goals.list()[0].id)
    assert(proofTask)
    assert.match(await browser('eval','document.querySelector("#evidenceImage").src'),new RegExp('/evidence/'+proofTask.id+'/'))
    assert.match(await browser('eval','document.querySelector("#evidenceSelect").textContent'),/核验引用/)
    assert.match(await browser('eval','document.querySelector("#evidenceSelect").textContent'),/测试手机/)
    assert((await browser('eval','document.querySelector("#evidenceImage").src')).includes(proofTask.evidence.at(-1).file))
    await browser('scrollintoview','#evidenceImage')
    await browser('screenshot',new URL('../.artifacts/workbench/parent-evidence-narrow.png',import.meta.url).pathname,'--full')

    assert.equal(runtime.profiles.size,0)
    assert.match(await browser('eval','document.documentElement.scrollWidth<=innerWidth'),/true/)
    await browser('screenshot',new URL('../.artifacts/workbench/host-task-narrow.png',import.meta.url).pathname,'--full')
    assert.match(await browser('eval','[...document.querySelectorAll("#branchCards iframe")].every(f=>f.hidden&&!f.hasAttribute("src"))'),/true/)
    if(embedded) {
      await testPage.setViewport({width:1280,height:900})
      await browser('eval','window.scrollTo(0,0)')
      assert.match(await browser('eval','document.documentElement.scrollWidth<=innerWidth'),/true/)
      await browser('screenshot',new URL('../.artifacts/workbench/host-task-desktop.png',import.meta.url).pathname,'--full')
      await browser('frame','main')
      const received=await browser('eval','JSON.stringify(window.accepted)')
      assert(received.includes(runtime.goals.list()[0].id))
      assert.match(await browser('eval','window.accepted.length'),/1/)
      const continued=await testPage.evaluate(()=>window.continued)
      assert.equal(continued.length,2)
      assert.equal(continued[0].taskId,runtime.goals.list()[0].id)
      assert(Number.isSafeInteger(continued[0].sequence)&&continued[0].sequence>0)
      assert.equal(continued[1].taskId,continued[0].taskId)
      assert(continued[1].sequence>continued[0].sequence)
      const routes=await testPage.evaluate(()=>window.routes)
      assert(routes.includes('home'))
      assert.equal(routes.at(-1),'task/'+runtime.goals.list()[0].id)
    }
    if(embedded)await browser('frame','#workbench')
    const busyFeedback=JSON.parse(await browser('eval',`(()=>{
      const raw='device_busy: another OpenGUI task owns this phone; stop its task first.';
      const original=tasks;
      const child={...tasks.find(t=>t.parentId),id:'busy-child',parentId:'busy-parent',phase:'blocked',error:raw,summary:raw};
      const parent={...tasks.find(t=>t.group),id:'busy-parent',phase:'blocked',summary:'old summary'};
      tasks=[parent,child,{...child,id:'other-child',error:undefined,summary:'另一台手机已完成'}];
      const result={child:displaySummary(child),parent:displaySummary(parent),raw:child.error,other:displayError('transport_error: disconnected'),ordinary:displaySummary({summary:'未修改的结果'})};
      tasks=original;
      return result;
    })()`))
    assert.match(busyFeedback.child,/手机正被其他任务占用/)
    assert.match(busyFeedback.parent,/确认停止后再重试/)
    assert.match(busyFeedback.parent,/另一台手机已完成/)
    assert.match(busyFeedback.raw,/^device_busy: another OpenGUI/)
    assert.equal(busyFeedback.other,'transport_error: disconnected')
    assert.equal(busyFeedback.ordinary,'未修改的结果')
    console.log(JSON.stringify({result:'PASS',hostDriven:true,modelConfigurationDisabled:true,homepageClaim:true,embeddedTaskHandoff:embedded,visibleFirstFrame:true,hostScreenshotDecision:true,terminalEvidence:true,physicalPhone:false,realHostModel:false}))
  } else {
  await browser('open',url);await browser('snapshot','-i')
  await browser('wait','--fn','document.querySelector("#homeDevices").textContent.includes("测试手机")')
  await browser('wait','--fn','!!document.querySelector("#homeDevices iframe")')
  assert.match(await browser('eval','document.querySelectorAll("header nav").length===1 && document.querySelectorAll("header nav a[aria-current=page]").length===1 && document.querySelector("#new").getAttribute("aria-current")==="page" && !document.querySelector("main").innerText.includes("工作台 / 首页")'),/true/)
  assert.match(await browser('eval','/查看画面|放大查看|刷新手机/.test(document.querySelector("#homePage").textContent)'),/false/)
  assert.match(await browser('eval','/刷新手机|放大查看/.test(document.querySelector("#devicesPage").textContent)'),/false/)
  runtime.profiles.clear()
  await browser('wait','--fn','!document.querySelector("#configureModel").hidden && document.querySelector("#submit").hidden')
  assert.match(await browser('eval','document.querySelector("#goal").value.length===0'),/true/)
  await browser('click','#configureModel')
  await browser('wait','--fn','!document.querySelector("#settingsPage").hidden')
  assert.match(await browser('eval','document.querySelector("#error").textContent.length===0'),/true/)
  runtime.profiles.set('older',{id:'older',protocol:'openai-completions',baseUrl:'http://127.0.0.1',model:'旧模型',credentialRef:'fixture'})
  runtime.profiles.set('fixture',{id:'fixture',protocol:'openai-completions',baseUrl:'http://127.0.0.1',model:'测试模型',credentialRef:'fixture'})
  await browser('open',url)
  await browser('wait','--fn','!document.querySelector("#submit").hidden')
  await browser('screenshot',new URL('../.artifacts/workbench/home-desktop.png',import.meta.url).pathname,'--full')
  assert.match(await browser('eval','document.querySelectorAll("#taskForm textarea").length===1&&!document.querySelector("#profile")&&!document.querySelector("#device")'),/true/)
  await browser('fill','#goal','切换页面后保留的草稿')
  await browser('wait','--fn','fetch(location.pathname+"state").then(r=>r.json()).then(s=>s.draft==="切换页面后保留的草稿")')
  await browser('open','about:blank');await browser('open',url);await browser('snapshot','-i')
  await browser('wait','--fn','document.querySelector("#goal").value==="切换页面后保留的草稿"')
  for(const name of ['devices','tasks','settings','guide']){
    await browser('open',url+'#'+name);await browser('snapshot','-i')
    await browser('wait','--fn',`!document.querySelector('#${name}Page').hidden`)
    const activeId={devices:'devicesToggle',tasks:'historyToggle',settings:'settingsToggle',guide:'devicesToggle'}[name]
    assert.match(await browser('eval',`document.querySelectorAll('header nav a[aria-current="page"]').length===1 && document.querySelector('#${activeId}').getAttribute('aria-current')==='page'`),/true/)
    await browser('screenshot',new URL('../.artifacts/workbench/'+name+'-desktop.png',import.meta.url).pathname,'--full')
  }
  await browser('open',url+'#home');await browser('snapshot','-i')
  await browser('set','viewport','375','844');await browser('screenshot',new URL('../.artifacts/workbench/home-narrow.png',import.meta.url).pathname,'--full')
  assert.match(await browser('eval','document.documentElement.scrollWidth<=innerWidth'),/true/)
  assert.match(await browser('eval','document.querySelector("#goal").value'),/切换页面后保留的草稿/)
  await browser('set','viewport','1280','900')
  await browser('fill','#goal','显示测试页面');await browser('scrollintoview','#submit');await browser('click','#submit');await browser('snapshot','-i')
  await browser('wait','--text','测试手机 · 正在执行');assert.match(await browser('eval','!document.querySelector("#homePage").hidden&&!document.querySelector("#taskPage").hidden&&!!document.querySelector("#queueTasks .workspace-task-card[aria-current=true]")'),/true/)
  const task=runtime.list()[0];assert.equal(task.phase,'running');assert.equal(task.modelProfile.id,'fixture');assert.equal(task.successCriteria,task.goal);assert(frames>0)
  await browser('eval','window.scrollTo(0,0)');await browser('screenshot',new URL('../.artifacts/workbench/running-desktop.png',import.meta.url).pathname,'--full')
  await browser('set','viewport','375','844');await browser('scrollintoview','#stop');await browser('snapshot','-i')
  assert.match(await browser('eval','(()=>{const b=document.querySelector("#stop").getBoundingClientRect(),h=document.querySelector("header").getBoundingClientRect();return b.top>=h.bottom-1&&b.bottom<innerHeight})()'),/true/)
  await browser('screenshot',new URL('../.artifacts/workbench/running-narrow.png',import.meta.url).pathname)
  await browser('set','viewport','1280','900')
  // Browser/host-facing UI disappears; the accepted task must continue independently.
  await browser('open','about:blank');assert.equal(runtime.get(task.id).phase,'running')
  await browser('open',url+'#'+task.id);await browser('snapshot','-i')
  await browser('fill','#instruction','现在完成');await browser('click','#steer');await browser('snapshot','-i');await browser('wait','--fn','document.querySelector("#state").textContent.includes("已完成")')
  assert(steered);assert.equal(runtime.get(task.id).phase,'completed');await browser('wait','--fn','document.querySelector("#evidenceImage").naturalWidth===160');assert.equal(runtime.get(task.id).checks[0].status,'passed')
  await browser('eval','window.scrollTo(0,0)');await browser('screenshot',new URL('../.artifacts/workbench/desktop.png',import.meta.url).pathname,'--full');await browser('set','viewport','375','844');await browser('eval','window.scrollTo(0,0)');await browser('screenshot',new URL('../.artifacts/workbench/narrow.png',import.meta.url).pathname,'--full')
  assert.match(await browser('eval','document.documentElement.scrollWidth<=innerWidth'),/true/)
  await browser('eval','window.__exportBlob=null;window.__createObjectURL=URL.createObjectURL;URL.createObjectURL=function(blob){window.__exportBlob=blob;return window.__createObjectURL(blob)}')
  await browser('scrollintoview','#export');await browser('click','#export');await browser('snapshot','-i')
  assert.match(await browser('eval','(async()=>{const text=await window.__exportBlob.text(),r=JSON.parse(text);return r.phase==="completed"&&r.evidence.length>0&&!/credentialRef|fixture-only|viewerUrl/.test(text)})()'),/true/)
  await browser('click','#reuse');await browser('snapshot','-i')
  assert.match(await browser('eval','document.querySelector("#goal").value==="显示测试页面"'),/true/)
  assert.equal(runtime.list().length,1)
  await browser('click','#historyToggle');await browser('snapshot','-i');await browser('eval','document.querySelector("#new").scrollIntoView({block:"center"})');await browser('click','#new');await browser('wait','--fn','!document.querySelector("#homePage").hidden');await browser('snapshot','-i');await browser('fill','#goal','等待停止');await browser('wait','--fn','document.querySelector("#goal").value==="等待停止"');await browser('scrollintoview','#submit');await browser('click','#submit');await browser('snapshot','-i');await browser('wait','--text','正在执行')
  await browser('scrollintoview','#stop');await browser('wait','--fn','!document.querySelector("#stop").disabled');await browser('click','#stop');await browser('snapshot','-i');await browser('wait','--text','已停止')
  assert.equal(runtime.list()[0].phase,'cancelled')
  await browser('click','#historyToggle');await browser('snapshot','-i')
  assert.match(await browser('eval','document.querySelectorAll("#history .task-row").length'),/2/)
  await browser('scrollintoview','[data-filter="active"]');await browser('click','[data-filter="active"]');await browser('snapshot','-i')
  assert.match(await browser('eval','document.querySelectorAll("#history .task-row").length'),/0/)
  await browser('scrollintoview','[data-filter="done"]');await browser('click','[data-filter="done"]');await browser('snapshot','-i')
  assert.match(await browser('eval','document.querySelectorAll("#history .task-row").length'),/2/)
  await browser('click','#settingsToggle');await browser('snapshot','-i')
  await browser('fill','#endpoint','http://127.0.0.1:1234/v1');await browser('fill','#model','fixture-visual');await browser('fill','#secret','fixture-secret-not-a-real-key')
  probeFails=true
  await browser('scrollintoview','#modelForm button');await browser('click','#modelForm button');await browser('snapshot','-i');await browser('wait','--text','连接检查失败，配置未保存')
  assert.equal(runtime.profiles.size,2)
  probeFails=false
  await browser('click','#modelForm button');await browser('snapshot','-i');await browser('wait','--text','连接已验证，凭据已保存到钥匙串')
  assert.equal(runtime.profiles.size,3);assert.match(await browser('eval','document.querySelector("#secret").value===""'),/true/)
  fixturePhones=[device,{...device,id:'second',serial:'synthetic-second',name:'第二手机'}]
  await browser('open',url+'#home');await browser('snapshot','-i');await browser('wait','--fn','document.querySelector("#homeDevices").textContent.includes("第二手机")');await browser('fill','#goal','双手机测试');await browser('scrollintoview','#submit');await browser('click','#submit');await browser('snapshot','-i')
  await browser('wait','--fn','document.querySelectorAll("#branchCards iframe").length===2&&[...document.querySelectorAll(".branch-status")].every(e=>e.textContent.includes("正在执行"))')
  const multi=runtime.goals.list()[0];assert.equal(multi.group.children.length,2)
  await browser('set','viewport','1280','900');await browser('eval','window.scrollTo(0,0)');await browser('screenshot',new URL('../.artifacts/workbench/multi-desktop.png',import.meta.url).pathname,'--full')
  await browser('set','viewport','375','844');assert.match(await browser('eval','document.documentElement.scrollWidth<=innerWidth'),/true/)
  await browser('screenshot',new URL('../.artifacts/workbench/multi-narrow.png',import.meta.url).pathname,'--full')
  await browser('fill','#instruction','现在完成');await browser('scrollintoview','#steer');await browser('click','#steer');await browser('snapshot','-i');await browser('wait','--fn','document.querySelector("#state").textContent.includes("已完成")')
  assert.equal(runtime.goals.get(multi.id).phase,'completed');assert.equal(runtime.goals.get(multi.id).checks.length,2)
  assert.match(await browser('eval','[...document.querySelectorAll("#branchCards iframe")].every(f=>f.hidden&&!f.hasAttribute("src"))'),/true/)
  const multiChildren=runtime.list().filter(t=>t.parentId===multi.id)
  await browser('wait','--fn',`document.querySelectorAll('#evidenceSelect option').length===${multiChildren.reduce((n,t)=>n+t.evidence.length,0)}`)
  for(const child of multiChildren){
    const proof=child.evidence.find(e=>child.checks.some(c=>c.evidenceId===e.id));assert(proof)
    await browser('select','#evidenceSelect',child.id+':'+proof.id)
    await browser('wait','--fn',`document.querySelector('#evidenceImage').complete&&document.querySelector('#evidenceImage').naturalWidth===160&&document.querySelector('#evidenceImage').src.endsWith(${JSON.stringify('/evidence/'+child.id+'/'+proof.file)})`)
    assert((await browser('eval','document.querySelector("#evidenceImage").alt')).includes(child.deviceName))
    assert((await browser('eval','document.querySelector("#evidence a").href')).includes('/evidence/'+child.id+'/'+proof.file))
    // A state refresh must preserve a user's choice of branch evidence.
    await browser('wait','1800')
    assert((await browser('eval','document.querySelector("#evidenceSelect").value')).includes(child.id+':'+proof.id))
  }
  await browser('scrollintoview','#evidenceImage')
  await browser('screenshot',new URL('../.artifacts/workbench/multi-evidence-narrow.png',import.meta.url).pathname,'--full')
  // The same evidence endpoint remains usable from an individual branch route.
  const single=multiChildren[0]
  await browser('open',url+'#task/'+single.id);await browser('snapshot','-i')
  await browser('wait','--fn',`!document.querySelector('#evidenceImage').hidden&&document.querySelector('#evidenceImage').naturalWidth===160&&document.querySelector('#evidenceImage').src.includes(${JSON.stringify('/evidence/'+single.id+'/')})`)
  assert.match(await browser('eval','document.querySelector("#evidenceSelect").textContent'),/核验引用/)
  assert.match(await browser('eval','document.querySelector(".task-screen").hidden&&!document.querySelector("#viewer").hasAttribute("src")'),/true/)
  fixturePhones=[device,...['second','third','fourth'].map((id,i)=>({...device,id,serial:'synthetic-'+id,name:'测试手机 '+(i+2)}))]
  await browser('open',url+'#home');await browser('snapshot','-i');await browser('wait','--fn','document.querySelector("#allDevices").textContent.includes("测试手机 4")');await browser('fill','#goal','排队手机测试');await browser('scrollintoview','#submit');await browser('click','#submit');await browser('snapshot','-i')
  await browser('wait','--fn','document.querySelectorAll("#branchCards iframe").length===8&&[...document.querySelectorAll(".branch-status")].filter(e=>e.textContent.includes("正在执行")).length===4')
  const queuedGoal=runtime.goals.list()[0],kids=runtime.list().filter(t=>t.parentId===queuedGoal.id)
  assert.equal(kids.filter(t=>t.phase==='running').length,4);assert.equal(kids.filter(t=>t.phase==='queued').length,4)
  await browser('screenshot',new URL('../.artifacts/workbench/four-queue-narrow.png',import.meta.url).pathname,'--full')
  await browser('fill','#instruction','现在完成');await browser('scrollintoview','#steer');await browser('click','#steer');await browser('snapshot','-i')
  await browser('wait','--fn','document.querySelector("#state").textContent.includes("已完成")')
  assert.equal(runtime.goals.get(queuedGoal.id).phase,'completed');assert.equal(runtime.goals.get(queuedGoal.id).checks.length,8)
  assert(runtime.list().filter(t=>t.parentId===queuedGoal.id).every(t=>t.phase==='completed'&&t.evidence.length>=2))
  await browser('open',url+'#home');await browser('snapshot','-i');await browser('fill','#goal','登录手机测试');await browser('scrollintoview','#submit');await browser('click','#submit');await browser('snapshot','-i')
  await browser('wait','--fn','document.querySelector("#state").textContent.includes("等待用户处理")')
  const loginGoal=runtime.goals.list()[0];assert.equal(loginGoal.phase,'waiting')
  await browser('screenshot',new URL('../.artifacts/workbench/login-waiting-narrow.png',import.meta.url).pathname,'--full')
  await browser('scrollintoview','#steer');await browser('click','#steer');await browser('snapshot','-i');await browser('wait','--fn','document.querySelector("#state").textContent.includes("已完成")')
  assert.equal(runtime.goals.get(loginGoal.id).phase,'completed')
  runtime.profiles.clear();fixturePhones=[]
  await browser('open',url+'#home');await browser('snapshot','-i')
  await browser('wait','--text','暂无设备')
  assert.match(await browser('eval','document.querySelectorAll("#homeDevices iframe").length'),/0/)
  await browser('screenshot',new URL('../.artifacts/workbench/empty-narrow.png',import.meta.url).pathname,'--full')
  fixturePhones=[{...device,authorized:false,state:'unauthorized'}]
  await browser('snapshot','-i');await browser('wait','--text','待授权')
  assert.match(await browser('eval','document.querySelectorAll("#homeDevices iframe").length'),/0/)
  await browser('screenshot',new URL('../.artifacts/workbench/unauthorized-narrow.png',import.meta.url).pathname,'--full')
  for(const name of ['devices','tasks','settings','guide']){
    await browser('open',url+'#'+name);await browser('snapshot','-i')
    await browser('wait','--fn',`!document.querySelector('#${name}Page').hidden`)
    assert.match(await browser('eval','document.documentElement.scrollWidth<=innerWidth'),/true/)
    await browser('screenshot',new URL('../.artifacts/workbench/'+name+'-narrow.png',import.meta.url).pathname,'--full')
  }
  console.log(JSON.stringify({result:'PASS',realDecodedFirstFrame:true,taskSubmit:true,continuesWithoutPage:true,steering:true,stop:true,history:true,narrowLayout:true,navigation:true,stickyStop:true,modelSetupAndFailure:true,evidenceImage:true,exportRecord:true,reuseDraft:true,multiBranch:true,fourPhonesQueuedSteering:true,userHelpResume:true,durableDraft:true,emptyAndUnauthorized:true,physicalPhone:false,realModel:false}))
  }
} catch (error) {
  console.error(JSON.stringify({tasks:runtime?.list().map(t=>({phase:t.phase,error:t.error,steps:t.steps})),frames}))
  console.error(await browser('eval',`JSON.stringify({text:document.body.innerText,invalid:[...document.querySelectorAll(':invalid')].map(x=>({id:x.id,message:x.validationMessage})),forms:[...document.forms].map(f=>({id:f.id,elements:[...f.elements].map(x=>x.id)}))})`).catch(()=> 'page unavailable'))
  await browser('screenshot','/tmp/opengui-workbench-failure.png').catch(()=>{})
  throw error
} finally {await browser('close').catch(()=>{});await web?.close();await runtime?.close();if(embedServer){embedServer.closeAllConnections();await new Promise(resolve=>embedServer.close(resolve))}await rm(root,{recursive:true,force:true})}
