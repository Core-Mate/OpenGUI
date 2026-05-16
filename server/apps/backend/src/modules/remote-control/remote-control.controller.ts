import {
	Body,
	Controller,
	Get,
	Param,
	ParseIntPipe,
	Post,
	Put,
	ValidationPipe,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import {
	DoRemoteTaskDto,
	ResumeRemoteExecutionDto,
	RunRemoteTaskDto,
} from "./dto/remote-control.dto";
import { RemoteControlService } from "./remote-control.service";

@ApiTags("Remote Control")
@Controller("remote-control")
export class RemoteControlController {
	constructor(private readonly remoteControlService: RemoteControlService) {}

	@Get("devices")
	@ApiOperation({ summary: "List online standby devices" })
	listDevices() {
		return this.remoteControlService.listDevices();
	}

	@Post("tasks/run")
	@ApiOperation({ summary: "Run an existing task on an online device" })
	runTask(@Body(ValidationPipe) dto: RunRemoteTaskDto) {
		return this.remoteControlService.runTask(dto);
	}

	@Post("tasks/do")
	@ApiOperation({ summary: "Create and run a task on an online device" })
	doTask(@Body(ValidationPipe) dto: DoRemoteTaskDto) {
		return this.remoteControlService.doTask(dto);
	}

	@Get("executions/:id")
	@ApiOperation({ summary: "Get execution status" })
	@ApiParam({ name: "id", description: "Execution ID", type: Number })
	getExecution(@Param("id", ParseIntPipe) executionId: number) {
		return this.remoteControlService.getExecution(executionId);
	}

	@Put("executions/:id/cancel")
	@ApiOperation({ summary: "Cancel execution" })
	@ApiParam({ name: "id", description: "Execution ID", type: Number })
	cancelExecution(@Param("id", ParseIntPipe) executionId: number) {
		return this.remoteControlService.cancelExecution(executionId);
	}

	@Put("executions/:id/pause")
	@ApiOperation({ summary: "Pause execution" })
	@ApiParam({ name: "id", description: "Execution ID", type: Number })
	pauseExecution(@Param("id", ParseIntPipe) executionId: number) {
		return this.remoteControlService.pauseExecution(executionId);
	}

	@Put("executions/:id/resume")
	@ApiOperation({ summary: "Resume execution" })
	@ApiParam({ name: "id", description: "Execution ID", type: Number })
	resumeExecution(
		@Param("id", ParseIntPipe) executionId: number,
		@Body(ValidationPipe) dto: ResumeRemoteExecutionDto,
	) {
		return this.remoteControlService.resumeExecution(executionId, dto);
	}
}
