import { PhoneController as RuntimePhoneController, type PhoneControllerOptions } from '../../packages/device-runtime/src/phone-controller.ts'
import { sampleFrame } from './vision.ts'
export type { PhoneControllerOptions, RawPhoneObservation } from '../../packages/device-runtime/src/phone-controller.ts'

/** WorkBuddy retains its pixel guard, read retries and settled-frame policy. */
export class PhoneController extends RuntimePhoneController {
  constructor(options: PhoneControllerOptions) {
    super({ ...options, sampleFrame, readScreenSize: true, retryReads: true })
  }
}
