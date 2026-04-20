import { Global, Module } from '@nestjs/common'
import { AppLogger } from './app-logger.service'

@Global()
@Module({
    providers: [AppLogger],
    exports: [AppLogger],
})
export class LogModule {}
