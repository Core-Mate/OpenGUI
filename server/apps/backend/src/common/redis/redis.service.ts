import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'
import { AppLogger } from '../log'

/**
 *
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private redisClient: Redis

    constructor(private readonly logger: AppLogger) {
        this.logger.setContext(RedisService.name)
    }

    async onModuleInit() {
        await this.connect()
    }

    async onModuleDestroy() {
        await this.disconnect()
    }

    /**
     */
    private async connect(): Promise<void> {
        try {
            const redisConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
                password: process.env.REDIS_PASSWORD || undefined,
                db: parseInt(process.env.REDIS_DB || '0', 10),
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
                keepAlive: 30000,
                family: 4, // 4 (IPv4) or 6 (IPv6)
                connectTimeout: 10000,
                commandTimeout: 5000,
            }

            this.redisClient = new Redis(redisConfig)

            this.redisClient.on('connect', () => {
                this.logger.log('Successfully connected to Redis')
            })

            this.redisClient.on('error', (error) => {
                this.logger.error(
                    `Redis connection error: ${error.message}`,
                    {},
                    error.stack,
                )
            })

            this.redisClient.on('ready', async () => {
                this.logger.log('Redis client is ready')


                try {
                    const result = await this.redisClient.config('GET', 'maxmemory-policy')
                    const policy = Array.isArray(result) ? result[1] : null
                    if (policy && policy !== 'noeviction') {
                        this.logger.warn(
                            `[Redis] Current eviction policy is "${policy}", but BullMQ requires "noeviction". ` +
                            `Run: redis-cli CONFIG SET maxmemory-policy noeviction`,
                        )
                    }
                } catch {

                }
            })

            this.redisClient.on('reconnecting', () => {
                this.logger.warn('Redis client reconnecting...')
            })

            this.redisClient.on('close', () => {
                this.logger.warn('Redis connection closed')
            })

            await this.redisClient.connect()
        } catch (error) {
            this.logger.error(
                `Failed to connect to Redis: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    private async disconnect(): Promise<void> {
        if (this.redisClient) {
            try {
                await this.redisClient.quit()
                this.logger.log('Redis connection closed gracefully')
            } catch (error) {
                this.logger.error(
                    `Error closing Redis connection: ${error.message}`,
                    {},
                    error.stack,
                )
            }
        }
    }

    /**
     */
    getClient(): Redis {
        if (!this.redisClient) {
            throw new Error('Redis client is not initialized')
        }
        return this.redisClient
    }

    /**
     */
    async ping(): Promise<boolean> {
        try {
            const result = await this.redisClient.ping()
            return result === 'PONG'
        } catch (error) {
            this.logger.error(
                `Redis ping failed: ${error.message}`,
                {},
                error.stack,
            )
            return false
        }
    }



    /**
     */
    async set(key: string, value: string, ttl?: number): Promise<void> {
        try {
            if (ttl) {
                await this.redisClient.setex(key, ttl, value)
            } else {
                await this.redisClient.set(key, value)
            }
        } catch (error) {
            this.logger.error(
                `Failed to set key ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async get(key: string): Promise<string | null> {
        try {
            return await this.redisClient.get(key)
        } catch (error) {
            this.logger.error(
                `Failed to get key ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async del(key: string): Promise<number> {
        try {
            return await this.redisClient.del(key)
        } catch (error) {
            this.logger.error(
                `Failed to delete key ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async exists(key: string): Promise<boolean> {
        try {
            const result = await this.redisClient.exists(key)
            return result === 1
        } catch (error) {
            this.logger.error(
                `Failed to check existence of key ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async expire(key: string, seconds: number): Promise<boolean> {
        try {
            const result = await this.redisClient.expire(key, seconds)
            return result === 1
        } catch (error) {
            this.logger.error(
                `Failed to set expire for key ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async ttl(key: string): Promise<number> {
        try {
            return await this.redisClient.ttl(key)
        } catch (error) {
            this.logger.error(
                `Failed to get TTL for key ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }



    /**
     */
    async hset(key: string, field: string, value: string): Promise<number> {
        try {
            return await this.redisClient.hset(key, field, value)
        } catch (error) {
            this.logger.error(
                `Failed to hset ${key}.${field}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async hmset(
        key: string,
        fieldValueMap: Record<string, string>,
    ): Promise<'OK'> {
        try {
            const args: string[] = []
            for (const [field, value] of Object.entries(fieldValueMap)) {
                args.push(field, value)
            }
            return await this.redisClient.hmset(key, ...args)
        } catch (error) {
            this.logger.error(
                `Failed to hmset ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async hget(key: string, field: string): Promise<string | null> {
        try {
            return await this.redisClient.hget(key, field)
        } catch (error) {
            this.logger.error(
                `Failed to hget ${key}.${field}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async hgetall(key: string): Promise<Record<string, string>> {
        try {
            return await this.redisClient.hgetall(key)
        } catch (error) {
            this.logger.error(
                `Failed to hgetall ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async hdel(key: string, ...fields: string[]): Promise<number> {
        try {
            return await this.redisClient.hdel(key, ...fields)
        } catch (error) {
            this.logger.error(
                `Failed to hdel ${key}.[${fields.join(',')}]: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async hexists(key: string, field: string): Promise<boolean> {
        try {
            const result = await this.redisClient.hexists(key, field)
            return result === 1
        } catch (error) {
            this.logger.error(
                `Failed to hexists ${key}.${field}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async hlen(key: string): Promise<number> {
        try {
            return await this.redisClient.hlen(key)
        } catch (error) {
            this.logger.error(
                `Failed to hlen ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }



    /**
     */
    async lpush(key: string, ...elements: string[]): Promise<number> {
        try {
            return await this.redisClient.lpush(key, ...elements)
        } catch (error) {
            this.logger.error(
                `Failed to lpush to ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async rpush(key: string, ...elements: string[]): Promise<number> {
        try {
            return await this.redisClient.rpush(key, ...elements)
        } catch (error) {
            this.logger.error(
                `Failed to rpush to ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async lpop(key: string): Promise<string | null> {
        try {
            return await this.redisClient.lpop(key)
        } catch (error) {
            this.logger.error(
                `Failed to lpop from ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async rpop(key: string): Promise<string | null> {
        try {
            return await this.redisClient.rpop(key)
        } catch (error) {
            this.logger.error(
                `Failed to rpop from ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async llen(key: string): Promise<number> {
        try {
            return await this.redisClient.llen(key)
        } catch (error) {
            this.logger.error(
                `Failed to llen ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        try {
            return await this.redisClient.lrange(key, start, stop)
        } catch (error) {
            this.logger.error(
                `Failed to lrange ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }



    /**
     */
    async sadd(key: string, ...members: string[]): Promise<number> {
        try {
            return await this.redisClient.sadd(key, ...members)
        } catch (error) {
            this.logger.error(
                `Failed to sadd to ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async srem(key: string, ...members: string[]): Promise<number> {
        try {
            return await this.redisClient.srem(key, ...members)
        } catch (error) {
            this.logger.error(
                `Failed to srem from ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async sismember(key: string, member: string): Promise<boolean> {
        try {
            const result = await this.redisClient.sismember(key, member)
            return result === 1
        } catch (error) {
            this.logger.error(
                `Failed to sismember ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async smembers(key: string): Promise<string[]> {
        try {
            return await this.redisClient.smembers(key)
        } catch (error) {
            this.logger.error(
                `Failed to smembers ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async scard(key: string): Promise<number> {
        try {
            return await this.redisClient.scard(key)
        } catch (error) {
            this.logger.error(
                `Failed to scard ${key}: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }



    /**
     */
    async multi(
        commands: Array<{ command: string; args: any[] }>,
    ): Promise<any> {
        try {
            const pipeline = this.redisClient.multi()

            for (const { command, args } of commands) {
                ;(pipeline as any)[command](...args)
            }

            return await pipeline.exec()
        } catch (error) {
            this.logger.error(
                `Failed to execute multi commands: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async pipeline(
        commands: Array<{ command: string; args: any[] }>,
    ): Promise<any> {
        try {
            const pipeline = this.redisClient.pipeline()

            for (const { command, args } of commands) {
                ;(pipeline as any)[command](...args)
            }

            return await pipeline.exec()
        } catch (error) {
            this.logger.error(
                `Failed to execute pipeline commands: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async dbsize(): Promise<number> {
        try {
            return await this.redisClient.dbsize()
        } catch (error) {
            this.logger.error(
                `Failed to get database size: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }

    /**
     */
    async flushdb(): Promise<'OK'> {
        try {
            this.logger.warn('Flushing Redis database')
            return await this.redisClient.flushdb()
        } catch (error) {
            this.logger.error(
                `Failed to flush database: ${error.message}`,
                {},
                error.stack,
            )
            throw error
        }
    }
}
