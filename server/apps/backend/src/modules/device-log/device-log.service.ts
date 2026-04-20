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
	 * 查询日志列表（分页）
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

		// 构建查询条件
		const where: any = {
			is_deleted: false,
		};

		if (user_id) {
			where.user_id = user_id;
		}

		if (log_status && log_status.length > 0) {
			where.log_status = { in: log_status };
		}

		// 查询总数
		const total = await prisma.user_device_log.count({ where });

		// 计算偏移量
		const skip = (page - 1) * limit;

		// 查询数据
		const logs = await prisma.user_device_log.findMany({
			where,
			skip,
			take: limit,
			orderBy: {
				[sort]: order,
			},
		});

		// 查询用户信息
		const userIds = logs.map((log) => log.user_id);
		const users = (await prisma.users.findMany({
			where: { id: { in: userIds } },
			select: { id: true, phoneNumber: true },
		})) as { id: number; phoneNumber: string | null }[];

		const userMap = new Map(users.map((u) => [u.id, u]));

		// 转换为 DTO
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

		// 计算总页数
		const total_pages = Math.ceil(total / limit);

		this.logger.log(
			`查询日志列表，total: ${total}, page: ${page}, limit: ${limit}`,
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
	 * 获取单条日志详情
	 */
	async getDeviceLogDetail(id: number): Promise<DeviceLogDto> {
		const log = await prisma.user_device_log.findUnique({
			where: { id },
		});

		if (!log || log.is_deleted) {
			throw new NotFoundException(`日志记录不存在，ID: ${id}`);
		}

		// 查询用户信息
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
	 * 获取日志文件的签名 URL
	 */
	async getSignedUrl(id: number): Promise<SignedUrlDto> {
		const log = await prisma.user_device_log.findUnique({
			where: { id },
		});

		if (!log || log.is_deleted) {
			return {
				success: false,
				error: "日志记录不存在",
			};
		}

		if (!log.log_uri) {
			return {
				success: false,
				error: "日志文件尚未上传",
			};
		}

		try {
			// 调用 TosService 生成签名 URL
			const signedUrl = await this.tosService.getOssSignedUrl(
				log.log_uri,
				3600,
			);

			this.logger.log(`生成签名 URL 成功，日志 ID: ${id}`);

			return {
				success: true,
				url: signedUrl,
			};
		} catch (error) {
			this.logger.error(`生成签名 URL 失败，日志 ID: ${id}`, {}, error.stack);
			return {
				success: false,
				error: error.message || "生成签名 URL 失败",
			};
		}
	}

	/**
	 * 批量删除日志记录（软删除）
	 */
	async batchDelete(dto: BatchDeleteDto): Promise<BatchOperationResultDto> {
		const { ids } = dto;

		if (ids.length === 0) {
			throw new BadRequestException("ID 列表不能为空");
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
						error: "日志记录不存在或已删除",
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
				this.logger.log(`删除日志记录成功，ID: ${id}`);
			} catch (error) {
				failedDetails.push({
					id,
					error: error.message || "删除失败",
				});
				this.logger.error(`删除日志记录失败，ID: ${id}`, {}, error.stack);
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
	 * 批量重试推送（push disabled in open-source version — marks records as wait_upload）
	 */
	async batchRetry(dto: BatchRetryDto): Promise<BatchOperationResultDto> {
		const { ids } = dto;

		if (ids.length === 0) {
			throw new BadRequestException("ID 列表不能为空");
		}

		const failedDetails: Array<{ id: number; error: string }> = [];
		let successCount = 0;

		for (const id of ids) {
			try {
				const log = await prisma.user_device_log.findUnique({ where: { id } });

				if (!log || log.is_deleted) {
					failedDetails.push({ id, error: "日志记录不存在或已删除" });
					continue;
				}

				await prisma.user_device_log.update({
					where: { id },
					data: { log_status: "wait_upload", updated_at: new Date() },
				});

				successCount++;
			} catch (error) {
				failedDetails.push({ id, error: error.message || "重试失败" });
				this.logger.error(`重试失败，日志 ID: ${id}`, {}, error.stack);
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
