import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { prisma } from "@repo/db";
import { AgentConfigProvider } from "./agent-config.provider";
import { AgentName } from "./types";

jest.mock("@repo/db", () => ({
	prisma: { system_prompt_config: { findFirst: jest.fn() } },
}));

const complete = {
	VLM_API_KEY: "secret-test-key",
	VLM_BASE_URL: "https://model.example/v1",
	VLM_MODEL: "test-model",
};
const row = {
	id: 1,
	agent_name: "plan_supervisor",
	config_name: "default",
	description: null,
	base_url: null,
	api_key: null,
	model_name: null,
	fallback_model: null,
	temperature: 0.2,
	max_tokens: 100,
	top_p: null,
	system_prompt: "Plan safely",
	extra: null,
	is_active: true,
	created_at: new Date("2026-01-01"),
	updated_at: new Date("2026-01-01"),
	region: "CN",
};

function provider(values: Record<string, string | undefined>) {
	return new AgentConfigProvider(new ConfigService(values));
}

beforeEach(() => {
	const environment = { ...process.env };
	for (const key of ["VLM_API_KEY", "VLM_BASE_URL", "VLM_MODEL"])
		delete environment[key];
	jest.replaceProperty(process, "env", environment);
	jest.clearAllMocks();
	(prisma.system_prompt_config.findFirst as jest.Mock).mockResolvedValue(row);
});

describe("AgentConfigProvider model readiness", () => {
	it("can initialize its Nest provider without model configuration", async () => {
		const module = await Test.createTestingModule({
			providers: [
				AgentConfigProvider,
				{
					provide: ConfigService,
					useValue: new ConfigService({}),
				},
			],
		}).compile();
		try {
			await module.init();
			expect(module.get(AgentConfigProvider)).toBeInstanceOf(
				AgentConfigProvider,
			);
			expect(prisma.system_prompt_config.findFirst).not.toHaveBeenCalled();
		} finally {
			await module.close();
		}
	});

	it.each([
		[{}, ["VLM_API_KEY", "VLM_BASE_URL", "VLM_MODEL"]],
		[{ ...complete, VLM_API_KEY: undefined }, ["VLM_API_KEY"]],
		[{ ...complete, VLM_BASE_URL: undefined }, ["VLM_BASE_URL"]],
		[{ ...complete, VLM_MODEL: undefined }, ["VLM_MODEL"]],
		[
			{ ...complete, VLM_API_KEY: "", VLM_MODEL: "" },
			["VLM_API_KEY", "VLM_MODEL"],
		],
		[
			{ ...complete, VLM_API_KEY: "  ", VLM_BASE_URL: "\t", VLM_MODEL: "\n" },
			["VLM_API_KEY", "VLM_BASE_URL", "VLM_MODEL"],
		],
	] as [
		Record<string, string | undefined>,
		string[],
	][])("reports only missing settings before accessing storage: %j", async (values, missing) => {
		const error = await provider(values)
			.getModelConfig(AgentName.PLAN_SUPERVISOR)
			.catch((e) => e);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("ModelConfigurationError");
		expect(error.message).toContain(`Missing: ${missing.join(", ")}.`);
		expect(error.message).toContain("Backend is running");
		expect(error.message).toContain("server/apps/backend/.env");
		expect(error.message).not.toContain("secret-test-key");
		for (const key of Object.keys(complete).filter(
			(key) => !missing.includes(key),
		)) {
			expect(error.message).not.toContain(key);
		}
		expect(prisma.system_prompt_config.findFirst).not.toHaveBeenCalled();
	});

	it("uses complete environment settings and stored prompt options", async () => {
		expect(
			await provider(complete).getModelConfig(AgentName.PLAN_SUPERVISOR),
		).toEqual({
			apiKey: "secret-test-key",
			baseURL: "https://model.example/v1",
			model: "test-model",
			fallbackModel: "test-model",
			temperature: 0.2,
			maxTokens: 100,
			topP: undefined,
			systemPrompt: "Plan safely",
		});
		expect(prisma.system_prompt_config.findFirst).toHaveBeenCalledWith({
			where: {
				agent_name: "plan_supervisor",
				region: "CN",
				is_active: true,
				is_deleted: false,
			},
		});
	});

	it("preserves missing prompt errors when model settings are complete", async () => {
		(prisma.system_prompt_config.findFirst as jest.Mock).mockResolvedValue(
			null,
		);
		await expect(
			provider(complete).getModelConfig(AgentName.PLAN_SUPERVISOR),
		).rejects.toThrow(
			"No active config found for agent: plan-supervisor, region: CN",
		);
	});
});

afterEach(() => jest.restoreAllMocks());
