import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

/**
 * 租约信息
 */
export interface LeaseInfo {
	executionId: number;
	userId: number;
	taskId: number;
	createdAt: number;
}

/**
 * 租约服务
 *
 * 提供心跳租约机制，用于检测客户端是否存活。
 * 当客户端杀掉进程后，租约会自动过期，服务端可以终止任务执行。
 *
 * 核心参数：
 * - TTL: 120秒（租约有效期，必须 > Socket.IO 死连接检测窗口 45s + 重连 10s）
 * - 心跳间隔: 5秒（客户端实际配置）
 */
@Injectable()
export class LeaseService {
	private readonly logger = new Logger(LeaseService.name);

	/** 租约 Key 前缀 */
	private readonly LEASE_KEY_PREFIX = "lease:execution:";

	/** 默认租约 TTL（秒）— 必须 > pingInterval(25s) + pingTimeout(20s) + 重连时间(~10s) */
	private readonly DEFAULT_TTL_SECONDS = 120;

	constructor(private readonly redisService: RedisService) {}

	/**
	 * 创建租约
	 *
	 * @param executionId 执行 ID
	 * @param userId 用户 ID
	 * @param taskId 任务 ID
	 * @param ttlSeconds 租约有效期（秒），默认 120 秒
	 * @returns 是否创建成功
	 */
	async createLease(
		executionId: number,
		userId: number,
		taskId: number,
		ttlSeconds = this.DEFAULT_TTL_SECONDS,
	): Promise<boolean> {
		const key = this.getLeaseKey(executionId);
		const leaseInfo: LeaseInfo = {
			executionId,
			userId,
			taskId,
			createdAt: Date.now(),
		};

		try {
			await this.redisService.set(key, JSON.stringify(leaseInfo), ttlSeconds);
			this.logger.log(
				`[LEASE] Created lease for execution ${executionId}, TTL: ${ttlSeconds}s`,
			);
			return true;
		} catch (error) {
			this.logger.error(
				`[LEASE] Failed to create lease for execution ${executionId}: ${(error as Error).message}`,
			);
			return false;
		}
	}

	/**
	 * 续租
	 *
	 * @param executionId 执行 ID
	 * @param ttlSeconds 续租时间（秒），默认 120 秒
	 * @returns 是否续租成功（false 表示租约不存在或已过期）
	 */
	async renewLease(
		executionId: number,
		ttlSeconds = this.DEFAULT_TTL_SECONDS,
	): Promise<boolean> {
		const key = this.getLeaseKey(executionId);

		try {
			// 直接使用 expire，如果 key 不存在会返回 false（原子操作，避免 TOCTOU 竞态）
			const success = await this.redisService.expire(key, ttlSeconds);
			if (success) {
				this.logger.debug(
					`[LEASE] Renewed lease for execution ${executionId}, TTL: ${ttlSeconds}s`,
				);
			} else {
				this.logger.warn(
					`[LEASE] Cannot renew: lease for execution ${executionId} not found`,
				);
			}
			return success;
		} catch (error) {
			this.logger.error(
				`[LEASE] Failed to renew lease for execution ${executionId}: ${(error as Error).message}`,
			);
			return false;
		}
	}

	/**
	 * 检查租约是否有效
	 *
	 * @param executionId 执行 ID
	 * @returns 是否有效
	 */
	async isLeaseValid(executionId: number): Promise<boolean> {
		const key = this.getLeaseKey(executionId);

		try {
			return await this.redisService.exists(key);
		} catch (error) {
			this.logger.error(
				`[LEASE] Failed to check lease for execution ${executionId}: ${(error as Error).message}`,
			);
			// 出错时默认租约有效，避免误杀任务
			return true;
		}
	}

	/**
	 * 获取租约信息
	 *
	 * @param executionId 执行 ID
	 * @returns 租约信息，不存在返回 null
	 */
	async getLeaseInfo(executionId: number): Promise<LeaseInfo | null> {
		const key = this.getLeaseKey(executionId);

		try {
			const data = await this.redisService.get(key);
			if (!data) {
				return null;
			}
			return JSON.parse(data) as LeaseInfo;
		} catch (error) {
			this.logger.error(
				`[LEASE] Failed to get lease info for execution ${executionId}: ${(error as Error).message}`,
			);
			return null;
		}
	}

	/**
	 * 获取租约剩余 TTL
	 *
	 * @param executionId 执行 ID
	 * @returns 剩余秒数，-2 表示不存在，-1 表示无过期时间
	 */
	async getLeaseTTL(executionId: number): Promise<number> {
		const key = this.getLeaseKey(executionId);

		try {
			return await this.redisService.ttl(key);
		} catch (error) {
			this.logger.error(
				`[LEASE] Failed to get TTL for execution ${executionId}: ${(error as Error).message}`,
			);
			return -2;
		}
	}

	/**
	 * 释放租约
	 *
	 * @param executionId 执行 ID
	 * @returns 是否释放成功
	 */
	async releaseLease(executionId: number): Promise<boolean> {
		const key = this.getLeaseKey(executionId);

		try {
			const deleted = await this.redisService.del(key);
			if (deleted > 0) {
				this.logger.log(`[LEASE] Released lease for execution ${executionId}`);
				return true;
			}
			return false;
		} catch (error) {
			this.logger.error(
				`[LEASE] Failed to release lease for execution ${executionId}: ${(error as Error).message}`,
			);
			return false;
		}
	}

	/**
	 * 批量续租
	 *
	 * @param executionIds 执行 ID 列表
	 * @param ttlSeconds 续租时间（秒）
	 * @returns 成功续租的执行 ID 列表
	 */
	async renewLeasesBatch(
		executionIds: number[],
		ttlSeconds = this.DEFAULT_TTL_SECONDS,
	): Promise<number[]> {
		if (executionIds.length === 0) {
			return [];
		}

		const renewed: number[] = [];
		const client = this.redisService.getClient();
		const pipeline = client.pipeline();

		// 构建批量 EXPIRE 命令
		for (const executionId of executionIds) {
			const key = this.getLeaseKey(executionId);
			pipeline.expire(key, ttlSeconds);
		}

		try {
			const results = await pipeline.exec();
			if (results) {
				results.forEach((result, index) => {
					// result 格式: [error, value]
					if (!result[0] && result[1] === 1) {
						renewed.push(executionIds[index]);
					}
				});
			}

			this.logger.debug(
				`[LEASE] Batch renewed ${renewed.length}/${executionIds.length} leases`,
			);
			return renewed;
		} catch (error) {
			this.logger.error(
				`[LEASE] Failed to batch renew leases: ${(error as Error).message}`,
			);
			return [];
		}
	}

	/**
	 * 获取租约 Redis Key
	 */
	private getLeaseKey(executionId: number): string {
		return `${this.LEASE_KEY_PREFIX}${executionId}`;
	}

	/**
	 * 获取默认 TTL（供客户端参考）
	 */
	getDefaultTTL(): number {
		return this.DEFAULT_TTL_SECONDS;
	}

	/**
	 * 获取建议的心跳间隔（TTL 的一半）
	 */
	getRecommendedHeartbeatInterval(): number {
		return Math.floor(this.DEFAULT_TTL_SECONDS / 2);
	}
}
