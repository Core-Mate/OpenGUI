import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	forwardRef,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
	type OnModuleInit,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ModuleRef } from "@nestjs/core";
import type { Queue } from "bullmq";
import { LeaseService } from "../../common/lease/lease.service";
import { RedisService } from "../../common/redis/redis.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
	CallUserResponse,
	type CancelExecutionResult,
	GraphRunnerService,
} from "../graph-agent/graph-runner.service";
import { TaskMemoryService } from "../graph-agent/memory/task-memory.service";
import { PostgresStoreService } from "../graph-agent/store/postgres-store.service";
import { ExecuteTaskDto } from "./dto/execute-task.dto";
import { ForkExecutionDto } from "./dto/fork-execution.dto";
import { ResumeExecutionDto } from "./dto/resume-execution.dto";
import {
	BatchHeartbeatResponseDto,
	CancelAllExecutionsResponseDto,
	CreateFeedbackDto,
	ExecuteTaskResponseDto,
	ExecutionActionResponseDto,
	ExecutionHistoryQueryDto,
	FeedbackResponseDto,
	ForkExecutionResponseDto,
	HeartbeatResponseDto,
	PaginatedExecutionHistoryDto,
	TaskExecutionResponseDto,
} from "./dto/task-execution-response.dto";
import {
	mapPrismaToExecutionEntity,
	TaskExecutionEntity,
} from "./entities/task-execution.entity";
import {
	ExecutionMode,
	ExecutionResult,
	ExecutionStatus,
} from "./enums/task.enums";
import { CreditsService } from "../credits/credits.service";
import { TaskService } from "./task.service";
import {
	PENDING_TIMEOUT_QUEUE,
	type PendingTimeoutJobData,
} from "./pending-timeout.processor";
import { EXECUTION_EVENTS } from "../../common/events/execution-events";

@Injectable()
export class TaskExecutionService implements OnModuleInit {
	private readonly logger = new Logger(TaskExecutionService.name);

	private executionGateway: any = null;
	private executionSocketService: any = null;

	constructor(
		private readonly prismaService: PrismaService,
		private readonly taskService: TaskService,
		private readonly leaseService: LeaseService,
		@Inject(forwardRef(() => GraphRunnerService))
		private readonly graphRunnerService: GraphRunnerService,
		private readonly postgresStoreService: PostgresStoreService,
		private readonly taskMemoryService: TaskMemoryService,
		private readonly redisService: RedisService,
		private readonly moduleRef: ModuleRef,
		@InjectQueue(PENDING_TIMEOUT_QUEUE)
		private readonly pendingTimeoutQueue: Queue<PendingTimeoutJobData>,
		private readonly creditsService: CreditsService,
		private readonly eventEmitter: EventEmitter2,
	) {}

	async onModuleInit() {
		try {
			// Resolve ExecutionGateway lazily to break circular dependency
			// (ExecutionGateway imports TaskExecutionService, so we can't import it at compile time)
			const wsModule = await import("../../common/ws/execution.gateway.js");
			this.executionGateway = this.moduleRef.get(wsModule.ExecutionGateway, {
				strict: false,
			});
			this.logger.log("ExecutionGateway resolved via ModuleRef");
		} catch {
			this.logger.warn(
				"ExecutionGateway not available — WS notifications disabled",
			);
		}

		try {
			const socketModule = await import(
				"../../common/ws/execution-socket.service.js"
			);
			this.executionSocketService = this.moduleRef.get(
				socketModule.ExecutionSocketService,
				{ strict: false },
			);
			this.logger.log("ExecutionSocketService resolved via ModuleRef");
		} catch {
			this.logger.warn("ExecutionSocketService not available");
		}
	}

	/**
	 * 执行任务
	 */
	async executeTask(
		taskId: number,
		userId: number,
		dto: ExecuteTaskDto,
	): Promise<ExecuteTaskResponseDto> {
		this.logger.log(`Executing task ${taskId} for user ${userId}`);

		// [幂等校验] 3秒内同一用户同一任务只允许触发一次执行
		const idempotencyKey = `execute:${userId}:${taskId}`;
		const acquired = await this.redisService
			.getClient()
			.set(idempotencyKey, "1", "PX", 3000, "NX");
		if (!acquired) {
			this.logger.warn(
				`[IDEMPOTENT] Duplicate execute request blocked: user=${userId}, task=${taskId}`,
			);
			throw new ConflictException(
				"请求过于频繁，请稍后再试",
			);
		}

		// [防抖机制] 并发取消用户所有正在运行的任务
		const activeExecutions = await this.getActiveExecutionsByUserId(userId);
		if (activeExecutions.length > 0) {
			this.logger.log(
				`[DEBOUNCE] User ${userId} has ${activeExecutions.length} active execution(s), cancelling concurrently...`,
			);
			const cancelResults = await Promise.allSettled(
				activeExecutions.map((execution) =>
					this.cancelExecutionInternal(execution.id, userId, execution.taskId),
				),
			);
			// 记录取消结果
			cancelResults.forEach((result, index) => {
				const executionId = activeExecutions[index].id;
				if (result.status === "fulfilled" && result.value) {
					this.logger.log(`[DEBOUNCE] Cancelled execution ${executionId}`);
				} else if (result.status === "rejected") {
					this.logger.warn(
						`[DEBOUNCE] Failed to cancel execution ${executionId}: ${result.reason}`,
					);
				}
			});
		}

		// 获取任务信息
		const task = await this.taskService.getTaskEntity(taskId);
		if (!task) {
			throw new NotFoundException(`Task ${taskId} not found`);
		}

		if (task.userId !== 0 && task.userId !== userId && !task.isTemplate) {
			throw new ForbiddenException("No permission to execute this task");
		}

		// 获取用户 region 和 tenant_id
		const user = await this.prismaService.users.findUnique({
			where: { id: userId },
			select: { region: true, tenant_id: true },
		});
		const userRegion = user?.region || "CN";
		const tenantId = user?.tenant_id ?? -1;

		// 创建执行记录（PENDING 状态，等待客户端 WS 就绪后启动）
		const execution = await this.prismaService.task_execution.create({
			data: {
				task_id: taskId,
				user_id: userId,
				device_id: dto.deviceId,
				execution_mode: dto.executionMode || ExecutionMode.IMMEDIATE,
				execution_status: ExecutionStatus.PENDING,
			},
		});

		this.logger.log(`Created execution ${execution.id} for task ${taskId} (PENDING)`);

		// 创建租约（心跳机制）
		await this.leaseService.createLease(execution.id, userId, taskId);

		// 设置 PENDING 超时保护（30s 内未收到 execution:ready 则自动失败）
		try {
			await this.pendingTimeoutQueue.add(
				`pending-timeout-${execution.id}`,
				{ executionId: execution.id },
				{ delay: 30_000, jobId: `pending-timeout-${execution.id}`, removeOnComplete: true, removeOnFail: true },
			);
		} catch (e) {
			this.logger.warn(
				`Failed to schedule pending timeout for execution ${execution.id}: ${(e as Error).message}`,
			);
		}

		return {
			success: true,
			executionId: execution.id,
			taskId: taskId,
			message: "Execution created, waiting for WS ready signal",
		};
	}

	/**
	 * 启动执行（两阶段启动的第二阶段）
	 *
	 * 由 ExecutionGateway 在收到 execution:ready 后调用。
	 * 将状态从 PENDING → RUNNING 并异步启动 GraphRunner。
	 */
	async startExecution(executionId: number): Promise<void> {
		// 查询 execution 并验证状态
		const execution = await this.prismaService.task_execution.findUnique({
			where: { id: executionId },
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}

		// 移除 PENDING 超时任务（执行已成功启动）
		try {
			const job = await this.pendingTimeoutQueue.getJob(`pending-timeout-${executionId}`);
			if (job) await job.remove();
		} catch {
			// Best effort — job may have already fired or been removed
		}

		// 获取任务信息
		const task = await this.taskService.getTaskEntity(execution.task_id);
		if (!task) {
			throw new NotFoundException(`Task ${execution.task_id} not found`);
		}

		const taskDescription = task.taskDescription || task.taskName;

		// 获取用户 region 和 tenant_id
		const user = await this.prismaService.users.findUnique({
			where: { id: execution.user_id },
			select: { region: true, tenant_id: true },
		});
		const userRegion = user?.region || "CN";
		const tenantId = user?.tenant_id ?? -1;

		// === 积分余额预检 ===
		try {
			const balance = await this.creditsService.getBalance(execution.user_id);
			if (balance.remaining <= 0) {
				await this.completeExecution(
					executionId,
					ExecutionResult.FAILED,
					"积分不足，请充值后再试",
				);
				this.logger.warn(
					`[START EXECUTION] Execution ${executionId} rejected: insufficient balance (${balance.remaining})`,
				);
				return;
			}
			if (balance.remaining < 450) {
				this.logger.warn(
					`[START EXECUTION] Low balance warning for execution ${executionId}: ${balance.remaining} credits (< 450)`,
				);
			}
		} catch (balanceError) {
			this.logger.warn(
				`[START EXECUTION] Failed to check balance for execution ${executionId}: ${(balanceError as Error).message}`,
			);
			// Don't block execution on balance check failure
		}

		// 原子 CAS：只有 PENDING 状态才能转为 RUNNING
		const casResult = await this.prismaService.task_execution.updateMany({
			where: { id: executionId, execution_status: ExecutionStatus.PENDING },
			data: {
				execution_status: ExecutionStatus.RUNNING,
				started_at: execution.started_at ?? new Date(),
				updated_at: new Date(),
			},
		});
		if (casResult.count === 0) {
			const cur = await this.prismaService.task_execution.findUnique({
				where: { id: executionId },
				select: { execution_status: true },
			});
			throw new BadRequestException(
				`Cannot start execution ${executionId}: status is ${cur?.execution_status ?? "NOT_FOUND"}, expected PENDING`,
			);
		}

		this.logger.log(
			`[START EXECUTION] Starting execution ${executionId} for task ${execution.task_id}`,
		);

		// Pre-register so cancel can find it before setImmediate fires
		this.graphRunnerService.preRegisterExecution(executionId);

		// 后台异步执行任务
		setImmediate(async () => {
			try {
				const result = await this.graphRunnerService.executeTask({
					userId: execution.user_id,
					taskId: execution.task_id,
					taskExecutionId: executionId,
					userInput: taskDescription,
					userRegion,
					tenantId,
				});

				if (result.hitl_reason) {
					// Check if billing code already set SUSPENDED with specific message
					const currentExec = await this.prismaService.task_execution.findUnique({
						where: { id: executionId },
						select: { execution_status: true, status_message: true },
					});
					if (currentExec?.execution_status !== ExecutionStatus.SUSPENDED) {
						await this.updateExecutionStatus(
							executionId,
							ExecutionStatus.SUSPENDED,
							result.hitl_reason,
						);
					}
					this.logger.log(
						`[START EXECUTION] Execution ${executionId} suspended: ${currentExec?.status_message || result.hitl_reason}`,
					);
				} else if (result.cancelled) {
					if (result.abortReason === "lease_expired") {
						await this.completeExecution(
							executionId,
							ExecutionResult.CANCELLED,
							"Lease expired",
						);
						this.logger.log(
							`[START EXECUTION] Execution ${executionId} terminated due to lease expiration`,
						);
					} else {
						this.logger.log(
							`[START EXECUTION] Execution ${executionId} was cancelled (reason: ${result.abortReason}, status update delegated)`,
						);
					}
				} else if (result.success) {
					if (result.summary) {
						await this.updateExecutionResultSummary(
							executionId,
							result.summary,
						);
					}
					await this.completeExecution(executionId, ExecutionResult.SUCCEED);
					this.logger.log(
						`[START EXECUTION] Execution ${executionId} completed successfully`,
					);
				} else {
					await this.completeExecution(
						executionId,
						ExecutionResult.FAILED,
						result.error,
					);
					this.logger.error(
						`[START EXECUTION] Execution ${executionId} failed: ${result.error}`,
					);
				}
			} catch (error) {
				await this.completeExecution(
					executionId,
					ExecutionResult.FAILED,
					error.message,
				);
				this.logger.error(
					`[START EXECUTION] Execution ${executionId} error: ${error.message}`,
					error.stack,
				);
			}
		});
	}

	/**
	 * 启动 Fork 执行（由 ExecutionGateway 在收到 execution:ready 时，
	 * 检测到 origin_execution_id 后调用）
	 */
	async startForkExecution(executionId: number): Promise<void> {
		const execution = await this.prismaService.task_execution.findUnique({
			where: { id: executionId },
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}

		if (!execution.origin_execution_id) {
			throw new BadRequestException(
				`Execution ${executionId} is not a fork (no origin_execution_id)`,
			);
		}

		// Remove pending timeout job
		try {
			const job = await this.pendingTimeoutQueue.getJob(`pending-timeout-${executionId}`);
			if (job) await job.remove();
		} catch {
			// Best effort
		}

		// Get user info
		const user = await this.prismaService.users.findUnique({
			where: { id: execution.user_id },
			select: { region: true, tenant_id: true },
		});
		const userRegion = user?.region || "CN";
		const tenantId = user?.tenant_id ?? -1;

		// === 积分余额预检 ===
		try {
			const balance = await this.creditsService.getBalance(execution.user_id);
			if (balance.remaining <= 0) {
				await this.completeExecution(
					executionId,
					ExecutionResult.FAILED,
					"积分不足，请充值后再试",
				);
				this.logger.warn(
					`[START FORK EXECUTION] Execution ${executionId} rejected: insufficient balance (${balance.remaining})`,
				);
				return;
			}
			if (balance.remaining < 450) {
				this.logger.warn(
					`[START FORK EXECUTION] Low balance warning for execution ${executionId}: ${balance.remaining} credits (< 450)`,
				);
			}
		} catch (balanceError) {
			this.logger.warn(
				`[START FORK EXECUTION] Failed to check balance for execution ${executionId}: ${(balanceError as Error).message}`,
			);
			// Don't block execution on balance check failure
		}

		// Get instruction from status_message (stored by forkExecution)
		const instruction = execution.status_message || undefined;

		// 原子 CAS：只有 PENDING 状态才能转为 RUNNING
		const casResult = await this.prismaService.task_execution.updateMany({
			where: { id: executionId, execution_status: ExecutionStatus.PENDING },
			data: {
				execution_status: ExecutionStatus.RUNNING,
				started_at: execution.started_at ?? new Date(),
				updated_at: new Date(),
			},
		});
		if (casResult.count === 0) {
			const cur = await this.prismaService.task_execution.findUnique({
				where: { id: executionId },
				select: { execution_status: true },
			});
			throw new BadRequestException(
				`Cannot start fork execution ${executionId}: status is ${cur?.execution_status ?? "NOT_FOUND"}, expected PENDING`,
			);
		}

		this.logger.log(
			`[START FORK EXECUTION] Starting fork execution ${executionId} from origin ${execution.origin_execution_id}`,
		);

		// Pre-register so cancel can find it before setImmediate fires
		this.graphRunnerService.preRegisterExecution(executionId);

		setImmediate(async () => {
			try {
				const result = await this.graphRunnerService.forkExecution({
					userId: execution.user_id,
					taskId: execution.task_id,
					taskExecutionId: executionId,
					originExecutionId: execution.origin_execution_id!,
					instruction,
					userRegion,
					tenantId,
				});

				if (result.hitl_reason) {
					// Check if billing code already set SUSPENDED with specific message
					const currentExec = await this.prismaService.task_execution.findUnique({
						where: { id: executionId },
						select: { execution_status: true, status_message: true },
					});
					if (currentExec?.execution_status !== ExecutionStatus.SUSPENDED) {
						await this.updateExecutionStatus(
							executionId,
							ExecutionStatus.SUSPENDED,
							result.hitl_reason,
						);
					}
					this.logger.log(
						`[START FORK EXECUTION] Execution ${executionId} suspended: ${currentExec?.status_message || result.hitl_reason}`,
					);
				} else if (result.cancelled) {
					if (result.abortReason === "lease_expired") {
						await this.completeExecution(
							executionId,
							ExecutionResult.CANCELLED,
							"Lease expired",
						);
					} else {
						this.logger.log(
							`[START FORK EXECUTION] Execution ${executionId} was cancelled (reason: ${result.abortReason})`,
						);
					}
				} else if (result.success) {
					if (result.summary) {
						await this.updateExecutionResultSummary(
							executionId,
							result.summary,
						);
					}
					await this.completeExecution(
						executionId,
						ExecutionResult.SUCCEED,
					);
				} else {
					await this.completeExecution(
						executionId,
						ExecutionResult.FAILED,
						result.error,
					);
				}
			} catch (error) {
				await this.completeExecution(
					executionId,
					ExecutionResult.FAILED,
					error.message,
				);
				this.logger.error(
					`[START FORK EXECUTION] Execution ${executionId} error: ${error.message}`,
					error.stack,
				);
			}
		});
	}

	/**
	 * 启动 Resume 执行（由 ExecutionGateway 在收到 execution:ready 时，
	 * 检测到 status_message 为 resume_hitl:* 或 resume_pause:* 后调用）
	 */
	async startResumeExecution(
		executionId: number,
		resumeType: "hitl" | "pause",
	): Promise<void> {
		const execution = await this.prismaService.task_execution.findUnique({
			where: { id: executionId },
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}

		// Remove pending timeout job
		try {
			const job = await this.pendingTimeoutQueue.getJob(`pending-timeout-${executionId}`);
			if (job) await job.remove();
		} catch {
			// Best effort
		}

		// 原子 CAS：只有 PENDING 状态才能转为 RUNNING
		const casResult = await this.prismaService.task_execution.updateMany({
			where: { id: executionId, execution_status: ExecutionStatus.PENDING },
			data: {
				execution_status: ExecutionStatus.RUNNING,
				updated_at: new Date(),
			},
		});
		if (casResult.count === 0) {
			const cur = await this.prismaService.task_execution.findUnique({
				where: { id: executionId },
				select: { execution_status: true },
			});
			throw new BadRequestException(
				`Cannot start resume ${executionId}: status is ${cur?.execution_status ?? "NOT_FOUND"}, expected PENDING`,
			);
		}

		this.logger.log(
			`[START RESUME] Starting ${resumeType} resume for execution ${executionId}`,
		);

		// Pre-register so cancel can find it before setImmediate fires
		this.graphRunnerService.preRegisterExecution(executionId);

		setImmediate(async () => {
			try {
				let result;
				if (resumeType === "hitl") {
					// Retrieve stored feedback from status_message
					const feedbackStr = execution.status_message || "";
					const feedback = feedbackStr.startsWith("resume_hitl:")
						? feedbackStr.slice("resume_hitl:".length)
						: "";
					const response: CallUserResponse = { feedback };
					result = await this.graphRunnerService.resumeExecution(
						execution.task_id,
						executionId,
						response,
					);
				} else {
					// Retrieve stored feedback from status_message for pause-resume
					const feedbackStr = execution.status_message || "";
					const pauseFeedback = feedbackStr.startsWith("resume_pause:")
						? feedbackStr.slice("resume_pause:".length)
						: "";

					// 存储 feedback 到长期记忆
					const trimmedFeedback = pauseFeedback.trim();
					if (trimmedFeedback) {
						void (async () => {
							try {
								const task = await this.taskService.getTaskEntity(execution.task_id);
								const userInput = task?.taskDescription || task?.taskName || "";

								const store = this.postgresStoreService.getStore();
								await this.taskMemoryService.storeMemory(store, {
									taskId: execution.task_id,
									executionId,
									source: "feedback",
									content: trimmedFeedback,
									userInput,
									userId: execution.user_id,
								});
							} catch (error) {
								this.logger.warn(
									`Failed to store pause-resume feedback memory: ${(error as Error).message}`,
								);
							}
						})();
					}

					result = await this.graphRunnerService.resumeFromPause(
						execution.task_id,
						executionId,
						execution.user_id,
						pauseFeedback || undefined,
					);
				}

				if (result.hitl_reason) {
					// Check if billing code already set SUSPENDED with specific message
					const currentExec = await this.prismaService.task_execution.findUnique({
						where: { id: executionId },
						select: { execution_status: true, status_message: true },
					});
					if (currentExec?.execution_status !== ExecutionStatus.SUSPENDED) {
						await this.updateExecutionStatus(
							executionId,
							ExecutionStatus.SUSPENDED,
							result.hitl_reason,
						);
					}
					this.logger.log(
						`[START RESUME] Execution ${executionId} suspended: ${currentExec?.status_message || result.hitl_reason}`,
					);
				} else if (result.cancelled) {
					if (result.abortReason === "lease_expired") {
						await this.completeExecution(
							executionId,
							ExecutionResult.CANCELLED,
							"Lease expired",
						);
					} else {
						this.logger.log(
							`[START RESUME] Execution ${executionId} was cancelled (reason: ${result.abortReason})`,
						);
					}
				} else if (result.success) {
					if (result.summary) {
						await this.updateExecutionResultSummary(
							executionId,
							result.summary,
						);
					}
					await this.completeExecution(
						executionId,
						ExecutionResult.SUCCEED,
					);
				} else {
					await this.completeExecution(
						executionId,
						ExecutionResult.FAILED,
						result.error,
					);
				}
			} catch (error) {
				await this.completeExecution(
					executionId,
					ExecutionResult.FAILED,
					error.message,
				);
				this.logger.error(
					`[START RESUME] Execution ${executionId} error: ${error.message}`,
					error.stack,
				);
			}
		});
	}

	/**
	 * 获取任务的执行历史
	 */
	async getExecutionHistory(
		taskId: number,
		userId: number,
		query: ExecutionHistoryQueryDto,
	): Promise<PaginatedExecutionHistoryDto> {
		// 验证任务存在且属于用户
		const task = await this.taskService.getTaskEntity(taskId);
		if (!task) {
			throw new NotFoundException(`Task ${taskId} not found`);
		}
		if (task.userId !== userId) {
			throw new ForbiddenException("No permission to access this task");
		}

		const page = query.page || 1;
		const pageSize = query.pageSize || 20;
		const skip = (page - 1) * pageSize;

		const where: any = {
			task_id: taskId,
			//todo:先不限制 execution_status: ExecutionStatus.FINISHED,
			is_deleted: false,
		};

		if (query.status) {
			where.execution_status = query.status;
		}

		if (query.result) {
			where.execution_result = query.result;
		}

		const [total, executions] = await Promise.all([
			this.prismaService.task_execution.count({ where }),
			this.prismaService.task_execution.findMany({
				where,
				orderBy: { created_at: "desc" },
				skip,
				take: pageSize,
			}),
		]);

		const items = executions.map((e) =>
			this.mapEntityToResponse(mapPrismaToExecutionEntity(e)),
		);

		return {
			items,
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	/**
	 * 内部查询 execution 记录（不做权限校验，供 Gateway 等内部调用使用）
	 */
	async getExecutionRecord(executionId: number): Promise<TaskExecutionEntity | null> {
		const raw = await this.prismaService.task_execution.findUnique({
			where: { id: executionId },
		});
		if (!raw) return null;
		return mapPrismaToExecutionEntity(raw);
	}

	/**
	 * 获取执行记录详情
	 */
	async getExecutionById(
		executionId: number,
		userId: number,
	): Promise<TaskExecutionResponseDto> {
		const execution = await this.prismaService.task_execution.findFirst({
			where: {
				id: executionId,
				is_deleted: false,
			},
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}

		if (execution.user_id !== userId) {
			throw new ForbiddenException("No permission to access this execution");
		}

		return this.mapEntityToResponse(mapPrismaToExecutionEntity(execution));
	}

	/**
	 * 更新执行状态（工作流回调）
	 */
	async updateExecutionStatus(
		executionId: number,
		status: ExecutionStatus,
		message?: string,
		currentStep?: string,
	): Promise<void> {
		const updateData: any = {
			execution_status: status,
			updated_at: new Date(),
		};

		if (message) {
			updateData.status_message = message;
		}

		if (currentStep) {
			updateData.current_step = currentStep;
		}

		if (status === ExecutionStatus.RUNNING) {
			// 仅在首次运行时设置 started_at，恢复执行时不覆盖
			const execution = await this.prismaService.task_execution.findUnique({
				where: { id: executionId },
				select: { started_at: true },
			});
			if (!execution?.started_at) {
				updateData.started_at = new Date();
			}
		}

		await this.prismaService.task_execution.update({
			where: { id: executionId },
			data: updateData,
		});

		this.logger.log(`Updated execution ${executionId} status to ${status}`);

		// 当状态变为 SUSPENDED 时发出通知事件（通知 IM Channel 模块）
		if (status === ExecutionStatus.SUSPENDED && message) {
			try {
				const execution = await this.prismaService.task_execution.findUnique({
					where: { id: executionId },
					select: { user_id: true },
				});
				if (execution) {
					this.eventEmitter.emit(EXECUTION_EVENTS.SUSPENDED, {
						executionId,
						userId: execution.user_id,
						reason: message,
					});
				}
			} catch {
				// 通知失败不影响主流程
			}
		}
	}

	/**
	 * 更新执行结果摘要
	 */
	async updateExecutionResultSummary(
		executionId: number,
		summary: string,
	): Promise<void> {
		await this.prismaService.task_execution.update({
			where: { id: executionId },
			data: {
				execution_result_summary: summary,
				updated_at: new Date(),
			},
		});

		this.logger.log(`Updated execution ${executionId} result summary`);
	}

	/**
	 * 完成执行（更新结果和统计）
	 *
	 * 使用数据库级别的原子操作（CAS）确保状态转换只发生一次，
	 * 并使用精确计算（而非增量更新）来更新统计，确保幂等性。
	 */
	async completeExecution(
		executionId: number,
		result: ExecutionResult,
		errorMessage?: string,
		tokenUsage?: Record<string, any>,
	): Promise<void> {
		// 使用原子更新：只有当状态不是 FINISHED 时才更新
		// 这避免了竞态条件导致的重复统计更新
		const updateResult = await this.prismaService.task_execution.updateMany({
			where: {
				id: executionId,
				execution_status: { not: ExecutionStatus.FINISHED },
			},
			data: {
				execution_status: ExecutionStatus.FINISHED,
				execution_result: result,
				error_message: errorMessage,
				...(errorMessage ? { status_message: errorMessage } : {}),
				finished_at: new Date(),
				...(tokenUsage !== undefined ? { token_usage: tokenUsage } : {}),
				updated_at: new Date(),
			},
		});

		// 如果没有更新任何记录，说明执行已经完成或不存在
		if (updateResult.count === 0) {
			this.logger.log(
				`Execution ${executionId} already completed or not found, skipping duplicate completion`,
			);
			// 兜底：如果已是 FINISHED 但 finished_at 为空，补写一次
			await this.ensureFinishedAt(executionId, "completeExecution");
			return;
		}

		// 获取任务ID用于更新统计（更新成功后才需要）
		const execution = await this.prismaService.task_execution.findUnique({
			where: { id: executionId },
			select: { task_id: true },
		});

		if (!execution) {
			this.logger.warn(`Execution ${executionId} not found after update`);
			return;
		}

		// 释放租约
		await this.leaseService.releaseLease(executionId);

		// 使用精确计算更新任务统计（幂等操作）
		// 即使多次调用也能保证统计准确
		await this.taskService.syncTaskStats(execution.task_id);

		// Notify client via WebSocket
		try {
			if (this.executionGateway) {
				if (result === ExecutionResult.FAILED) {
					this.executionGateway.sendExecutionError(
						executionId,
						errorMessage || "Execution failed",
					);
				} else {
					this.executionGateway.sendExecutionFinished(executionId, {
						status: result,
						message: errorMessage,
					});
				}
			}
		} catch (wsError) {
			this.logger.warn(
				`Failed to send WS notification for execution ${executionId}: ${(wsError as Error).message}`,
			);
		}

		this.logger.log(`Completed execution ${executionId} with result ${result}`);

		// 通知 IM Channel 模块（异步，不影响主流程）
		try {
			const execForNotify = await this.prismaService.task_execution.findUnique({
				where: { id: executionId },
				select: { user_id: true, execution_result_summary: true },
			});
			if (execForNotify) {
				this.eventEmitter.emit(EXECUTION_EVENTS.FINISHED, {
					executionId,
					userId: execForNotify.user_id,
					result,
					summary: execForNotify.execution_result_summary,
					errorMessage,
				});
			}
		} catch {
			// 通知失败不影响主流程
		}
	}

	/**
	 * 内部取消执行方法（供防抖机制调用，不抛出异常）
	 *
	 * 使用原子操作先更新状态，防止重复取消
	 */
	private async cancelExecutionInternal(
		executionId: number,
		userId: number,
		taskId: number,
	): Promise<boolean> {
		try {
			// 【原子操作】立即更新状态为 FINISHED + CANCELLED，防止重复取消
			const updateResult = await this.prismaService.task_execution.updateMany({
				where: {
					id: executionId,
					is_deleted: false,
					execution_status: {
						in: [
							ExecutionStatus.INITIAL,
							ExecutionStatus.PENDING,
							ExecutionStatus.RUNNING,
							ExecutionStatus.SUSPENDED,
							ExecutionStatus.USER_PAUSED,
						],
					},
				},
				data: {
					execution_status: ExecutionStatus.FINISHED,
					execution_result: ExecutionResult.CANCELLED,
					status_message: "Auto-cancelled due to new task execution",
					finished_at: new Date(),
					updated_at: new Date(),
				},
			});

			if (updateResult.count === 0) {
				this.logger.log(
					`[CANCEL INTERNAL] Execution ${executionId} already cancelled or finished, skipping`,
				);
				return false;
			}

			// 释放租约
			await this.leaseService.releaseLease(executionId);

			// 同步任务统计
			await this.taskService.syncTaskStats(taskId);

			// 调用 GraphRunner 取消（跳过总结生成，因为是启动新任务触发的取消）
			// 先尝试本地实例，不存在则中继到其他实例
			let cancelResult: CancelExecutionResult;
			if (this.graphRunnerService.hasExecution(executionId)) {
				cancelResult = await this.graphRunnerService.cancelExecution(
					executionId,
					userId,
					taskId,
					true,
				);
			} else if (this.executionGateway) {
				cancelResult = await this.executionGateway.relayCancelExecution(
					executionId,
					userId,
					taskId,
					true,
				);
			} else {
				cancelResult = { success: false, error: "No gateway available for relay" };
			}

			if (!cancelResult.success) {
				this.logger.warn(
					`[CANCEL INTERNAL] Failed to cancel graph execution ${executionId}: ${cancelResult.error}`,
				);
			}

			this.logger.log(
				`[CANCEL INTERNAL] Successfully cancelled execution ${executionId}`,
			);
			return true;
		} catch (error) {
			this.logger.error(
				`[CANCEL INTERNAL] Error cancelling execution ${executionId}: ${error.message}`,
				error.stack,
			);
			return false;
		}
	}

	/**
	 * 取消执行（异步模式）
	 *
	 * API 立即返回，后台异步执行：
	 * 1. 验证权限和状态
	 * 2. 立即返回 { success: true }
	 * 3. 后台：abort GraphRunner → 运行 summarizer（通过 WS 流式推送）→ 更新 FINISHED+CANCELLED → 发送 WS 通知
	 *
	 * 总结内容通过 WS agent:event 实时流式推送给客户端，无需等待 HTTP 响应。
	 */
	async cancelExecution(
		executionId: number,
		userId: number,
	): Promise<ExecutionActionResponseDto> {
		const execution = await this.prismaService.task_execution.findFirst({
			where: {
				id: executionId,
				is_deleted: false,
			},
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}

		if (execution.user_id !== userId) {
			throw new ForbiddenException("No permission to cancel this execution");
		}

		// 已在取消中（SUMMARIZING），直接返回成功
		if (execution.execution_status === ExecutionStatus.SUMMARIZING) {
			return {
				success: true,
				message: "Execution is already being cancelled",
			};
		}

		// 检查状态是否可取消
		const cancellableStatuses = [
			ExecutionStatus.PENDING,
			ExecutionStatus.RUNNING,
			ExecutionStatus.SUSPENDED,
			ExecutionStatus.USER_PAUSED,
		];

		if (
			!cancellableStatuses.includes(
				execution.execution_status as ExecutionStatus,
			)
		) {
			throw new BadRequestException(
				`Cannot cancel execution in ${execution.execution_status} status`,
			);
		}

		// 后台异步执行取消 + 总结生成，API 立即返回
		this.cancelAndSummarizeInBackground(executionId, userId, execution.task_id);

		return {
			success: true,
			message: "Cancellation initiated",
		};
	}

	/**
	 * 后台异步执行取消 + 总结生成
	 *
	 * 流程：
	 * 1. 调用 GraphRunner 取消（abort + summarizer）
	 * 2. CAS 更新状态为 FINISHED+CANCELLED
	 * 3. 释放租约 + 同步统计
	 * 4. 发送 execution:finished WS 通知（关键：确保客户端收到终态）
	 *
	 * 包含 SUMMARIZING 超时保护（60s），防止卡死。
	 */
	private cancelAndSummarizeInBackground(
		executionId: number,
		userId: number,
		taskId: number,
	): void {
		setImmediate(async () => {
			try {
				// 设置 SUMMARIZING 超时保护（60s）
				try {
					await this.pendingTimeoutQueue.add(
						`summarizing-timeout-${executionId}`,
						{ executionId },
						{
							delay: 60_000,
							jobId: `summarizing-timeout-${executionId}`,
							removeOnComplete: true,
							removeOnFail: true,
						},
					);
				} catch (e) {
					this.logger.warn(
						`[CANCEL BG] Failed to schedule summarizing timeout for ${executionId}: ${(e as Error).message}`,
					);
				}

				// 调用 GraphRunner 取消（含 summarizer 流式推送）
				let cancelResult: CancelExecutionResult;
				if (this.graphRunnerService.hasExecution(executionId)) {
					cancelResult = await this.graphRunnerService.cancelExecution(
						executionId,
						userId,
						taskId,
					);
				} else if (this.executionGateway) {
					cancelResult = await this.executionGateway.relayCancelExecution(
						executionId,
						userId,
						taskId,
					);
				} else {
					cancelResult = {
						success: false,
						error: "No gateway available for relay",
					};
				}

				if (!cancelResult.success) {
					this.logger.warn(
						`[CANCEL BG] GraphRunner cancel failed for ${executionId}: ${cancelResult.error}`,
					);
				}

				// CAS: SUMMARIZING/可取消状态 → FINISHED+CANCELLED
				const updateResult =
					await this.prismaService.task_execution.updateMany({
						where: {
							id: executionId,
							execution_status: {
								in: [
									ExecutionStatus.SUMMARIZING,
									ExecutionStatus.PENDING,
									ExecutionStatus.RUNNING,
									ExecutionStatus.SUSPENDED,
									ExecutionStatus.USER_PAUSED,
								],
							},
						},
						data: {
							execution_status: ExecutionStatus.FINISHED,
							execution_result: ExecutionResult.CANCELLED,
							execution_result_summary:
								cancelResult.summary || undefined,
							status_message: "Cancelled by user",
							finished_at: new Date(),
							updated_at: new Date(),
						},
					});

				if (updateResult.count === 0) {
					this.logger.log(
						`[CANCEL BG] Execution ${executionId} already finished, skipping status update`,
					);
					await this.ensureFinishedAt(
						executionId,
						"cancelAndSummarizeInBackground",
					);
				} else {
					await this.leaseService.releaseLease(executionId);
					await this.taskService.syncTaskStats(taskId);
					this.logger.log(
						`[CANCEL BG] Execution ${executionId} cancelled successfully`,
					);
				}

				// 发送 WS 终态通知，确保客户端收到
				try {
					this.executionGateway?.sendExecutionFinished(executionId, {
						status: ExecutionResult.CANCELLED,
						message: "Cancelled by user",
					});
				} catch (wsError) {
					this.logger.warn(
						`[CANCEL BG] Failed to send WS finish notification for ${executionId}: ${(wsError as Error).message}`,
					);
				}

				// 移除 SUMMARIZING 超时保护（任务已正常完成）
				try {
					const job = await this.pendingTimeoutQueue.getJob(
						`summarizing-timeout-${executionId}`,
					);
					if (job) await job.remove();
				} catch {
					// Best effort
				}
			} catch (err) {
				this.logger.error(
					`[CANCEL BG] Background cancel failed for ${executionId}: ${(err as Error).message}`,
					(err as Error).stack,
				);
				// 兜底：确保执行不会永远卡在非终态
				try {
					const fallbackUpdate =
						await this.prismaService.task_execution.updateMany({
							where: {
								id: executionId,
								execution_status: {
									not: ExecutionStatus.FINISHED,
								},
							},
							data: {
								execution_status: ExecutionStatus.FINISHED,
								execution_result: ExecutionResult.CANCELLED,
								status_message: "Cancelled (background error)",
								finished_at: new Date(),
								updated_at: new Date(),
							},
						});
					if (fallbackUpdate.count > 0) {
						await this.leaseService.releaseLease(executionId);
						await this.taskService.syncTaskStats(taskId);
					}
				} catch (fallbackErr) {
					this.logger.error(
						`[CANCEL BG] Fallback cleanup also failed for ${executionId}: ${(fallbackErr as Error).message}`,
					);
				}
			}
		});
	}

	/**
	 * 暂停执行
	 */
	async pauseExecution(
		executionId: number,
		userId: number,
	): Promise<ExecutionActionResponseDto> {
		const execution = await this.prismaService.task_execution.findFirst({
			where: {
				id: executionId,
				is_deleted: false,
			},
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}

		if (execution.user_id !== userId) {
			throw new ForbiddenException("No permission to pause this execution");
		}

		if (execution.execution_status !== ExecutionStatus.RUNNING) {
			throw new BadRequestException(
				`Cannot pause execution in ${execution.execution_status} status`,
			);
		}

		// 调用 GraphRunner 暂停
		// 先尝试本地实例，不存在则中继到其他实例
		let paused: boolean;
		if (this.graphRunnerService.hasExecution(executionId)) {
			paused = await this.graphRunnerService.pauseExecution(executionId);
		} else if (this.executionGateway) {
			paused = await this.executionGateway.relayPauseExecution(
				executionId,
				userId,
				execution.task_id,
			);
		} else {
			paused = false;
		}
		if (!paused) {
			this.logger.warn(
				`[PAUSE EXECUTION] Task execution ${executionId} not found in active executions (may have already completed)`,
			);
			return {
				success: false,
				message: "Execution could not be paused (may have already completed)",
			};
		}

		// CAS: 仅当状态仍为 RUNNING 时更新为 USER_PAUSED，防止覆盖 FINISHED 等终态
		const pauseResult = await this.prismaService.task_execution.updateMany({
			where: {
				id: executionId,
				execution_status: ExecutionStatus.RUNNING,
			},
			data: {
				execution_status: ExecutionStatus.USER_PAUSED,
				status_message: "Paused by user",
				updated_at: new Date(),
			},
		});

		if (pauseResult.count === 0) {
			this.logger.warn(
				`[PAUSE EXECUTION] CAS failed for execution ${executionId}, status may have changed`,
			);
			return {
				success: false,
				message: "Execution status changed before pause could be applied",
			};
		}

		return {
			success: true,
			message: "Execution paused successfully",
		};
	}

	/**
	 * 恢复执行
	 * 支持两种场景：
	 * 1. 从用户暂停 (USER_PAUSED) 恢复
	 * 2. 从 HITL 中断 (SUSPENDED) 恢复，需要传入用户响应
	 */
	async resumeExecution(
		executionId: number,
		userId: number,
		dto?: ResumeExecutionDto,
	): Promise<ExecutionActionResponseDto> {
		const execution = await this.prismaService.task_execution.findFirst({
			where: {
				id: executionId,
				is_deleted: false,
			},
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}

		if (execution.user_id !== userId) {
			throw new ForbiddenException("No permission to resume this execution");
		}

		if (
			execution.execution_status !== ExecutionStatus.USER_PAUSED &&
			execution.execution_status !== ExecutionStatus.SUSPENDED
		) {
			throw new BadRequestException(
				`Cannot resume execution in ${execution.execution_status} status`,
			);
		}

		const taskId = execution.task_id;

		// === 积分余额预检（恢复执行前） ===
		try {
			const balance = await this.creditsService.getBalance(userId);
			if (balance.remaining <= 0) {
				throw new BadRequestException("积分不足，请充值后再试");
			}
		} catch (error) {
			if (error instanceof BadRequestException) {
				throw error;
			}
			this.logger.warn(
				`[RESUME] Failed to check balance for execution ${executionId}: ${(error as Error).message}`,
			);
		}

		// Check if WS is connected for this execution
		const wsConnected =
			this.executionSocketService?.isConnected(executionId) ?? true;

		const isHitlResume =
			execution.execution_status === ExecutionStatus.SUSPENDED;

		if (!wsConnected) {
			// WS not connected — use two-phase startup (set to PENDING, wait for execution:ready)
			const casResult = await this.prismaService.task_execution.updateMany({
				where: {
					id: executionId,
					execution_status: execution.execution_status,
				},
				data: {
					execution_status: ExecutionStatus.PENDING,
					status_message: isHitlResume
						? `resume_hitl:${dto?.feedback || ""}`
						: `resume_pause:${dto?.feedback || ""}`,
					updated_at: new Date(),
				},
			});

			if (casResult.count === 0) {
				throw new BadRequestException(
					`Execution ${executionId} is already being resumed by another request`,
				);
			}

			// Recreate lease
			await this.leaseService.createLease(executionId, userId, taskId);

			// Schedule PENDING timeout
			try {
				await this.pendingTimeoutQueue.add(
					`pending-timeout-${executionId}`,
					{ executionId },
					{ delay: 30_000, jobId: `pending-timeout-${executionId}`, removeOnComplete: true, removeOnFail: true },
				);
			} catch (e) {
				this.logger.warn(
					`Failed to schedule pending timeout for execution ${executionId}: ${(e as Error).message}`,
				);
			}

			this.logger.log(
				`[RESUME] Execution ${executionId} set to PENDING — waiting for client WS`,
			);

			return {
				success: true,
				message: "Execution resumed (waiting for WS connection)",
			};
		}

		// WS connected — proceed immediately (existing behavior)
		// 原子 CAS：只有一个请求能成功将状态从 SUSPENDED/USER_PAUSED 改为 RUNNING
		// 防止并发调用导致同一个 HITL 被恢复多次（会创建多个 graph branch，后完成的 branch 覆盖真实 summary）
		const casResult = await this.prismaService.task_execution.updateMany({
			where: {
				id: executionId,
				execution_status: execution.execution_status,
			},
			data: {
				execution_status: ExecutionStatus.RUNNING,
				status_message: isHitlResume
					? "Resuming from HITL"
					: "Resumed by user",
				updated_at: new Date(),
			},
		});

		if (casResult.count === 0) {
			throw new BadRequestException(
				`Execution ${executionId} is already being resumed by another request`,
			);
		}

		// 根据状态和 dto 判断恢复类型
		if (isHitlResume) {
			// HITL 恢复：传入用户响应
			const response: CallUserResponse = {
				feedback: dto?.feedback || "",
			};

			this.logger.log(
				`[RESUME EXECUTION] Resuming HITL execution ${executionId} with response: ${JSON.stringify(response)}`,
			);

			// ===== 存储 feedback 到长期记忆（50% 权重） =====
			const feedbackContent = dto?.feedback?.trim();
			if (feedbackContent) {
				// 异步存储，不阻塞主流程（使用 void 明确表示有意忽略 Promise）
				void (async () => {
					try {
						// 获取任务描述作为提取上下文
						const task = await this.taskService.getTaskEntity(taskId);
						const userInput = task?.taskDescription || task?.taskName || "";

						const store = this.postgresStoreService.getStore();
						await this.taskMemoryService.storeMemory(store, {
							taskId,
							executionId,
							source: "feedback",
							content: feedbackContent,
							userInput,
							userId,
						});
					} catch (error) {
						this.logger.warn(
							`Failed to store feedback memory: ${(error as Error).message}`,
						);
					}
				})();
			}

			// 重建租约（中断期间租约可能已过期）
			await this.leaseService.createLease(executionId, userId, taskId);

			// Pre-register so cancel can find it before setImmediate fires
			this.graphRunnerService.preRegisterExecution(executionId);

			// 后台执行恢复
			setImmediate(async () => {
				try {
					const result = await this.graphRunnerService.resumeExecution(
						taskId,
						executionId,
						response,
					);

					if (result.hitl_reason) {
						// Check if billing code already set SUSPENDED with specific message
						const currentExec = await this.prismaService.task_execution.findUnique({
							where: { id: executionId },
							select: { execution_status: true, status_message: true },
						});
						if (currentExec?.execution_status !== ExecutionStatus.SUSPENDED) {
							await this.updateExecutionStatus(
								executionId,
								ExecutionStatus.SUSPENDED,
								result.hitl_reason,
							);
						}
						this.logger.log(
							`[RESUME EXECUTION] Execution ${executionId} suspended again: ${currentExec?.status_message || result.hitl_reason}`,
						);
					} else if (result.cancelled) {
						if (result.abortReason === "lease_expired") {
							// 租约过期：需要自行完成执行，没有其他流程负责
							await this.completeExecution(
								executionId,
								ExecutionResult.CANCELLED,
								"Lease expired",
							);
							this.logger.log(
								`[RESUME EXECUTION] Execution ${executionId} terminated due to lease expiration`,
							);
						} else {
							// cancel 或 pause：由对应的流程（cancelExecution / pauseExecution）负责状态更新
							this.logger.log(
								`[RESUME EXECUTION] Execution ${executionId} was cancelled (reason: ${result.abortReason}, status update delegated)`,
							);
						}
					} else if (result.success) {
						if (result.summary) {
							await this.updateExecutionResultSummary(
								executionId,
								result.summary,
							);
						}
						await this.completeExecution(executionId, ExecutionResult.SUCCEED);
						this.logger.log(
							`[RESUME EXECUTION] Execution ${executionId} completed successfully`,
						);
					} else {
						await this.completeExecution(
							executionId,
							ExecutionResult.FAILED,
							result.error,
						);
						this.logger.error(
							`[RESUME EXECUTION] Execution ${executionId} failed: ${result.error}`,
						);
					}
				} catch (error) {
					await this.completeExecution(
						executionId,
						ExecutionResult.FAILED,
						error.message,
					);
					this.logger.error(
						`[RESUME EXECUTION] Execution ${executionId} error: ${error.message}`,
						error.stack,
					);
				}
			});
		} else {
			// 普通暂停恢复
			this.logger.log(
				`[RESUME EXECUTION] Resuming paused execution ${executionId}`,
			);

			// ===== 存储 feedback 到长期记忆（50% 权重） =====
			const feedbackContent = dto?.feedback?.trim();
			if (feedbackContent) {
				void (async () => {
					try {
						const task = await this.taskService.getTaskEntity(taskId);
						const userInput = task?.taskDescription || task?.taskName || "";

						const store = this.postgresStoreService.getStore();
						await this.taskMemoryService.storeMemory(store, {
							taskId,
							executionId,
							source: "feedback",
							content: feedbackContent,
							userInput,
							userId,
						});
					} catch (error) {
						this.logger.warn(
							`Failed to store pause-resume feedback memory: ${(error as Error).message}`,
						);
					}
				})();
			}

			// 重建租约（暂停期间租约可能已过期）
			await this.leaseService.createLease(executionId, userId, taskId);

			// 状态已由上方 CAS 原子更新为 RUNNING，无需重复更新

			// Pre-register so cancel can find it before setImmediate fires
			this.graphRunnerService.preRegisterExecution(executionId);

			// 后台执行恢复
			setImmediate(async () => {
				try {
					const result = await this.graphRunnerService.resumeFromPause(
						taskId,
						executionId,
						userId,
						dto?.feedback || undefined,
					);

					if (result.hitl_reason) {
						// Check if billing code already set SUSPENDED with specific message
						const currentExec = await this.prismaService.task_execution.findUnique({
							where: { id: executionId },
							select: { execution_status: true, status_message: true },
						});
						if (currentExec?.execution_status !== ExecutionStatus.SUSPENDED) {
							await this.updateExecutionStatus(
								executionId,
								ExecutionStatus.SUSPENDED,
								result.hitl_reason,
							);
						}
						this.logger.log(
							`[RESUME EXECUTION] Execution ${executionId} suspended: ${currentExec?.status_message || result.hitl_reason}`,
						);
					} else if (result.cancelled) {
						if (result.abortReason === "lease_expired") {
							// 租约过期：需要自行完成执行，没有其他流程负责
							await this.completeExecution(
								executionId,
								ExecutionResult.CANCELLED,
								"Lease expired",
							);
							this.logger.log(
								`[RESUME EXECUTION] Execution ${executionId} terminated due to lease expiration`,
							);
						} else {
							// cancel 或 pause：由对应的流程（cancelExecution / pauseExecution）负责状态更新
							this.logger.log(
								`[RESUME EXECUTION] Execution ${executionId} was cancelled (reason: ${result.abortReason}, status update delegated)`,
							);
						}
					} else if (result.success) {
						if (result.summary) {
							await this.updateExecutionResultSummary(
								executionId,
								result.summary,
							);
						}
						await this.completeExecution(executionId, ExecutionResult.SUCCEED);
						this.logger.log(
							`[RESUME EXECUTION] Execution ${executionId} completed successfully`,
						);
					} else {
						await this.completeExecution(
							executionId,
							ExecutionResult.FAILED,
							result.error,
						);
						this.logger.error(
							`[RESUME EXECUTION] Execution ${executionId} failed: ${result.error}`,
						);
					}
				} catch (error) {
					await this.completeExecution(
						executionId,
						ExecutionResult.FAILED,
						error.message,
					);
					this.logger.error(
						`[RESUME EXECUTION] Execution ${executionId} error: ${error.message}`,
						error.stack,
					);
				}
			});
		}

		return {
			success: true,
			message: "Execution resumed successfully",
		};
	}

	/**
	 * 获取用户所有活动执行（运行中、暂停状态）
	 */
	async getActiveExecutionsByUserId(
		userId: number,
	): Promise<TaskExecutionEntity[]> {
		const executions = await this.prismaService.task_execution.findMany({
			where: {
				user_id: userId,
				execution_status: {
					in: [
						ExecutionStatus.INITIAL,
						ExecutionStatus.PENDING,
						ExecutionStatus.RUNNING,
						ExecutionStatus.SUSPENDED,
						ExecutionStatus.USER_PAUSED,
					],
				},
				is_deleted: false,
			},
			orderBy: { created_at: "desc" },
		});

		return executions.map((e) => mapPrismaToExecutionEntity(e));
	}

	/**
	 * 批量取消用户所有活动执行（异步模式）
	 *
	 * API 立即返回，后台异步执行每个取消 + 总结。
	 * 复用 cancelAndSummarizeInBackground 确保与单个取消一致。
	 */
	async cancelAllExecutions(
		userId: number,
	): Promise<CancelAllExecutionsResponseDto> {
		this.logger.log(`Starting to cancel all executions for user ${userId}`);

		const activeExecutions = await this.getActiveExecutionsByUserId(userId);

		if (activeExecutions.length === 0) {
			return {
				success: true,
				message: "没有需要取消的活动执行",
				totalExecutions: 0,
				cancelledExecutions: 0,
				failedExecutions: 0,
			};
		}

		this.logger.log(
			`Found ${activeExecutions.length} active executions for user ${userId}`,
		);

		// 对每个活动执行触发后台异步取消
		for (const execution of activeExecutions) {
			this.cancelAndSummarizeInBackground(
				execution.id,
				userId,
				execution.taskId,
			);
		}

		return {
			success: true,
			message: `已发起 ${activeExecutions.length} 个执行的取消`,
			totalExecutions: activeExecutions.length,
			cancelledExecutions: activeExecutions.length,
			failedExecutions: 0,
		};
	}

	/**
	 * 兜底修复：状态已是 FINISHED 但 finished_at 为空时补写时间
	 */
	private async ensureFinishedAt(
		executionId: number,
		from: string,
	): Promise<void> {
		const updateResult = await this.prismaService.task_execution.updateMany({
			where: {
				id: executionId,
				execution_status: ExecutionStatus.FINISHED,
				finished_at: null,
			},
			data: {
				finished_at: new Date(),
				updated_at: new Date(),
			},
		});

		if (updateResult.count > 0) {
			this.logger.warn(
				`[ENSURE FINISHED_AT] Backfilled finished_at for execution ${executionId} from ${from}`,
			);
		}
	}

	/**
	 * Fork 执行
	 *
	 * 基于已完成的执行创建新的执行，复制原有对话历史，从 plan_supervisor 节点继续执行。
	 *
	 * @param originExecutionId 原执行 ID
	 * @param userId 用户 ID
	 * @param dto Fork 执行请求 DTO
	 * @returns Fork 执行响应
	 */
	async forkExecution(
		originExecutionId: number,
		userId: number,
		dto: ForkExecutionDto,
	): Promise<ForkExecutionResponseDto> {
		this.logger.log(
			`[FORK] User ${userId} forking execution ${originExecutionId}`,
		);

		// 1. 验证原执行存在且属于用户
		const originExecution = await this.prismaService.task_execution.findFirst({
			where: { id: originExecutionId, is_deleted: false },
		});

		if (!originExecution) {
			throw new NotFoundException(`Execution ${originExecutionId} not found`);
		}

		if (originExecution.user_id !== userId) {
			throw new ForbiddenException("No permission to fork this execution");
		}

		// 2. 验证原执行状态为 FINISHED
		if (originExecution.execution_status !== ExecutionStatus.FINISHED) {
			throw new BadRequestException(
				`只能 fork 已完成的执行，当前状态为 ${originExecution.execution_status}`,
			);
		}

		// 3. 获取用户信息
		const user = await this.prismaService.users.findUnique({
			where: { id: userId },
			select: { region: true, tenant_id: true },
		});
		const userRegion = user?.region || "CN";
		const tenantId = user?.tenant_id ?? -1;

		// 4. 创建新的 task_execution 记录 (PENDING — waits for WS ready)
		const newExecution = await this.prismaService.task_execution.create({
			data: {
				task_id: originExecution.task_id,
				user_id: userId,
				device_id: dto.deviceId || originExecution.device_id,
				execution_mode: ExecutionMode.IMMEDIATE,
				execution_status: ExecutionStatus.PENDING,
				origin_execution_id: originExecutionId, // 关联原执行
				// Store instruction in status_message for startForkExecution to read
				status_message: dto.instruction || null,
			},
		});

		this.logger.log(
			`[FORK] Created PENDING execution ${newExecution.id} from origin ${originExecutionId}`,
		);

		// 5. 创建租约
		await this.leaseService.createLease(
			newExecution.id,
			userId,
			originExecution.task_id,
		);

		// ===== 存储 instruction 到长期记忆（10% 权重） =====
		const instructionContent = dto.instruction?.trim();
		if (instructionContent) {
			// 异步存储，不阻塞主流程（使用 void 明确表示有意忽略 Promise）
			void (async () => {
				try {
					// 获取任务描述作为提取上下文
					const task = await this.taskService.getTaskEntity(
						originExecution.task_id,
					);
					const userInput = task?.taskDescription || task?.taskName || "";

					const store = this.postgresStoreService.getStore();
					await this.taskMemoryService.storeMemory(store, {
						taskId: originExecution.task_id,
						executionId: newExecution.id,
						source: "instruction",
						content: instructionContent,
						userInput,
						userId,
					});
				} catch (error) {
					this.logger.warn(
						`Failed to store instruction memory: ${(error as Error).message}`,
					);
				}
			})();
		}

		// 6. Schedule PENDING timeout
		try {
			await this.pendingTimeoutQueue.add(
				`pending-timeout-${newExecution.id}`,
				{ executionId: newExecution.id },
				{ delay: 30_000, jobId: `pending-timeout-${newExecution.id}`, removeOnComplete: true, removeOnFail: true },
			);
		} catch (e) {
			this.logger.warn(
				`Failed to schedule pending timeout for execution ${newExecution.id}: ${(e as Error).message}`,
			);
		}

		return {
			success: true,
			executionId: newExecution.id,
			taskId: originExecution.task_id,
			originExecutionId,
			message: "Fork execution started",
		};
	}

	/**
	 * 提交执行反馈
	 */
	async submitFeedback(
		executionId: number,
		userId: number,
		dto: CreateFeedbackDto,
	): Promise<FeedbackResponseDto> {
		this.logger.log(
			`User ${userId} submitting feedback for execution ${executionId}`,
		);

		// 1. 验证执行记录存在且属于当前用户
		const execution = await this.prismaService.task_execution.findFirst({
			where: {
				id: executionId,
				is_deleted: false,
			},
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}

		if (execution.user_id !== userId) {
			throw new ForbiddenException(
				"No permission to submit feedback for this execution",
			);
		}

		// 2. 验证执行已完成
		if (execution.execution_status !== ExecutionStatus.FINISHED) {
			throw new BadRequestException(
				`Cannot submit feedback for execution in ${execution.execution_status} status. Only FINISHED executions can receive feedback.`,
			);
		}

		// 3. 检查是否已有反馈（防止重复提交）
		const existingFeedback =
			await this.prismaService.task_execution_feedback.findUnique({
				where: { execution_id: executionId },
			});

		if (existingFeedback) {
			throw new BadRequestException(
				"Feedback has already been submitted for this execution",
			);
		}

		// 4. 创建反馈记录
		const feedback = await this.prismaService.task_execution_feedback.create({
			data: {
				execution_id: executionId,
				user_id: userId,
				rating: dto.rating || null,
				feedback_text: dto.feedbackText || null,
			},
		});

		this.logger.log(
			`Feedback ${feedback.id} created for execution ${executionId}`,
		);

		return {
			success: true,
			message: "反馈提交成功",
			feedbackId: feedback.id,
		};
	}

	/**
	 * 映射实体到响应DTO
	 */
	private mapEntityToResponse(
		entity: TaskExecutionEntity,
	): TaskExecutionResponseDto {
		return {
			id: entity.id,
			taskId: entity.taskId,
			userId: entity.userId,
			deviceId: entity.deviceId || undefined,
			executionMode: entity.executionMode,
			executionStatus: entity.executionStatus,
			statusMessage: entity.statusMessage || undefined,
			executionResult: entity.executionResult || undefined,
			executionResultSummary: entity.executionResultSummary || undefined,
			errorMessage: entity.errorMessage || undefined,
			currentStep: entity.currentStep || undefined,
			scheduledAt: entity.scheduledAt || undefined,
			startedAt: entity.startedAt || undefined,
			finishedAt: entity.finishedAt || undefined,
			tokenUsage: entity.tokenUsage || undefined,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
		};
	}

	// ============= 心跳租约 API =============

	/**
	 * 处理心跳请求
	 *
	 * 客户端定期调用此方法续租，保持任务执行。
	 * 如果客户端杀掉进程，心跳停止，租约过期后任务会被终止。
	 */
	async heartbeat(
		executionId: number,
		userId: number,
	): Promise<HeartbeatResponseDto> {
		// 验证执行记录存在且属于当前用户
		const execution = await this.prismaService.task_execution.findFirst({
			where: {
				id: executionId,
				is_deleted: false,
			},
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}

		if (execution.user_id !== userId) {
			throw new ForbiddenException(
				"No permission to send heartbeat for this execution",
			);
		}

		// 检查执行状态，只有运行中、暂停状态或总结中才需要心跳
		const validStatuses = [
			ExecutionStatus.RUNNING,
			ExecutionStatus.SUSPENDED,
			ExecutionStatus.USER_PAUSED,
			ExecutionStatus.SUMMARIZING,
		];

		if (
			!validStatuses.includes(execution.execution_status as ExecutionStatus)
		) {
			return {
				success: false,
				ttl: 0,
				heartbeatInterval: this.leaseService.getRecommendedHeartbeatInterval(),
				executionStatus: execution.execution_status as ExecutionStatus,
				message: `Execution is in ${execution.execution_status} status, heartbeat not needed`,
			};
		}

		// 续租
		const renewed = await this.leaseService.renewLease(executionId);
		if (!renewed) {
			// 暂停状态允许重建（暂停期间租约自然过期是正常的）
			if (
				execution.execution_status === ExecutionStatus.USER_PAUSED ||
				execution.execution_status === ExecutionStatus.SUSPENDED
			) {
				this.logger.log(
					`[HEARTBEAT] Lease expired during paused state, recreating for execution ${executionId}`,
				);
				await this.leaseService.createLease(
					executionId,
					userId,
					execution.task_id,
				);
			} else {
				// RUNNING 状态下租约过期说明客户端曾长时间未发心跳，lease monitor 会处理
				this.logger.warn(
					`[HEARTBEAT] Lease expired for running execution ${executionId}, not recreating`,
				);
			}
		}

		// 获取剩余 TTL
		const ttl = await this.leaseService.getLeaseTTL(executionId);

		return {
			success: true,
			ttl: ttl > 0 ? ttl : this.leaseService.getDefaultTTL(),
			heartbeatInterval: this.leaseService.getRecommendedHeartbeatInterval(),
			executionStatus: execution.execution_status as ExecutionStatus,
		};
	}

	/**
	 * 批量心跳处理
	 *
	 * 用于同时续租多个执行任务的租约
	 */
	async batchHeartbeat(
		executionIds: number[],
		userId: number,
	): Promise<BatchHeartbeatResponseDto> {
		if (executionIds.length === 0) {
			return {
				success: true,
				renewedExecutionIds: [],
				failedExecutionIds: [],
				heartbeatInterval: this.leaseService.getRecommendedHeartbeatInterval(),
			};
		}

		// 验证所有执行记录属于当前用户
		const executions = await this.prismaService.task_execution.findMany({
			where: {
				id: { in: executionIds },
				user_id: userId,
				is_deleted: false,
			},
			select: { id: true },
		});

		const validIds = executions.map((e) => e.id);
		const invalidIds = executionIds.filter((id) => !validIds.includes(id));

		// 批量续租有效的执行 ID
		const renewedIds = await this.leaseService.renewLeasesBatch(validIds);
		const failedIds = [
			...invalidIds,
			...validIds.filter((id) => !renewedIds.includes(id)),
		];

		return {
			success: renewedIds.length > 0,
			renewedExecutionIds: renewedIds,
			failedExecutionIds: failedIds,
			heartbeatInterval: this.leaseService.getRecommendedHeartbeatInterval(),
		};
	}
}
