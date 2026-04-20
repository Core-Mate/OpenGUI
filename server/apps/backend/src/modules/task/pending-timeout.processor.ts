import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { Job } from "bullmq";
import { LeaseService } from "../../common/lease/lease.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ExecutionResult, ExecutionStatus } from "./enums/task.enums";

export const PENDING_TIMEOUT_QUEUE = "execution-pending-timeout";

export interface PendingTimeoutJobData {
	executionId: number;
}

@Processor(PENDING_TIMEOUT_QUEUE)
export class PendingTimeoutProcessor extends WorkerHost {
	private readonly logger = new Logger(PendingTimeoutProcessor.name);
	private executionGateway: any = null;

	constructor(
		private readonly prismaService: PrismaService,
		private readonly leaseService: LeaseService,
		private readonly moduleRef: ModuleRef,
	) {
		super();
	}

	async onModuleInit() {
		try {
			const wsModule = await import(
				"../../common/ws/execution.gateway.js"
			);
			this.executionGateway = this.moduleRef.get(
				wsModule.ExecutionGateway,
				{ strict: false },
			);
		} catch {
			this.logger.warn("ExecutionGateway not available");
		}
	}

	async process(job: Job<PendingTimeoutJobData>): Promise<void> {
		const { executionId } = job.data;
		const isSummarizingTimeout = job.id?.startsWith("summarizing-timeout-");

		// Atomic: PENDING → FINISHED+CANCELLED or SUMMARIZING → FINISHED+CANCELLED
		const targetStatus = isSummarizingTimeout
			? ExecutionStatus.SUMMARIZING
			: ExecutionStatus.PENDING;
		const errorMessage = isSummarizingTimeout
			? "Summarizer did not complete within 60s"
			: "Client did not send execution:ready within 30s";
		const statusMessage = isSummarizingTimeout
			? "SUMMARIZING timeout"
			: "PENDING timeout";

		const updateResult =
			await this.prismaService.task_execution.updateMany({
				where: {
					id: executionId,
					execution_status: targetStatus,
				},
				data: {
					execution_status: ExecutionStatus.FINISHED,
					execution_result: ExecutionResult.CANCELLED,
					error_message: errorMessage,
					status_message: statusMessage,
					finished_at: new Date(),
					updated_at: new Date(),
				},
			});

		if (updateResult.count === 0) {
			return;
		}

		this.logger.warn(
			`Execution ${executionId} timed out in ${targetStatus} state`,
		);

		// Release lease
		try {
			await this.leaseService.releaseLease(executionId);
		} catch (e) {
			this.logger.warn(
				`Failed to release lease for timed-out execution ${executionId}: ${(e as Error).message}`,
			);
		}

		// Notify client via WS
		try {
			if (isSummarizingTimeout) {
				this.executionGateway?.sendExecutionFinished(executionId, {
					status: ExecutionResult.CANCELLED,
					message: errorMessage,
				});
			} else {
				this.executionGateway?.sendExecutionError(
					executionId,
					"Execution timed out: client did not connect in time",
				);
			}
		} catch {
			// Best effort
		}
	}
}
