import { Global, Module } from '@nestjs/common'
import { RedisService } from './redis.service'

/**
 * Redis模块
 *
 * 提供Redis服务的全局模块，包括：
 * - Redis连接管理
 * - 基础Redis操作封装
 * - 错误处理和日志
 * - 连接池管理
 *
 * 使用@Global装饰器，使得RedisService在整个应用中可用
 * 无需在每个需要使用Redis的模块中重复导入
 *
 */
@Global()
@Module({
    providers: [RedisService],
    exports: [
        // 导出RedisService供其他模块使用
        RedisService,
    ],
})
export class RedisModule {}
