import { BullModule } from "@nestjs/bullmq";
import { forwardRef, Module } from "@nestjs/common";
import { LogModule } from "../../common/log";
import { PrismaModule } from "../../prisma/prisma.module";
import { CreditsModule } from "../credits/credits.module";
import { GraphAgentModule } from "../graph-agent/graph-agent.module";
import {
	TaskController,
	ExecutionController,
	TaskTemplateController,
} from "./task.controller";
import { TaskService } from "./task.service";
import { TaskExecutionService } from "./task-execution.service";
import {
	PendingTimeoutProcessor,
	PENDING_TIMEOUT_QUEUE,
} from "./pending-timeout.processor";

@Module({
	imports: [
		PrismaModule,
		LogModule,
		BullModule.registerQueue({ name: PENDING_TIMEOUT_QUEUE }),
		forwardRef(() => GraphAgentModule), // GraphRunnerService 提供者
		CreditsModule,
	],
	controllers: [
		TaskController,
		ExecutionController,
		TaskTemplateController,
	],
	providers: [TaskService, TaskExecutionService, PendingTimeoutProcessor],
	exports: [TaskService, TaskExecutionService],
})
export class TaskModule {}
