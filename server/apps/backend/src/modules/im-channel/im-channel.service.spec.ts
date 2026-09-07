jest.mock("uuid", () => ({
	v4: () => "test-uuid",
}));
jest.mock("../task/task.service", () => ({
	TaskService: class TaskService {},
}));
jest.mock("../task/task-execution.service", () => ({
	TaskExecutionService: class TaskExecutionService {},
}));
jest.mock("../remote-control", () => ({
	RemoteControlService: class RemoteControlService {},
}));

import { CommandParserService } from "./command/command-parser.service";
import { ImChannelService } from "./im-channel.service";

describe("ImChannelService", () => {
	let discordBot: { isEnabled: boolean; sendMessage: jest.Mock; onMessage?: any };
	let remoteControlService: {
		doTask: jest.Mock;
		runTask: jest.Mock;
	};
	let standbySocketService: {
		getOnlineDevices: jest.Mock;
	};
	let service: ImChannelService;

	beforeEach(() => {
		discordBot = {
			isEnabled: true,
			sendMessage: jest.fn(),
		};
		remoteControlService = {
			doTask: jest.fn(),
			runTask: jest.fn(),
		};
		standbySocketService = {
			getOnlineDevices: jest.fn(),
		};

		service = new ImChannelService(
			{ setContext: jest.fn(), log: jest.fn(), error: jest.fn() } as any,
			{ isEnabled: false } as any,
			{ isEnabled: false } as any,
			discordBot as any,
			new CommandParserService(),
			{ getTaskList: jest.fn() } as any,
			{} as any,
			standbySocketService as any,
			remoteControlService as any,
		);
	});

	it("routes /do through RemoteControlService", async () => {
		remoteControlService.doTask.mockResolvedValue({
			success: true,
			executionId: 100,
			taskId: 10,
			taskName: "open X",
			device: { deviceId: "phone-a", deviceName: "Pixel A" },
		});

		await (service as any).handleMessage({
			platform: "discord",
			conversationId: "chat-1",
			platformUserId: "user-1",
			text: "/do open X",
		});

		expect(remoteControlService.doTask).toHaveBeenCalledWith(
			{ description: "open X" },
			1,
		);
		expect(discordBot.sendMessage).toHaveBeenCalledWith(
			"chat-1",
			expect.stringContaining("Created task: open X"),
		);
		expect(discordBot.sendMessage).toHaveBeenCalledWith(
			"chat-1",
			expect.stringContaining("Device: Pixel A"),
		);
	});

	it("routes /run through RemoteControlService", async () => {
		remoteControlService.runTask.mockResolvedValue({
			success: true,
			executionId: 101,
			taskId: 11,
			taskName: "existing task",
			device: { deviceId: "phone-b" },
		});

		await (service as any).handleMessage({
			platform: "discord",
			conversationId: "chat-1",
			platformUserId: "user-1",
			text: "/run 11",
		});

		expect(remoteControlService.runTask).toHaveBeenCalledWith({ taskId: 11 }, 1);
		expect(discordBot.sendMessage).toHaveBeenCalledWith(
			"chat-1",
			expect.stringContaining("Starting execution: existing task"),
		);
	});

	it("keeps /devices backed by the standby device list", async () => {
		standbySocketService.getOnlineDevices.mockReturnValue([
			{ deviceId: "phone-a", deviceName: "Pixel A" },
		]);

		await (service as any).handleMessage({
			platform: "discord",
			conversationId: "chat-1",
			platformUserId: "user-1",
			text: "/devices",
		});

		expect(remoteControlService.runTask).not.toHaveBeenCalled();
		expect(remoteControlService.doTask).not.toHaveBeenCalled();
		expect(discordBot.sendMessage).toHaveBeenCalledWith(
			"chat-1",
			expect.stringContaining("Pixel A"),
		);
	});
});
