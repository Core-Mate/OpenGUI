jest.mock("uuid", () => ({
	v4: () => "test-uuid",
}));
jest.mock("@repo/db", () => ({
	prisma: {},
	Prisma: {},
}));
jest.mock("../task/task.service", () => ({
	TaskService: class TaskService {},
}));
jest.mock("../task/task-execution.service", () => ({
	TaskExecutionService: class TaskExecutionService {},
}));
jest.mock("../../common/ws/standby-socket.service", () => ({
	StandbySocketService: class StandbySocketService {},
}));
jest.mock("../../common/ws/standby.gateway", () => ({
	StandbyGateway: class StandbyGateway {},
}));

import { BadRequestException } from "@nestjs/common";
import { RemoteControlService } from "./remote-control.service";

describe("RemoteControlService", () => {
	let taskService: {
		createTask: jest.Mock;
		getTaskById: jest.Mock;
	};
	let taskExecutionService: {
		executeTask: jest.Mock;
		getExecutionById: jest.Mock;
		cancelExecution: jest.Mock;
		pauseExecution: jest.Mock;
		resumeExecution: jest.Mock;
	};
	let standbySocketService: {
		getOnlineDevices: jest.Mock;
		getOnlineDevice: jest.Mock;
		getOnlineDeviceById: jest.Mock;
	};
	let standbyGateway: {
		dispatchToDevice: jest.Mock;
	};
	let service: RemoteControlService;

	const phoneA = { deviceId: "phone-a", deviceName: "Pixel A" };
	const phoneB = { deviceId: "phone-b", deviceName: "Pixel B" };

	beforeEach(() => {
		taskService = {
			createTask: jest.fn(),
			getTaskById: jest.fn(),
		};
		taskExecutionService = {
			executeTask: jest.fn(),
			getExecutionById: jest.fn(),
			cancelExecution: jest.fn(),
			pauseExecution: jest.fn(),
			resumeExecution: jest.fn(),
		};
		standbySocketService = {
			getOnlineDevices: jest.fn(),
			getOnlineDevice: jest.fn(),
			getOnlineDeviceById: jest.fn(),
		};
		standbyGateway = {
			dispatchToDevice: jest.fn(),
		};

		service = new RemoteControlService(
			taskService as any,
			taskExecutionService as any,
			standbySocketService as any,
			standbyGateway as any,
		);
	});

	it("returns online standby devices", () => {
		standbySocketService.getOnlineDevices.mockReturnValue([phoneA, phoneB]);

		expect(service.listDevices()).toEqual({
			devices: [phoneA, phoneB],
			total: 2,
		});
	});

	it("rejects doTask when no standby device is online", async () => {
		standbySocketService.getOnlineDevices.mockReturnValue([]);
		standbySocketService.getOnlineDevice.mockReturnValue(null);

		await expect(
			service.doTask({ description: "open X and search OpenGUI" }),
		).rejects.toThrow(BadRequestException);
		expect(taskService.createTask).not.toHaveBeenCalled();
		expect(taskExecutionService.executeTask).not.toHaveBeenCalled();
	});

	it("rejects runTask when the requested device is offline", async () => {
		standbySocketService.getOnlineDevices.mockReturnValue([phoneA]);
		standbySocketService.getOnlineDeviceById.mockReturnValue(null);

		await expect(
			service.runTask({ taskId: 7, deviceId: "missing-phone" }),
		).rejects.toThrow('Device "missing-phone" is not online');
		expect(taskService.getTaskById).not.toHaveBeenCalled();
		expect(taskExecutionService.executeTask).not.toHaveBeenCalled();
	});

	it("creates a task, executes it, and dispatches it to the selected device", async () => {
		standbySocketService.getOnlineDevices.mockReturnValue([phoneA, phoneB]);
		standbySocketService.getOnlineDeviceById.mockReturnValue(phoneB);
		taskService.createTask.mockResolvedValue({
			id: 12,
			taskName: "OpenGUI research",
		});
		taskExecutionService.executeTask.mockResolvedValue({
			success: true,
			executionId: 34,
			taskId: 12,
			message: "Execution created, waiting for WS ready signal",
		});

		const result = await service.doTask({
			description: "open X and search OpenGUI",
			taskName: "OpenGUI research",
			deviceId: "phone-b",
		});

		expect(taskService.createTask).toHaveBeenCalledWith(1, {
			taskName: "OpenGUI research",
			taskDescription: "open X and search OpenGUI",
		});
		expect(taskExecutionService.executeTask).toHaveBeenCalledWith(12, 1, {
			deviceId: "phone-b",
		});
		expect(standbyGateway.dispatchToDevice).toHaveBeenCalledWith(phoneB, {
			executionId: 34,
			taskId: 12,
			taskName: "OpenGUI research",
		});
		expect(result).toMatchObject({
			success: true,
			executionId: 34,
			taskId: 12,
			taskName: "OpenGUI research",
			device: phoneB,
		});
	});

	it("uses the first online device by default when running an existing task", async () => {
		standbySocketService.getOnlineDevices.mockReturnValue([phoneA, phoneB]);
		standbySocketService.getOnlineDevice.mockReturnValue(phoneA);
		taskService.getTaskById.mockResolvedValue({
			id: 9,
			taskName: "Existing task",
		});
		taskExecutionService.executeTask.mockResolvedValue({
			success: true,
			executionId: 91,
			taskId: 9,
		});

		const result = await service.runTask({ taskId: 9 });

		expect(taskService.getTaskById).toHaveBeenCalledWith(9, 1);
		expect(taskExecutionService.executeTask).toHaveBeenCalledWith(9, 1, {
			deviceId: "phone-a",
		});
		expect(standbyGateway.dispatchToDevice).toHaveBeenCalledWith(phoneA, {
			executionId: 91,
			taskId: 9,
			taskName: "Existing task",
		});
		expect(result.device).toEqual(phoneA);
	});
});
