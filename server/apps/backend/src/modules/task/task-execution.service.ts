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
	private readonly disconnectedExecutionTimers = new Map<number, NodeJS.Timeout>();

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

	handleExecutionSocketDisconnected(executionId: number): void {
		if (this.disconnectedExecutionTimers.has(executionId)) {
			clearTimeout(this.disconnectedExecutionTimers.get(executionId));
		}

		const timer = setTimeout(() => {
			this.disconnectedExecutionTimers.delete(executionId);
			void this.failExecutionIfStillDisconnected(executionId);
		}, 15000);

		this.disconnectedExecutionTimers.set(executionId, timer);
	}

	private async failExecutionIfStillDisconnected(executionId: number): Promise<void> {
		try {
			if (this.executionSocketService?.isConnected?.(executionId)) {
				this.logger.log(
					`[WS DISCONNECT] Execution ${executionId} reconnected before timeout, keeping running`,
				);
				return;
			}

			const execution = await this.prismaService.task_execution.findUnique({
				where: { id: executionId },
				select: {
					id: true,
					task_id: true,
					user_id: true,
					execution_status: true,
				},
			});

			if (!execution || execution.execution_status !== ExecutionStatus.RUNNING) {
				return;
			}

			try {
				await this.graphRunnerService.cancelExecution(
					executionId,
					execution.user_id,
					execution.task_id,
					true,
				);
			} catch (error) {
				this.logger.warn(
					`[WS DISCONNECT] GraphRunner cancel failed for ${executionId}: ${(error as Error).message}`,
				);
			}

				const message = "Phone-side execution connection disconnected. The task was stopped automatically. Reopen the execution page on the phone, then run it again.";
			const updateResult = await this.prismaService.task_execution.updateMany({
				where: {
					id: executionId,
					execution_status: ExecutionStatus.RUNNING,
				},
				data: {
					execution_status: ExecutionStatus.FINISHED,
					execution_result: ExecutionResult.FAILED,
					error_message: message,
					status_message: message,
					finished_at: new Date(),
				},
			});

			if (updateResult.count > 0) {
				this.logger.warn(
					`[WS DISCONNECT] Execution ${executionId} marked FAILED after socket disconnect`,
				);
				await this.taskService.syncTaskStats(execution.task_id);
				this.executionGateway?.sendExecutionFinished?.(executionId, {
					status: ExecutionResult.FAILED,
					message,
				});
			}
		} catch (error) {
			this.logger.error(
				`[WS DISCONNECT] Failed to finalize disconnected execution ${executionId}: ${(error as Error).message}`,
				(error as Error).stack,
			);
		}
	}

	/**
	 * Execute task
	 */
	async executeTask(
		taskId: number,
		userId: number,
		dto: ExecuteTaskDto,
	): Promise<ExecuteTaskResponseDto> {
		this.logger.log(`Executing task ${taskId} for user ${userId}`);


		const idempotencyKey = `execute:${userId}:${taskId}`;
		const acquired = await this.redisService
			.getClient()
			.set(idempotencyKey, "1", "PX", 3000, "NX");
		if (!acquired) {
			this.logger.warn(
				`[IDEMPOTENT] Duplicate execute request blocked: user=${userId}, task=${taskId}`,
			);
			throw new ConflictException(
					"Requests are too frequent. Please try again later.",
			);
		}


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


		const task = await this.taskService.getTaskEntity(taskId);
		if (!task) {
			throw new NotFoundException(`Task ${taskId} not found`);
		}

		if (task.userId !== 0 && task.userId !== userId && !task.isTemplate) {
			throw new ForbiddenException("No permission to execute this task");
		}


		const user = await this.prismaService.users.findUnique({
			where: { id: userId },
			select: { region: true, tenant_id: true },
		});
		const userRegion = user?.region || "CN";
		const tenantId = user?.tenant_id ?? -1;


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


		await this.leaseService.createLease(execution.id, userId, taskId);


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
	 *
	 */
	async startExecution(executionId: number): Promise<void> {

		const execution = await this.prismaService.task_execution.findUnique({
			where: { id: executionId },
		});

		if (!execution) {
			throw new NotFoundException(`Execution ${executionId} not found`);
		}


		try {
			const job = await this.pendingTimeoutQueue.getJob(`pending-timeout-${executionId}`);
			if (job) await job.remove();
		} catch {
			// Best effort — job may have already fired or been removed
		}


		const task = await this.taskService.getTaskEntity(execution.task_id);
		if (!task) {
			throw new NotFoundException(`Task ${execution.task_id} not found`);
		}

		const taskDescription = task.taskDescription || task.taskName;


		const user = await this.prismaService.users.findUnique({
			where: { id: execution.user_id },
			select: { region: true, tenant_id: true },
		});
		const userRegion = user?.region || "CN";
		const tenantId = user?.tenant_id ?? -1;


		try {
			const balance = await this.creditsService.getBalance(execution.user_id);
			if (balance.remaining <= 0) {
				await this.completeExecution(
					executionId,
					ExecutionResult.FAILED,
						"Insufficient credits. Please recharge and try again.",
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


		try {
			const balance = await this.creditsService.getBalance(execution.user_id);
			if (balance.remaining <= 0) {
				await this.completeExecution(
					executionId,
					ExecutionResult.FAILED,
						"Insufficient credits. Please recharge and try again.",
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
	 */
	async getExecutionHistory(
		taskId: number,
		userId: number,
		query: ExecutionHistoryQueryDto,
	): Promise<PaginatedExecutionHistoryDto> {

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
	 */
	async getExecutionRecord(executionId: number): Promise<TaskExecutionEntity | null> {
		const raw = await this.prismaService.task_execution.findUnique({
			where: { id: executionId },
		});
		if (!raw) return null;
		return mapPrismaToExecutionEntity(raw);
	}

	/**
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

			}
		}
	}

	/**
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
	 *
	 */
	async completeExecution(
		executionId: number,
		result: ExecutionResult,
		errorMessage?: string,
		tokenUsage?: Record<string, any>,
	): Promise<void> {


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


		if (updateResult.count === 0) {
			this.logger.log(
				`Execution ${executionId} already completed or not found, skipping duplicate completion`,
			);

			await this.ensureFinishedAt(executionId, "completeExecution");
			return;
		}


		const execution = await this.prismaService.task_execution.findUnique({
			where: { id: executionId },
			select: { task_id: true },
		});

		if (!execution) {
			this.logger.warn(`Execution ${executionId} not found after update`);
			return;
		}


		await this.leaseService.releaseLease(executionId);



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

		}
	}

	/**
	 *
	 */
	private async cancelExecutionInternal(
		executionId: number,
		userId: number,
		taskId: number,
	): Promise<boolean> {
		try {

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


			await this.leaseService.releaseLease(executionId);

			// Sync task stats
			await this.taskService.syncTaskStats(taskId);



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
	 *
	 *
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


		if (execution.execution_status === ExecutionStatus.SUMMARIZING) {
			return {
				success: true,
				message: "Execution is already being cancelled",
			};
		}


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


		this.cancelAndSummarizeInBackground(executionId, userId, execution.task_id);

		return {
			success: true,
			message: "Cancellation initiated",
		};
	}

	/**
	 *
	 *
	 */
	private cancelAndSummarizeInBackground(
		executionId: number,
		userId: number,
		taskId: number,
	): void {
		setImmediate(async () => {
			try {

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
	 * Pause execution
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
	 * Resume execution
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


		try {
			const balance = await this.creditsService.getBalance(userId);
			if (balance.remaining <= 0) {
					throw new BadRequestException("Insufficient credits. Please recharge and try again.");
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


		if (isHitlResume) {

			const response: CallUserResponse = {
				feedback: dto?.feedback || "",
			};

			this.logger.log(
				`[RESUME EXECUTION] Resuming HITL execution ${executionId} with response: ${JSON.stringify(response)}`,
			);


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
							`Failed to store feedback memory: ${(error as Error).message}`,
						);
					}
				})();
			}


			await this.leaseService.createLease(executionId, userId, taskId);

			// Pre-register so cancel can find it before setImmediate fires
			this.graphRunnerService.preRegisterExecution(executionId);


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

							await this.completeExecution(
								executionId,
								ExecutionResult.CANCELLED,
								"Lease expired",
							);
							this.logger.log(
								`[RESUME EXECUTION] Execution ${executionId} terminated due to lease expiration`,
							);
						} else {

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

			this.logger.log(
				`[RESUME EXECUTION] Resuming paused execution ${executionId}`,
			);


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


			await this.leaseService.createLease(executionId, userId, taskId);



			// Pre-register so cancel can find it before setImmediate fires
			this.graphRunnerService.preRegisterExecution(executionId);


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

							await this.completeExecution(
								executionId,
								ExecutionResult.CANCELLED,
								"Lease expired",
							);
							this.logger.log(
								`[RESUME EXECUTION] Execution ${executionId} terminated due to lease expiration`,
							);
						} else {

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
	 *
	 */
	async cancelAllExecutions(
		userId: number,
	): Promise<CancelAllExecutionsResponseDto> {
		this.logger.log(`Starting to cancel all executions for user ${userId}`);

		const activeExecutions = await this.getActiveExecutionsByUserId(userId);

		if (activeExecutions.length === 0) {
			return {
				success: true,
					message: "No active executions to cancel",
				totalExecutions: 0,
				cancelledExecutions: 0,
				failedExecutions: 0,
			};
		}

		this.logger.log(
			`Found ${activeExecutions.length} active executions for user ${userId}`,
		);


		for (const execution of activeExecutions) {
			this.cancelAndSummarizeInBackground(
				execution.id,
				userId,
				execution.taskId,
			);
		}

		return {
			success: true,
				message: `Started cancellation for ${activeExecutions.length} execution(s)`,
			totalExecutions: activeExecutions.length,
			cancelledExecutions: activeExecutions.length,
			failedExecutions: 0,
		};
	}

	/**
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
	 *
	 *
	 * @param userId User ID
	 */
	async forkExecution(
		originExecutionId: number,
		userId: number,
		dto: ForkExecutionDto,
	): Promise<ForkExecutionResponseDto> {
		this.logger.log(
			`[FORK] User ${userId} forking execution ${originExecutionId}`,
		);


		const originExecution = await this.prismaService.task_execution.findFirst({
			where: { id: originExecutionId, is_deleted: false },
		});

		if (!originExecution) {
			throw new NotFoundException(`Execution ${originExecutionId} not found`);
		}

		if (originExecution.user_id !== userId) {
			throw new ForbiddenException("No permission to fork this execution");
		}


		if (originExecution.execution_status !== ExecutionStatus.FINISHED) {
			throw new BadRequestException(
					`Only completed executions can be forked; current status is ${originExecution.execution_status}`,
			);
		}


		const user = await this.prismaService.users.findUnique({
			where: { id: userId },
			select: { region: true, tenant_id: true },
		});
		const userRegion = user?.region || "CN";
		const tenantId = user?.tenant_id ?? -1;


		const newExecution = await this.prismaService.task_execution.create({
			data: {
				task_id: originExecution.task_id,
				user_id: userId,
				device_id: dto.deviceId || originExecution.device_id,
				execution_mode: ExecutionMode.IMMEDIATE,
				execution_status: ExecutionStatus.PENDING,
				origin_execution_id: originExecutionId,
				// Store instruction in status_message for startForkExecution to read
				status_message: dto.instruction || null,
			},
		});

		this.logger.log(
			`[FORK] Created PENDING execution ${newExecution.id} from origin ${originExecutionId}`,
		);


		await this.leaseService.createLease(
			newExecution.id,
			userId,
			originExecution.task_id,
		);


		const instructionContent = dto.instruction?.trim();
		if (instructionContent) {

			void (async () => {
				try {

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
	 * Submit execution feedback
	 */
	async submitFeedback(
		executionId: number,
		userId: number,
		dto: CreateFeedbackDto,
	): Promise<FeedbackResponseDto> {
		this.logger.log(
			`User ${userId} submitting feedback for execution ${executionId}`,
		);


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


		if (execution.execution_status !== ExecutionStatus.FINISHED) {
			throw new BadRequestException(
				`Cannot submit feedback for execution in ${execution.execution_status} status. Only FINISHED executions can receive feedback.`,
			);
		}


		const existingFeedback =
			await this.prismaService.task_execution_feedback.findUnique({
				where: { execution_id: executionId },
			});

		if (existingFeedback) {
			throw new BadRequestException(
				"Feedback has already been submitted for this execution",
			);
		}


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
			message: "Feedback submitted",
			feedbackId: feedback.id,
		};
	}

	/**
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

	// ============= Heartbeat lease API =============

	/**
	 *
	 */
	async heartbeat(
		executionId: number,
		userId: number,
	): Promise<HeartbeatResponseDto> {

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


		const renewed = await this.leaseService.renewLease(executionId);
		if (!renewed) {

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

				this.logger.warn(
					`[HEARTBEAT] Lease expired for running execution ${executionId}, not recreating`,
				);
			}
		}


		const ttl = await this.leaseService.getLeaseTTL(executionId);

		return {
			success: true,
			ttl: ttl > 0 ? ttl : this.leaseService.getDefaultTTL(),
			heartbeatInterval: this.leaseService.getRecommendedHeartbeatInterval(),
			executionStatus: execution.execution_status as ExecutionStatus,
		};
	}

	/**
	 *
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
