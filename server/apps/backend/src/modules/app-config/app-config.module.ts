import { Module } from '@nestjs/common'
import { AppConfigController } from './app-config.controller'
import { AppConfigService } from './app-config.service'

@Module({
    controllers: [AppConfigController],
    providers: [AppConfigService],
    exports: [AppConfigService],
})
export class AppConfigModule {}
