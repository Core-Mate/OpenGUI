import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'
import { AppLogger } from '../log'

/**
 * Redis服务
 * 提供Redis连接管理和基础操作方法
 *
 * 环境变量配置：
 * - REDIS_HOST: Redis主机地址 (默认: localhost)
 * - REDIS_PORT: Redis端口 (默认: 6379)
 * - REDIS_PASSWORD: Redis密码 (可选)
 * - REDIS_DB: Redis数据库 (默认: 0)
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
     * 建立Redis连接
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

                // 检查 Redis 驱逐策略（BullMQ 要求 noeviction）
                try {
                    const result = await this.redisClient.config('GET', 'maxmemory-policy')
                    const policy = Array.isArray(result) ? result[1] : null
                    if (policy && policy !== 'noeviction') {
                        this.logger.warn(
                            `[Redis] 当前驱逐策略为 "${policy}"，BullMQ 要求 "noeviction"。` +
                            `请执行: redis-cli CONFIG SET maxmemory-policy noeviction`,
                        )
                    }
                } catch {
                    // 部分托管 Redis 禁用 CONFIG 命令
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
     * 断开Redis连接
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
     * 获取Redis客户端实例
     * 注意：直接使用client时需要注意错误处理
     */
    getClient(): Redis {
        if (!this.redisClient) {
            throw new Error('Redis client is not initialized')
        }
        return this.redisClient
    }

    /**
     * 检查Redis连接状态
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

    // ==================== 基础字符串操作 ====================

    /**
     * 设置键值对
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
     * 获取键值
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
     * 删除键
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
     * 检查键是否存在
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
     * 设置键的过期时间
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
     * 获取键的TTL
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

    // ==================== Hash操作 ====================

    /**
     * 设置Hash字段
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
     * 批量设置Hash字段
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
     * 获取Hash字段值
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
     * 获取Hash所有字段和值
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
     * 删除Hash字段
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
     * 检查Hash字段是否存在
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
     * 获取Hash字段数量
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

    // ==================== List操作 ====================

    /**
     * 左端推入列表
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
     * 右端推入列表
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
     * 左端弹出列表
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
     * 右端弹出列表
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
     * 获取列表长度
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
     * 获取列表范围
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

    // ==================== Set操作 ====================

    /**
     * 添加集合成员
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
     * 移除集合成员
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
     * 检查集合成员是否存在
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
     * 获取集合所有成员
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
     * 获取集合成员数量
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

    // ==================== 高级操作 ====================

    /**
     * 执行事务
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
     * 管道操作
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
     * 获取数据库大小
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
     * 刷新数据库
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
