import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TosController } from './tos.controller'
import { TosService } from './tos.service'

@Module({
    imports: [ConfigModule],
    controllers: [TosController],
    providers: [TosService],
    exports: [TosService],
})
export class TosModule {}
