import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ApkController } from './apk.controller'
import { ApkService } from './apk.service'

@Module({
    imports: [ConfigModule],
    controllers: [ApkController],
    providers: [ApkService],
    exports: [ApkService],
})
export class ApkModule {}
