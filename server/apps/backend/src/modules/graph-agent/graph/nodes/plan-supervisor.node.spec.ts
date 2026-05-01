/**
 * Plan Supervisor 结构化输出集成测试
 *
 * 验证 ChatOpenAI + createAgent + providerStrategy 能否拿到 structuredResponse
 * 使用真实模型调用，mock 数据尽量简化
 *
 * 运行：pnpm test -- plan-supervisor.node.spec
 */

import { HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, providerStrategy } from "langchain";
import { z } from "zod";

// ====== API 配置（与 plan-supervisor.node.ts 保持一致）======
const API_KEY = process.env.VLM_API_KEY ?? "test-api-key-placeholder";
const BASE_URL =
	process.env.VLM_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MODEL = process.env.VLM_MODEL ?? "qwen3.6-plus";
// =============================================================

const SupervisorOutputSchema = z.object({
	current_sub_task: z
		.string()
		.describe("当前需要执行的子任务，只有在total_complete=true的情况下才可以为空"),
	required_skills: z
		.array(z.string())
		.describe(
			"Executor执行当前子任务所需的Skill名称列表，从可用Skill中选择，如不需要则返回空数组",
		),
	total_complete: z.boolean().describe("是否已经完成所有任务"),
});

type SupervisorOutput = z.infer<typeof SupervisorOutputSchema>;

// ====== Mock 工具 ======
const mockWriteTodos = tool(
	async ({ todos }) => `已创建 ${todos.length} 个待办事项`,
	{
		name: "write_todos",
		description: "创建或更新待办事项列表",
		schema: z.object({
			todos: z.array(
				z.object({
					content: z.string(),
					status: z.enum(["pending", "in_progress", "completed", "failed"]),
				}),
			),
		}),
	},
);

const mockReadTodos = tool(
	async () => JSON.stringify({ todos: [], message: "当前没有待办事项" }),
	{
		name: "read_todos",
		description: "读取当前待办事项列表",
		schema: z.object({
			reason: z.string().describe("简述为何需要读取任务列表"),
		}),
	},
);

const mockLoadSkill = tool(
	async ({ skillName }) => `## ${skillName}\n\n这是 ${skillName} 的详细内容。`,
	{
		name: "load_skill",
		description: "加载一个专业Skill以获取其详细指导和上下文。可用Skill：weibo_search",
		schema: z.object({
			skillName: z.string().describe("要加载的Skill名称"),
		}),
	},
);

describe("PlanSupervisor - ChatOpenAI 结构化输出集成测试", () => {
	let model: ChatOpenAI;

	beforeAll(() => {
		model = new ChatOpenAI({
			model: MODEL,
			apiKey: API_KEY,
			maxRetries: 2,
			timeout: 120000,
			configuration: {
				baseURL: BASE_URL,
			},
		});
	});

	it("无工具：providerStrategy 直接返回 structuredResponse", async () => {
		const agent = createAgent({
			model,
			tools: [],
			systemPrompt:
				"你是一个任务拆解专家。根据用户的任务描述，输出你的决策。使用中文。",
			responseFormat: providerStrategy({
				schema: SupervisorOutputSchema,
				strict: true,
			}),
		});

		const result = await agent.invoke({
			messages: [new HumanMessage("帮我整理前10条笔记信息")],
		});

		const response = result.structuredResponse as SupervisorOutput;
		console.log(
			"[无工具] structuredResponse:",
			JSON.stringify(response, null, 2),
		);

		expect(response).toBeDefined();
		expect(typeof response.current_sub_task).toBe("string");
		expect(response.current_sub_task.length).toBeGreaterThan(0);
		expect(Array.isArray(response.required_skills)).toBe(true);
		expect(typeof response.total_complete).toBe("boolean");
	}, 120000);

	it("带工具：模型先调用工具再返回 structuredResponse", async () => {
		const agent = createAgent({
			model,
			tools: [mockWriteTodos, mockReadTodos],
			systemPrompt: `你是移动端自动化任务的编排专家。
1. 分析用户任务，拆解为子任务
2. 使用 write_todos 工具创建待办事项
3. 输出第一个需要执行的子任务
使用中文。`,
			responseFormat: providerStrategy({
				schema: SupervisorOutputSchema,
				strict: true,
			}),
		});

		const result = await agent.invoke({
			messages: [
				new HumanMessage("帮我在微博搜索新能源汽车相关帖子并收集用户评价"),
			],
		});

		const response = result.structuredResponse as SupervisorOutput;
		console.log(
			"[带工具] structuredResponse:",
			JSON.stringify(response, null, 2),
		);
		console.log("[带工具] 消息数量:", result.messages.length);

		expect(response).toBeDefined();
		expect(typeof response.current_sub_task).toBe("string");
		expect(response.current_sub_task.length).toBeGreaterThan(0);
		expect(response.total_complete).toBe(false);
	}, 120000);

	it("带 load_skill 工具：模拟 supervisor 加载 skill 后返回结构化输出", async () => {
		const agent = createAgent({
			model,
			tools: [mockWriteTodos, mockReadTodos, mockLoadSkill],
			systemPrompt: `你是移动端自动化任务的编排专家。

# 你的可用Skill
你可以使用 load_skill 工具按需加载以下Skill来增强你的能力：
- weibo_search: 微博搜索和数据采集的专业指导

# Executor 可用Skill
以下Skill可以增强 Executor 的执行能力，请根据子任务帮 Executor 挑选合适的Skill：
- app_navigation: 应用内页面导航操作
- data_collection: 数据采集与整理

在输出 required_skills 时，填入所需Skill的 name。如不需要任何Skill，返回空数组 []。
使用中文。`,
			responseFormat: providerStrategy({
				schema: SupervisorOutputSchema,
				strict: true,
			}),
		});

		const result = await agent.invoke({
			messages: [
				new HumanMessage("帮我在微博搜索AI相关热门帖子"),
			],
		});

		const response = result.structuredResponse as SupervisorOutput;
		console.log(
			"[带load_skill] structuredResponse:",
			JSON.stringify(response, null, 2),
		);
		console.log("[带load_skill] 消息数量:", result.messages.length);

		expect(response).toBeDefined();
		expect(typeof response.current_sub_task).toBe("string");
		expect(response.current_sub_task.length).toBeGreaterThan(0);
		expect(Array.isArray(response.required_skills)).toBe(true);
		expect(response.total_complete).toBe(false);
	}, 120000);

	it("完成场景：所有任务完成时返回 total_complete=true", async () => {
		const completedReadTodos = tool(
			async () =>
				JSON.stringify({
					todos: [
						{ content: "搜索并收集数据", status: "completed" },
						{ content: "整理汇总", status: "completed" },
					],
				}),
			{
				name: "read_todos",
				description: "读取当前待办事项列表",
				schema: z.object({
					reason: z.string().describe("简述为何需要读取任务列表"),
				}),
			},
		);

		const agent = createAgent({
			model,
			tools: [mockWriteTodos, completedReadTodos],
			systemPrompt:
				"你是移动端自动化任务的编排专家。根据执行反馈评估任务完成情况。使用中文。",
			responseFormat: providerStrategy({
				schema: SupervisorOutputSchema,
				strict: true,
			}),
		});

		const result = await agent.invoke({
			messages: [
				new HumanMessage(`## 子任务执行反馈
**任务**: 整理汇总所有收集的新能源汽车用户评价
**结果**: 执行成功
**记录的关键信息**: 已完成所有数据整理

请使用 read_todos 工具查看当前任务列表状态，然后决定下一步操作。`),
			],
		});

		const response = result.structuredResponse as SupervisorOutput;
		console.log(
			"[完成场景] structuredResponse:",
			JSON.stringify(response, null, 2),
		);

		expect(response).toBeDefined();
		expect(response.total_complete).toBe(true);
	}, 120000);

	it("多轮对话：模拟首次规划 + 执行反馈的连续调用", async () => {
		const todosState: Array<{ content: string; status: string }> = [];

		const statefulWriteTodos = tool(
			async ({ todos }) => {
				todosState.length = 0;
				todosState.push(...todos);
				return `已创建 ${todos.length} 个待办事项`;
			},
			{
				name: "write_todos",
				description: "创建或更新待办事项列表",
				schema: z.object({
					todos: z.array(
						z.object({
							content: z.string(),
							status: z.enum([
								"pending",
								"in_progress",
								"completed",
								"failed",
							]),
						}),
					),
				}),
			},
		);

		const statefulReadTodos = tool(
			async () => JSON.stringify({ todos: todosState }),
			{
				name: "read_todos",
				description: "读取当前待办事项列表",
				schema: z.object({
					reason: z.string().describe("简述为何需要读取任务列表"),
				}),
			},
		);

		const systemPrompt = `你是移动端自动化任务的编排专家。
1. 首次调用时，分析任务并使用 write_todos 创建待办事项
2. 后续调用时，根据执行反馈更新任务状态并下发下一个子任务
3. 所有子任务完成后设置 total_complete=true
使用中文。`;

		// 第一轮：首次规划
		const agent1 = createAgent({
			model,
			tools: [statefulWriteTodos, statefulReadTodos],
			systemPrompt,
			responseFormat: providerStrategy({
				schema: SupervisorOutputSchema,
				strict: true,
			}),
		});

		const result1 = await agent1.invoke({
			messages: [new HumanMessage("帮我打开微信发一条消息给张三说明天开会")],
		});

		const response1 = result1.structuredResponse as SupervisorOutput;
		console.log(
			"[多轮-第1轮] structuredResponse:",
			JSON.stringify(response1, null, 2),
		);
		console.log("[多轮-第1轮] todos 状态:", JSON.stringify(todosState));

		expect(response1).toBeDefined();
		expect(response1.total_complete).toBe(false);
		expect(response1.current_sub_task.length).toBeGreaterThan(0);

		// 标记第一个任务完成
		if (todosState.length > 0) {
			todosState[0].status = "completed";
		}

		// 第二轮：执行反馈
		const agent2 = createAgent({
			model,
			tools: [statefulWriteTodos, statefulReadTodos],
			systemPrompt,
			responseFormat: providerStrategy({
				schema: SupervisorOutputSchema,
				strict: true,
			}),
		});

		const result2 = await agent2.invoke({
			messages: [
				new HumanMessage(`## 子任务执行反馈
**任务**: ${response1.current_sub_task}
**结果**: 执行成功
**记录的关键信息**: 已完成该步骤

请使用 read_todos 工具查看当前任务列表状态，然后决定下一步操作。`),
			],
		});

		const response2 = result2.structuredResponse as SupervisorOutput;
		console.log(
			"[多轮-第2轮] structuredResponse:",
			JSON.stringify(response2, null, 2),
		);

		expect(response2).toBeDefined();
		// 第二轮应该要么继续下一个子任务，要么完成
		if (response2.total_complete) {
			// 如果所有任务都完成了
			expect(response2.total_complete).toBe(true);
		} else {
			// 还有下一个子任务
			expect(response2.current_sub_task.length).toBeGreaterThan(0);
		}
	}, 240000);
});
