import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { WorkBuddySessionStatus } from './service.ts'

type StatusReader = (id: string, signal: AbortSignal) => Promise<WorkBuddySessionStatus>
type PreviewReader = (id: string, deviceId: string, signal: AbortSignal) => Promise<Buffer>

/** Read-only, per-session capability URLs. No cross-session enumeration or external assets. */
export class DeviceWallServer {
  private server: Server | undefined
  private port: number | undefined
  private starting: Promise<void> | undefined
  private readonly tokens = new Map<string, string>()

  constructor(private readonly status: StatusReader, private readonly preview: PreviewReader) {}

  async start(): Promise<void> {
    if (this.port !== undefined) return
    if (this.starting) return this.starting
    this.starting = new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => { void this.handle(req, res) })
      server.once('error', reject)
      server.listen({ host: '127.0.0.1', port: 0 }, () => {
        const address = server.address()
        if (!address || typeof address === 'string') { server.close(); reject(new Error('opengui: device wall failed to bind')); return }
        this.server = server
        this.port = address.port
        resolve()
      })
    })
    try { await this.starting } finally { this.starting = undefined }
  }

  url(id: string): string {
    if (this.port === undefined) return 'about:blank'
    let token = this.tokens.get(id)
    if (!token) { token = randomBytes(24).toString('base64url'); this.tokens.set(id, token) }
    return `http://127.0.0.1:${this.port}/${token}/?sessionId=${encodeURIComponent(id)}`
  }

  forget(id: string): void { this.tokens.delete(id) }

  async close(): Promise<void> {
    await this.starting?.catch(() => undefined)
    const server = this.server
    this.server = undefined
    this.port = undefined
    this.tokens.clear()
    if (server) {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const origin = `http://127.0.0.1:${this.port}`
    if (req.headers.host !== `127.0.0.1:${this.port}` || (req.headers.origin && req.headers.origin !== origin)
      || (req.headers['sec-fetch-site'] === 'cross-site' && req.headers['sec-fetch-mode'] !== 'navigate')) {
      this.reply(res, 403, 'Forbidden'); return
    }
    const controller = new AbortController()
    res.once('close', () => controller.abort())
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
    try {
      const url = new URL(req.url ?? '/', origin)
      const id = url.searchParams.get('sessionId') ?? ''
      const token = this.tokens.get(id)
      if (!token || !url.pathname.startsWith(`/${token}/`)) { this.reply(res, 404, 'Not found'); return }
      if (req.method !== 'GET') { this.reply(res, 405, 'Read-only device wall'); return }
      const route = url.pathname.slice(token.length + 1)
      if (route === '/') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' blob:; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
        this.reply(res, 200, page(), 'text/html; charset=utf-8')
      } else if (route === '/api/status') {
        this.reply(res, 200, JSON.stringify(await this.status(id, signal)), 'application/json')
      } else if (route === '/api/preview') {
        const data = await this.preview(id, url.searchParams.get('deviceId') ?? '', signal)
        this.reply(res, 200, data, 'image/jpeg')
      } else this.reply(res, 404, 'Not found')
    } catch (error) {
      if (!res.destroyed) this.reply(res, 400, JSON.stringify({ error: error instanceof Error ? error.message : 'Preview unavailable' }), 'application/json')
    }
  }

  private reply(res: ServerResponse, status: number, body: string | Buffer, type = 'text/plain; charset=utf-8'): void {
    res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) })
    res.end(body)
  }
}

export function page(): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenGUI · WorkBuddy</title><style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;background:#0a0a0b;color:#f5f5f5;font-synthesis:none}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;padding:24px;line-height:1.7}header{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:24px}h1{font-size:22px;font-weight:650;margin:0}h1 small{font-size:13px;font-weight:400;color:#a3a3a3;margin-left:10px}.state,.detail{font-size:13px;color:#a3a3a3;font-variant-numeric:tabular-nums}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),380px));gap:16px}.device{min-width:0;background:#151517;border:1px solid #2b2b30;border-radius:12px;overflow:hidden}.meta{padding:12px 14px;display:flex;justify-content:space-between;gap:12px;align-items:baseline}.name{font-size:15px;font-weight:600;overflow-wrap:anywhere}.health{font-size:12px;white-space:nowrap;color:#a3a3a3}.frame{background:#050506;aspect-ratio:9/16;position:relative}.frame-status{position:absolute;inset:0;display:grid;place-content:center;padding:24px;color:#a3a3a3;font-size:14px}img{display:block;width:100%;height:100%;object-fit:contain}.notice{padding:8px 14px;font-size:12px;color:#c9c9ce;overflow-wrap:anywhere}.empty{padding:24px;color:#a3a3a3;border:1px dashed #3f3f46;border-radius:12px}.skip{position:absolute;left:-9999px}.skip:focus{position:static;color:inherit}a:focus-visible{outline:2px solid #f5f5f5;outline-offset:4px}@media(max-width:480px){body{padding:16px}header{gap:4px;margin-bottom:16px}}
</style></head><body><a class="skip" href="#main">跳到设备画面</a><header><h1>OpenGUI<small>WorkBuddy</small></h1><div id="state" class="state" role="status">正在连接设备墙</div></header><main id="main" class="grid"><p class="empty">等待会话状态</p></main>
<script>
const id=new URLSearchParams(location.search).get('sessionId')||'';
const base=location.pathname.replace(/\\/$/,'');
const grid=document.getElementById('main'),state=document.getElementById('state'),cards=new Map();
const endpoint=(route,device)=>base+'/api/'+route+'?sessionId='+encodeURIComponent(id)+(device?'&deviceId='+encodeURIComponent(device):'');
function card(device){let item=cards.get(device.id);if(item)return item;const root=document.createElement('section');root.className='device';const meta=document.createElement('div');meta.className='meta';const left=document.createElement('div');const name=document.createElement('div');name.className='name';name.textContent=device.name;const detail=document.createElement('div');detail.className='detail';left.append(name,detail);const health=document.createElement('div');health.className='health';meta.append(left,health);const frame=document.createElement('div');frame.className='frame';const image=document.createElement('img');image.alt=device.name+' 的手机画面';image.width=360;image.height=640;image.hidden=true;const placeholder=document.createElement('div');placeholder.className='frame-status';placeholder.textContent='等待读取画面';frame.append(image,placeholder);const notice=document.createElement('div');notice.className='notice';notice.textContent='正在读取画面';root.append(meta,frame,notice);grid.append(root);item={root,detail,health,image,placeholder,notice,url:null};cards.set(device.id,item);return item}
function hideFrame(item,message){item.image.hidden=true;item.image.removeAttribute('src');if(item.url)URL.revokeObjectURL(item.url);item.url=null;item.placeholder.hidden=false;item.placeholder.textContent=message;item.notice.textContent=message}
async function frame(device,item){try{const response=await fetch(endpoint('preview',device.id),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('预览不可用，请检查手机连接');const url=URL.createObjectURL(await response.blob());const previous=item.url;item.image.src=url;item.url=url;if(previous)URL.revokeObjectURL(previous);await item.image.decode();item.image.hidden=false;item.placeholder.hidden=true;item.notice.textContent='只读预览 · '+new Date().toLocaleTimeString()}catch(error){hideFrame(item,String(error.message||error))}}
async function refresh(){try{if(document.hidden)return;const response=await fetch(endpoint('status'),{cache:'no-store',signal:AbortSignal.timeout(10000)});const value=await response.json();if(!response.ok)throw new Error(value.error||'会话不可用');state.textContent=({active:'运行中',cancelled:'已取消',closed:'已结束'}[value.state]||value.state)+' · '+value.devices.length+' 台设备';if(!cards.size)grid.replaceChildren();for(const [key,item]of cards){if(!value.devices.some(d=>d.id===key)){if(item.url)URL.revokeObjectURL(item.url);item.root.remove();cards.delete(key)}}const jobs=[];for(const device of value.devices){const item=card(device);item.detail.textContent='操作 '+device.operationCount+' / 100';item.health.textContent=!device.connected?'已断开':device.authorized?'已授权':'未授权';if(value.state==='active'&&device.connected&&device.authorized)jobs.push(frame(device,item));else hideFrame(item,value.state==='active'?'请检查 USB 调试授权':'会话已停止，画面不再读取')}await Promise.all(jobs)}catch(error){state.textContent=String(error.message||error);for(const item of cards.values())hideFrame(item,'连接已断开，预览已隐藏')}finally{setTimeout(refresh,1500)}}refresh();
</script></body></html>`
}
