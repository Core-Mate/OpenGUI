import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

/**
 */
export interface LeaseInfo {
	executionId: number;
	userId: number;
	taskId: number;
	createdAt: number;
}

/**
 *
 *
 */
@Injectable()
export class LeaseService {
	private readonly logger = new Logger(LeaseService.name);

	private readonly LEASE_KEY_PREFIX = "lease:execution:";

	private readonly DEFAULT_TTL_SECONDS = 120;

	constructor(private readonly redisService: RedisService) {}

	/**
	 *
	 * @param userId User ID
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
	 *
	 */
	async renewLease(
		executionId: number,
		ttlSeconds = this.DEFAULT_TTL_SECONDS,
	): Promise<boolean> {
		const key = this.getLeaseKey(executionId);

		try {

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
	 *
	 */
	async isLeaseValid(executionId: number): Promise<boolean> {
		const key = this.getLeaseKey(executionId);

		try {
			return await this.redisService.exists(key);
		} catch (error) {
			this.logger.error(
				`[LEASE] Failed to check lease for execution ${executionId}: ${(error as Error).message}`,
			);

			return true;
		}
	}

	/**
	 *
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
	 *
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
	 *
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
	 *
	 * @param executionIds Execution ID list
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


		for (const executionId of executionIds) {
			const key = this.getLeaseKey(executionId);
			pipeline.expire(key, ttlSeconds);
		}

		try {
			const results = await pipeline.exec();
			if (results) {
				results.forEach((result, index) => {

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
	 */
	private getLeaseKey(executionId: number): string {
		return `${this.LEASE_KEY_PREFIX}${executionId}`;
	}

	/**
	 */
	getDefaultTTL(): number {
		return this.DEFAULT_TTL_SECONDS;
	}

	/**
	 */
	getRecommendedHeartbeatInterval(): number {
		return Math.floor(this.DEFAULT_TTL_SECONDS / 2);
	}
}
