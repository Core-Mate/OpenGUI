import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

/**
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
     */
    private async initialize(): Promise<void> {
        const databaseUrl = this.configService.get<string>('DATABASE_URL')

        if (!databaseUrl) {
            this.logger.error('DATABASE_URL environment variable is not set')
            throw new Error('DATABASE_URL is required for PostgreSQL checkpointer')
        }

        try {
            this.logger.log('Initializing PostgreSQL checkpointer...')


            this.checkpointer = PostgresSaver.fromConnString(databaseUrl)


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
     */
    getCheckpointer(): PostgresSaver {
        if (!this.checkpointer) {
            throw new Error('Checkpointer not initialized')
        }
        return this.checkpointer
    }

    /**
     */
    async clearThread(threadId: string): Promise<void> {
        try {
            if (!this.checkpointer) {
                throw new Error('Checkpointer not initialized')
            }



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
