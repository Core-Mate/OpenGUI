import { Module } from '@nestjs/common'
import { TosModule } from '../tos/tos.module'
import { DeviceLogController } from './device-log.controller'
import { DeviceLogService } from './device-log.service'

@Module({
    imports: [TosModule],
    controllers: [DeviceLogController],
    providers: [DeviceLogService],
    exports: [DeviceLogService],
})
export class DeviceLogModule {}
