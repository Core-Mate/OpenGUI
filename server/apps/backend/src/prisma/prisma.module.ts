import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/**
 * PrismaModule - 全局模块，提供 PrismaService
 */
@Global()
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}
