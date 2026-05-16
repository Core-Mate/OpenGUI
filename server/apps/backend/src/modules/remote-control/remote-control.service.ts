import { BadRequestException, Injectable } from "@nestjs/common";
import { StandbyGateway } from "../../common/ws/standby.gateway";
import { StandbySocketService } from "../../common/ws/standby-socket.service";
import type { StandbySocket } from "../../common/ws/types";
import { TaskExecutionService } from "../task/task-execution.service";
import { TaskService } from "../task/task.service";
import type {
	DoRemoteTaskDto,
	RunRemoteTaskDto,
	ResumeRemoteExecutionDto,
} from "./dto/remote-control.dto";

export const REMOTE_CONTROL_USER_ID = 1;

export interface RemoteControlDevice {
	deviceId: string;
	deviceName?: string;
}

export interface RemoteControlExecutionResponse {
	success: boolean;
	executionId: number;
	taskId: number;
	taskName: string;
	device: RemoteControlDevice;
	message?: string;
}

@Injectable()
export class RemoteControlService {
	constructor(
		private readonly taskService: TaskService,
		private readonly taskExecutionService: TaskExecutionService,
		private readonly standbySocketService: StandbySocketService,
		private readonly standbyGateway: StandbyGateway,
	) {}

	listDevices(): { devices: RemoteControlDevice[]; total: number } {
		const devices = this.standbySocketService.getOnlineDevices();
		return {
			devices,
			total: devices.length,
		};
	}

	async doTask(
		dto: DoRemoteTaskDto,
		userId = REMOTE_CONTROL_USER_ID,
	): Promise<RemoteControlExecutionResponse> {
		const { device, socket } = this.selectOnlineDevice(dto.deviceId);
		const taskName = dto.taskName?.trim() || this.createTaskName(dto.description);
		const task = await this.taskService.createTask(userId, {
			taskName,
			taskDescription: dto.description,
		});

		return await this.executeAndDispatch({
			taskId: task.id,
			taskName: task.taskName,
			userId,
			device,
			socket,
		});
	}

	async runTask(
		dto: RunRemoteTaskDto,
		userId = REMOTE_CONTROL_USER_ID,
	): Promise<RemoteControlExecutionResponse> {
		const { device, socket } = this.selectOnlineDevice(dto.deviceId);
		const task = await this.taskService.getTaskById(dto.taskId, userId);

		return await this.executeAndDispatch({
			taskId: task.id,
			taskName: task.taskName,
			userId,
			device,
			socket,
		});
	}

	async getExecution(executionId: number, userId = REMOTE_CONTROL_USER_ID) {
		return await this.taskExecutionService.getExecutionById(executionId, userId);
	}

	async cancelExecution(executionId: number, userId = REMOTE_CONTROL_USER_ID) {
		return await this.taskExecutionService.cancelExecution(executionId, userId);
	}

	async pauseExecution(executionId: number, userId = REMOTE_CONTROL_USER_ID) {
		return await this.taskExecutionService.pauseExecution(executionId, userId);
	}

	async resumeExecution(
		executionId: number,
		dto?: ResumeRemoteExecutionDto,
		userId = REMOTE_CONTROL_USER_ID,
	) {
		return await this.taskExecutionService.resumeExecution(
			executionId,
			userId,
			dto,
		);
	}

	private async executeAndDispatch(input: {
		taskId: number;
		taskName: string;
		userId: number;
		device: RemoteControlDevice;
		socket: StandbySocket;
	}): Promise<RemoteControlExecutionResponse> {
		const result = await this.taskExecutionService.executeTask(
			input.taskId,
			input.userId,
			{ deviceId: input.device.deviceId },
		);

		this.standbyGateway.dispatchToDevice(input.socket, {
			executionId: result.executionId,
			taskId: input.taskId,
			taskName: input.taskName,
		});

		return {
			success: result.success,
			executionId: result.executionId,
			taskId: input.taskId,
			taskName: input.taskName,
			device: input.device,
			message: result.message,
		};
	}

	private selectOnlineDevice(deviceId?: string): {
		device: RemoteControlDevice;
		socket: StandbySocket;
	} {
		const devices = this.standbySocketService.getOnlineDevices();
		if (devices.length === 0) {
			throw new BadRequestException(
				"No online device. Start the Android app on the work phone first.",
			);
		}

		const device = deviceId
			? devices.find((candidate) => candidate.deviceId === deviceId)
			: devices[0];
		if (!device) {
			throw new BadRequestException(`Device "${deviceId}" is not online`);
		}

		const socket = deviceId
			? this.standbySocketService.getOnlineDeviceById(deviceId)
			: this.standbySocketService.getOnlineDevice();
		if (!socket) {
			throw new BadRequestException(`Device "${device.deviceId}" is not online`);
		}

		return { device, socket };
	}

	private createTaskName(description: string): string {
		const trimmed = description.trim();
		return trimmed.length > 20 ? `${trimmed.substring(0, 20)}...` : trimmed;
	}
}
