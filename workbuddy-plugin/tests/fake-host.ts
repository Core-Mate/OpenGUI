import { ObservationId } from '../src/adb.ts'
import type { WorkBuddyDeviceInfo, WorkBuddyPhoneHost, ResolvedWorkBuddyDevice } from '../src/service.ts'
import type { RawPhoneObservation } from '../src/phone-controller.ts'

export class FakeHost implements WorkBuddyPhoneHost {
  readonly devices: ResolvedWorkBuddyDevice[] = [
    { id: 'phone-a', name: 'Pixel', model: 'Pixel', serial: 'serial-a', state: 'device', connected: true, authorized: true },
    { id: 'phone-b', name: 'Nubia', model: 'Nubia', serial: 'serial-b', state: 'device', connected: true, authorized: true },
    { id: 'locked', name: 'Locked', serial: 'serial-locked', state: 'unauthorized', connected: true, authorized: false },
  ]
  readonly actors = new WeakMap<object, { serial: string; operations: number; sequence: number }>()
  readonly released: string[] = []

  async listDevices(): Promise<readonly WorkBuddyDeviceInfo[]> {
    return this.devices.map(({ serial: _serial, ...device }) => device)
  }

  async resolveDevices(deviceIds: readonly string[] | undefined): Promise<readonly ResolvedWorkBuddyDevice[]> {
    const ids = deviceIds ?? ['phone-a']
    return ids.map((id) => {
      const value = this.devices.find(device => device.id === id)
      if (value === undefined || !value.authorized) throw new Error('fake unauthorized device')
      return value
    })
  }

  assignTarget(actor: object, serial: string): void {
    this.actors.set(actor, { serial, operations: 0, sequence: 0 })
  }

  observe(actor: object, _signal?: AbortSignal): Promise<RawPhoneObservation> {
    return Promise.resolve(this.frame(actor))
  }

  act(actor: object): Promise<RawPhoneObservation> {
    return Promise.resolve(this.frame(actor))
  }

  status(actor: object): { operations: number; observationId?: string } {
    const state = this.actors.get(actor)!
    return { operations: state.operations, ...(state.sequence === 0 ? {} : { observationId: `phone-observation-${state.sequence}` }) }
  }

  async preview(): Promise<Buffer> { return Buffer.from('jpeg') }
  async releaseDevice(serial: string): Promise<void> { this.released.push(serial) }
  async dispose(): Promise<void> {}

  private frame(actor: object): RawPhoneObservation {
    const state = this.actors.get(actor)!
    state.operations += 1
    state.sequence += 1
    return {
      observationId: ObservationId(`phone-observation-${state.sequence}`),
      serial: state.serial,
      width: 100,
      height: 200,
      foregroundPackage: 'com.example',
      image: { data: Buffer.from('jpeg'), mediaType: 'image/jpeg', bytes: 4, width: 100, height: 200, name: 'phone.jpg' },
    }
  }
}
