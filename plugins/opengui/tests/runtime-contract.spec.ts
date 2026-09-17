import { it } from 'vitest'
import { PhoneController } from '../src/phone-controller.ts'
import { controllerContract } from '../../../packages/device-runtime/tests/controller-contract.ts'
controllerContract(it, options => new PhoneController(options))
import { sessionContract } from '../../../packages/device-runtime/tests/session-contract.ts'
sessionContract(it)
