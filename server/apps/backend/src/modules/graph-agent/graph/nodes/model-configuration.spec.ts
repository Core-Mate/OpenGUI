import { END, START, StateGraph } from "@langchain/langgraph";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BillingService } from "../../../credits/billing.service";
import { AgentConfigProvider } from "../../config/agent-config.provider";
import { ModelConfigurationError } from "../../config/model-configuration.error";
import { AgentStateSchema } from "../state/state.types";
import { createVisionModelNode } from "./executor/vision-model.node";
import { createSupervisorNode } from "./plan-supervisor.node";
import { createSummarizerNode } from "./summarizer.node";

// Replace storage only; configuration validation and node handling remain real.
jest.mock("@repo/db", () => ({
	prisma: { system_prompt_config: { findFirst: jest.fn() } },
}));
jest.mock("uuid", () => ({ v4: () => "test-trace-id" }));

const state = {
	userId: 1,
	taskId: 2,
	taskExecutionId: 3,
	userInput: "Open Settings",
	userRegion: "CN",
};
const storage = {
	task_execution: {
		updateMany: async () => ({ count: 1 }),
		update: async () => ({}),
	},
};
const gateway = { sendAgentEvent: () => undefined };
const billing = new BillingService();

function nodes(provider: AgentConfigProvider) {
	type Supervisor = Parameters<typeof createSupervisorNode>;
	type Vision = Parameters<typeof createVisionModelNode>;
	type Summarizer = Parameters<typeof createSummarizerNode>;
	const handlers = {
		supervisor: createSupervisorNode(
			provider,
			{} as Supervisor[1],
			{} as Supervisor[2],
			gateway as unknown as Supervisor[3],
			billing,
			storage as unknown as Supervisor[5],
		),
		vision: createVisionModelNode(
			provider,
			{} as Vision[1],
			{} as Vision[2],
			{} as Vision[3],
			billing,
			storage as unknown as Vision[5],
		),
		summarizer: createSummarizerNode(
			provider,
			{} as Summarizer[1],
			storage as unknown as Summarizer[2],
			gateway as unknown as Summarizer[3],
			{} as Summarizer[4],
			billing,
		),
	};
	return Object.fromEntries(
		Object.entries(handlers).map(([name, handler]) => {
			const graph = new StateGraph(AgentStateSchema)
				.addNode("model", handler)
				.addEdge(START, "model")
				.addEdge("model", END)
				.compile();
			return [name, (input: typeof state) => graph.invoke(input)];
		}),
	) as Record<
		keyof typeof handlers,
		(input: typeof state) => Promise<typeof AgentStateSchema.State>
	>;
}

describe("Graph node model configuration failures", () => {
	it.each([
		"supervisor",
		"vision",
		"summarizer",
	] as const)("%s preserves missing settings instead of recovering", async (name) => {
		const provider = new AgentConfigProvider(new ConfigService({}));
		await expect(nodes(provider)[name](state)).rejects.toMatchObject({
			name: "ModelConfigurationError",
			message:
				"Backend is running, but task execution requires model configuration. " +
				"Missing: VLM_API_KEY, VLM_BASE_URL, VLM_MODEL. " +
				"Set these variables in server/apps/backend/.env before executing tasks.",
		});
		await expect(nodes(provider)[name](state)).rejects.toBeInstanceOf(
			ModelConfigurationError,
		);
	});

	it("preserves supervisor recovery for ordinary errors", async () => {
		const provider = {
			getModelConfig: async () => {
				throw new Error("Prompt storage unavailable");
			},
		};
		expect(
			await nodes(provider as unknown as AgentConfigProvider).supervisor(state),
		).toMatchObject({ supervisorError: true });
	});

	it("preserves vision failure state for ordinary errors", async () => {
		const provider = {
			getModelConfig: async () => {
				throw new Error("Model unavailable");
			},
		};
		expect(
			await nodes(provider as unknown as AgentConfigProvider).vision(state),
		).toMatchObject({
			executor: {
				status: "error",
				errorMessage: "VLM call failed: Model unavailable",
			},
		});
	});

	it("preserves summarizer fallback for ordinary errors", async () => {
		const provider = {
			getModelConfig: async () => {
				throw new Error("Model unavailable");
			},
		};
		const result = await nodes(
			provider as unknown as AgentConfigProvider,
		).summarizer(state);
		expect(result.finalSummary).toContain("Open Settings");
		expect(result.messages?.at(-1)?.content).toBe(result.finalSummary);
	});
});

// Error logs are expected in failure-path tests; keep their output readable.
beforeEach(() => {
	const environment = { ...process.env };
	for (const key of ["VLM_API_KEY", "VLM_BASE_URL", "VLM_MODEL"])
		delete environment[key];
	jest.replaceProperty(process, "env", environment);
	jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
	jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
	jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
	jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
