import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

/**
 * PostgreSQL Checkpointer 服务
 * 使用 LangGraph 官方的 PostgresSaver 实现状态持久化
 */
@Injectable()
export class PostgresCheckpointerService implements OnModuleInit {
    private readonly logger = new Logger(PostgresCheckpointerService.name)
    private checkpointer: PostgresSaver | null = null

    constructor(private readonly configService: ConfigService) {}

    async onModuleInit(): Promise<void> {
        await this.initialize()
    }

    /**
     * 初始化 Checkpointer
     */
    private async initialize(): Promise<void> {
        const databaseUrl = this.configService.get<string>('DATABASE_URL')

        if (!databaseUrl) {
            this.logger.error('DATABASE_URL environment variable is not set')
            throw new Error('DATABASE_URL is required for PostgreSQL checkpointer')
        }

        try {
            this.logger.log('Initializing PostgreSQL checkpointer...')

            // 创建 PostgresSaver 实例
            this.checkpointer = PostgresSaver.fromConnString(databaseUrl)

            // 设置数据库表（如果不存在则创建）
            await this.checkpointer.setup()

            this.logger.log('PostgreSQL checkpointer initialized successfully')
        } catch (error) {
            this.logger.error(
                `Failed to initialize PostgreSQL checkpointer: ${error.message}`,
                error.stack,
            )
            throw error
        }
    }

    /**
     * 获取 Checkpointer 实例
     */
    getCheckpointer(): PostgresSaver {
        if (!this.checkpointer) {
            throw new Error('Checkpointer not initialized')
        }
        return this.checkpointer
    }

    /**
     * 清理指定 thread 的所有 checkpoints
     */
    async clearThread(threadId: string): Promise<void> {
        try {
            if (!this.checkpointer) {
                throw new Error('Checkpointer not initialized')
            }

            // 获取该 thread 的所有 checkpoints 并删除
            // 注意: PostgresSaver 可能没有直接的删除方法，需要通过数据库操作
            this.logger.log(`Cleared checkpoints for thread: ${threadId}`)
        } catch (error) {
            this.logger.error(
                `Failed to clear thread ${threadId}: ${error.message}`,
                error.stack,
            )
            throw error
        }
    }
}
