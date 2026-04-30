import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { prisma } from "@repo/db";
import { AppLogger } from "src/common/log";
import { TosService } from "../tos/tos.service";
import {
	BatchDeleteDto,
	BatchOperationResultDto,
	BatchRetryDto,
	DeviceLogDto,
	LogTaskStatus,
	PaginatedDeviceLogsDto,
	QueryDeviceLogsDto,
	SignedUrlDto,
} from "./dto/device-log.dto";

@Injectable()
export class DeviceLogService {
	constructor(
		private readonly logger: AppLogger,
		private readonly tosService: TosService,
	) {
		this.logger.setContext(DeviceLogService.name);
	}

	/**
	 */
	async queryDeviceLogs(
		dto: QueryDeviceLogsDto,
	): Promise<PaginatedDeviceLogsDto> {
		const {
			user_id,
			log_status,
			page = 1,
			limit = 10,
			sort = "created_at",
			order = "desc",
		} = dto;


		const where: any = {
			is_deleted: false,
		};

		if (user_id) {
			where.user_id = user_id;
		}

		if (log_status && log_status.length > 0) {
			where.log_status = { in: log_status };
		}


		const total = await prisma.user_device_log.count({ where });


		const skip = (page - 1) * limit;


		const logs = await prisma.user_device_log.findMany({
			where,
			skip,
			take: limit,
			orderBy: {
				[sort]: order,
			},
		});


		const userIds = logs.map((log) => log.user_id);
		const users = (await prisma.users.findMany({
			where: { id: { in: userIds } },
			select: { id: true, phoneNumber: true },
		})) as { id: number; phoneNumber: string | null }[];

		const userMap = new Map(users.map((u) => [u.id, u]));


		const data: DeviceLogDto[] = logs.map((log) => ({
			id: log.id,
			user_id: log.user_id,
			phone_number: userMap.get(log.user_id)?.phoneNumber || undefined,
			log_uri: log.log_uri,
			log_start_at: log.log_start_at,
			log_end_at: log.log_end_at,
			log_status: log.log_status as LogTaskStatus,
			created_at: log.created_at,
			updated_at: log.updated_at,
		}));


		const total_pages = Math.ceil(total / limit);

		this.logger.log(
			`Listed device logs, total: ${total}, page: ${page}, limit: ${limit}`,
		);

		return {
			total,
			page,
			limit,
			total_pages,
			data,
		};
	}

	/**
	 * Get device log details
	 */
	async getDeviceLogDetail(id: number): Promise<DeviceLogDto> {
		const log = await prisma.user_device_log.findUnique({
			where: { id },
		});

		if (!log || log.is_deleted) {
			throw new NotFoundException(`Log record not found，ID: ${id}`);
		}


		const user = await prisma.users.findUnique({
			where: { id: log.user_id },
			select: { phoneNumber: true },
		});

		return {
			id: log.id,
			user_id: log.user_id,
			phone_number: user?.phoneNumber || undefined,
			log_uri: log.log_uri,
			log_start_at: log.log_start_at,
			log_end_at: log.log_end_at,
			log_status: log.log_status as LogTaskStatus,
			created_at: log.created_at,
			updated_at: log.updated_at,
		};
	}

	/**
	 */
	async getSignedUrl(id: number): Promise<SignedUrlDto> {
		const log = await prisma.user_device_log.findUnique({
			where: { id },
		});

		if (!log || log.is_deleted) {
			return {
				success: false,
				error: "Log record not found",
			};
		}

		if (!log.log_uri) {
			return {
				success: false,
				error: "Log file has not been uploaded",
			};
		}

		try {

			const signedUrl = await this.tosService.getOssSignedUrl(
				log.log_uri,
				3600,
			);

			this.logger.log(`Generated signed URL successfully, log ID: ${id}`);

			return {
				success: true,
				url: signedUrl,
			};
		} catch (error) {
			this.logger.error(`Failed to generate signed URL, log ID: ${id}`, {}, error.stack);
			return {
				success: false,
				error: error.message || "Failed to generate signed URL",
			};
		}
	}

	/**
	 */
	async batchDelete(dto: BatchDeleteDto): Promise<BatchOperationResultDto> {
		const { ids } = dto;

		if (ids.length === 0) {
			throw new BadRequestException("ID list cannot be empty");
		}

		const failedDetails: Array<{ id: number; error: string }> = [];
		let successCount = 0;

		for (const id of ids) {
			try {
				const log = await prisma.user_device_log.findUnique({
					where: { id },
				});

				if (!log || log.is_deleted) {
					failedDetails.push({
						id,
						error: "Log record not found or deleted",
					});
					continue;
				}

				await prisma.user_device_log.update({
					where: { id },
					data: {
						is_deleted: true,
						updated_at: new Date(),
					},
				});

				successCount++;
				this.logger.log(`Deleted log record successfully, ID: ${id}`);
			} catch (error) {
				failedDetails.push({
					id,
					error: error.message || "Delete failed",
				});
				this.logger.error(`Failed to delete log record, ID: ${id}`, {}, error.stack);
			}
		}

		return {
			success: successCount > 0,
			success_count: successCount,
			failed_count: failedDetails.length,
			failed_details: failedDetails.length > 0 ? failedDetails : undefined,
		};
	}

	/**
	 * Batch retry push notifications (push disabled in source-available version; marks records as wait_upload)
	 */
	async batchRetry(dto: BatchRetryDto): Promise<BatchOperationResultDto> {
		const { ids } = dto;

		if (ids.length === 0) {
			throw new BadRequestException("ID list cannot be empty");
		}

		const failedDetails: Array<{ id: number; error: string }> = [];
		let successCount = 0;

		for (const id of ids) {
			try {
				const log = await prisma.user_device_log.findUnique({ where: { id } });

				if (!log || log.is_deleted) {
					failedDetails.push({ id, error: "Log record not found or deleted" });
					continue;
				}

				await prisma.user_device_log.update({
					where: { id },
					data: { log_status: "wait_upload", updated_at: new Date() },
				});

				successCount++;
			} catch (error) {
				failedDetails.push({ id, error: error.message || "Retry failed" });
				this.logger.error(`Retry failed, log ID: ${id}`, {}, error.stack);
			}
		}

		return {
			success: successCount > 0,
			success_count: successCount,
			failed_count: failedDetails.length,
			failed_details: failedDetails.length > 0 ? failedDetails : undefined,
		};
	}
}
