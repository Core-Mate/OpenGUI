import sharp from 'sharp'
import { DeviceWallServer } from '../lib/wall.js'

// Synthetic, explicitly labelled QA data. This preview never opens ADB or a broker.
const frame = await sharp(Buffer.from('<svg width="360" height="640" xmlns="http://www.w3.org/2000/svg"><rect width="360" height="640" fill="#eeeeec"/><text x="28" y="60" font-size="22" font-family="sans-serif" fill="#242424">OpenGUI QA fixture</text><text x="28" y="94" font-size="14" font-family="sans-serif" fill="#606060">Synthetic frame, not a real phone</text><rect x="28" y="138" width="304" height="80" rx="8" fill="#d4d9d2"/><rect x="28" y="238" width="304" height="80" rx="8" fill="#dbded9"/><rect x="28" y="338" width="304" height="80" rx="8" fill="#e0e2dd"/></svg>')).jpeg().toBuffer()
const closed = process.argv.includes('--closed')
const wall = new DeviceWallServer(async () => ({
  sessionId: 'visual-qa', state: closed ? 'closed' : 'active', createdAt: new Date().toISOString(), deviceWallUrl: wall.url('visual-qa'),
  devices: [
    { id: 'fixture-a', name: 'QA 设备 · Pixel 9', connected: true, authorized: true, operationCount: 7 },
    { id: 'fixture-b', name: 'QA 设备 · 长名称换行验证 Android phone', connected: false, authorized: false, operationCount: 13 },
  ],
}), async () => frame)
await wall.start()
console.log(wall.url('visual-qa'))
process.once('SIGINT', () => { void wall.close() })
process.once('SIGTERM', () => { void wall.close() })
