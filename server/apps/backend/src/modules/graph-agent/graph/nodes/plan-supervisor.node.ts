import { ChatAnthropic } from "@langchain/anthropic";
import {
	AIMessage,
	AIMessageChunk,
	BaseMessage,
	HumanMessage,
	ToolMessage,
} from "@langchain/core/messages";
import {
	LangGraphRunnableConfig,
	interrupt,
} from "@langchain/langgraph";
import { Logger } from "@nestjs/common";
import type { BillingService } from "../../../credits/billing.service";
import type { PrismaService } from "../../../../prisma/prisma.service";
import { z } from "zod";
import {
	AgentEventSource,
	AgentEventType,
} from "../../../../common/base/enum";
import { ExecutionGateway } from "../../../../common/ws";
import type { AgentConfigProvider } from "../../config/agent-config.provider";
import { AgentName } from "../../config/types";
import type {
	MemorySource,
	TaskMemoryValue,
} from "../../memory/task-memory.service";
import type { SkillProvider } from "../../skill/skill.provider";
import { SkillDTO, SkillNodeType } from "../../skill/skill.types";
import { SupervisorTodosToolService } from "../../tools/supervisor-todos.tool";
import { AgentState } from "../state/state.types";
import { tool } from "@langchain/core/tools";
import {createAgent, todoListMiddleware} from "langchain";

const logger = new Logger("SupervisorNode");

/**
 * 过滤消息历史，移除 Tool 调用相关的消息
 * - 移除 ToolMessage
 * - 移除带 tool_calls 的 AIMessage
 * 只保留纯文本的 HumanMessage 和 AIMessage
 */
function filterToolMessages(messages: BaseMessage[]): BaseMessage[] {
	return messages.filter((msg) => {
		if (msg instanceof ToolMessage) {
			return false;
		}
		if (msg instanceof AIMessage) {
			const aiMsg = msg as AIMessage;
			if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
				return false;
			}
		}
		return true;
	});
}

/**
 * 构建 Supervisor 自身可用 Skills 的描述列表
 * 用于 system prompt 中告知模型有哪些 skill 可用（通过 load_skill 工具按需加载）
 */
function buildSkillsDescription(skills: SkillDTO[]): string {
	if (skills.length === 0) {
		return "";
	}

	const skillList = skills
		.map((s) => `- ${s.displayName}: ${s.description}`)
		.join("\n");

	return `# 你的可用Skill

你可以使用 load_skill 工具按需加载以下Skill来增强你的能力：

${skillList}

当你需要某个Skill的专业知识时，请先使用 load_skill Tool 加载它。`;
}

/**
 * 构建 Executor 可选 Skills 的描述列表
 * 用于 Supervisor 在创建 Todo 时选择需要为 Executor 注入的 Skill
 */
function buildExecutorSkillsDescription(skills: SkillDTO[]): string {
	if (skills.length === 0) {
		return "";
	}

	const skillList = skills
		.map((s) => `- ${s.displayName}: ${s.description}`)
		.join("\n");

	return `# Executor 可用Skill

以下Skill可以增强 Executor 的执行能力，请在 write_todos 工具的 required_skills 字段中为每个子任务选择合适的Skill：

${skillList}

在 Todo 的 required_skills 中，填入所需Skill的 name。如不需要任何Skill，省略该字段。`;
}

/**
 * 创建 load_skill 工具
 * 允许模型按需加载 skill 内容
 */
function createLoadSkillTool(skills: SkillDTO[]) {
	const skillMap = new Map(skills.map((s) => [s.name, s]));
	const availableNames = skills.map((s) => s.name);

	return tool(
		async ({ skillName }: { skillName: string }) => {
			const skill = skillMap.get(skillName);
			if (!skill) {
				return `错误：Skill "${skillName}" 不存在。可用Skill：${availableNames.join(", ")}`;
			}
			logger.log(`Agent loading skill ${skillName}`);
			return `## ${skill.displayName} (v${skill.version})

${skill.content}`;
		},
		{
			name: "load_skill",
			description: `加载一个专业Skill以获取其详细指导和上下文。可用Skill：${availableNames.join(", ")}`,
			schema: z.object({
				skillName: z
					.string()
					.describe(
						`要加载的Skill名称，可选值：${availableNames.join(", ")}`,
					),
			}),
		},
	);
}

/**
 * 创建 Supervisor 节点函数
 *
 * 职责（合并了原 plan-generator 和 plan-supervisor 的功能）：
 * - 首次调用：分析用户输入，流式生成执行计划，通过工具创建 Todo 列表
 * - 后续调用：接收 executor 反馈，评估执行结果，通过工具更新 Todo 状态
 *
 * 使用 createAgent 自动处理工具调用循环，
 * 通过 streamMode: "messages" 获取流式文本输出。
 *
 * @param configProvider 配置提供者
 * @param skillProvider Skill 提供者
 * @param supervisorTodosToolService Supervisor Todos 工具服务
 * @param executionGateway 执行网关
 * @param billingService
 * @param prismaService
 * @returns Supervisor 节点函数
 */
export function createSupervisorNode(
	configProvider: AgentConfigProvider,
	skillProvider: SkillProvider,
	supervisorTodosToolService: SupervisorTodosToolService,
	executionGateway: ExecutionGateway,
	billingService: BillingService,
	prismaService: PrismaService,
) {
	return async (
		state: AgentState,
		runnableConfig?: LangGraphRunnableConfig,
	): Promise<Partial<AgentState>> => {
		logger.log(
			`Supervisor node invoked for task ${state.taskExecutionId}`,
		);

		try {
			// === 余额前置拦截 ===
			const balance = await billingService.getBalance(state.userId);
			if (balance.remaining <= 0) {
				logger.warn(`Insufficient balance (${balance.remaining}), suspending before Supervisor call`);
				try {
					await prismaService.task_execution.update({
						where: { id: state.taskExecutionId },
						data: {
							execution_status: "SUSPENDED",
							status_message: "积分不足，请充值后再试",
							updated_at: new Date(),
						},
					});
				} catch (dbErr) {
					logger.error(`Failed to update execution status: ${(dbErr as Error).message}`);
				}
				interrupt("insufficient_balance");
			}

			// 每次执行时获取最新配置，支持配置热更新
			const config = await configProvider.getModelConfig(
				AgentName.PLAN_SUPERVISOR,
				state.userRegion,
			);

			// ===== 召回 Task 级别的长期记忆 =====
			const store = runnableConfig?.store;
			let memoryContext = "";

			if (store && state.taskId) {
				try {
					const memories = await store.search(
						["task_memory", state.taskId.toString()],
						{ limit: 20 },
					);

					if (memories.length > 0) {
						const sorted = memories.sort((a, b) => {
							const weightA =
								(a.value as TaskMemoryValue).weight || 0;
							const weightB =
								(b.value as TaskMemoryValue).weight || 0;
							return weightB - weightA;
						});

						const sourceLabels: Record<MemorySource, string> = {
							feedback: "用户反馈",
							instruction: "追加指令",
							summary: "执行总结",
						};

						memoryContext = sorted
							.map((m) => {
								const val = m.value as TaskMemoryValue;
								const label =
									sourceLabels[val.source] || val.source;
								return `[${label}] ${val.content}`;
							})
							.join("\n\n---\n\n");

						logger.debug(
							`Recalled ${memories.length} memories for task ${state.taskId}`,
						);
					}
				} catch (error) {
					logger.warn(
						`Failed to recall memories: ${(error as Error).message}`,
					);
				}
			}

			// ===== 获取 Skills =====
			const tenantId = state.tenantId ?? -1;

			// Supervisor 自身使用的 skills
			const supervisorSkills = await skillProvider.getSkillsForNode(
				SkillNodeType.PLAN_SUPERVISOR,
				tenantId,
				state.userRegion,
			);

			// 可供 Executor 使用的 skills
			const executorSkills = await skillProvider.getSkillsForNode(
				SkillNodeType.EXECUTOR_VLM,
				tenantId,
				state.userRegion,
			);

			// ===== 构建增强 System Prompt =====
			const supervisorSkillsDesc =
				buildSkillsDescription(supervisorSkills);
			const executorSkillsDesc =
				buildExecutorSkillsDescription(executorSkills);

			let enhancedSystemPrompt = config.systemPrompt;
			if (supervisorSkillsDesc) {
				enhancedSystemPrompt += `\n\n---\n\n${supervisorSkillsDesc}`;
			}
			if (executorSkillsDesc) {
				enhancedSystemPrompt += `\n\n---\n\n${executorSkillsDesc}`;
			}
			if (memoryContext) {
				enhancedSystemPrompt += `\n\n---\n\n# 历史记忆\n以下是该任务的历史执行记忆，请参考这些信息来优化任务执行：\n\n${memoryContext}`;
			}

			// ===== 创建模型 =====
			const primaryModel = new ChatAnthropic({
				model: config.model,
				apiKey: config.apiKey,
				clientOptions: {
					baseURL: config.baseURL,
					maxRetries: 2,
					timeout: 60000,
					authToken: null,
				},
				...(config.temperature != null && {
					temperature: config.temperature,
				}),
			});

			// ===== 创建工具 =====
			const writeTodosTool =
				supervisorTodosToolService.createWriteTodosTool();
			const readTodosTool =
				supervisorTodosToolService.createReadTodosTool();

			const tools: any[] = [writeTodosTool, readTodosTool];
			// const tools: any[] = [];

			if (supervisorSkills.length > 0) {
				const loadSkillTool = createLoadSkillTool(supervisorSkills);
				tools.push(loadSkillTool);
			}

			// ===== 创建 Agent（自动处理工具调用循环）=====
			// createAgent 的 bindTools 不支持 RunnableWithFallbacks，
			// 直接传 primaryModel（已配置 maxRetries: 2 提供重试能力）
			const agent = createAgent({
				model: primaryModel,
				tools,
				// middleware: [todoListMiddleware()],
				systemPrompt: enhancedSystemPrompt,
			});

			// ===== 构建输入消息 =====
			const isFirstCall =
				!state.executorOutput?.task &&
				!state.executorInput?.instruction;

			const filteredHistory = filterToolMessages(
				state.plannerMessages || [],
			);

			// 窗口限制：发送给模型的历史消息最多 10 条
			// （state 中仍保留完整历史，窗口仅影响 LLM 输入）
			const PLANNER_MODEL_WINDOW = 10;
			const modelHistory = filteredHistory.length > PLANNER_MODEL_WINDOW
				? filteredHistory.slice(-PLANNER_MODEL_WINDOW)
				: filteredHistory;

			let humanMessage: HumanMessage;

			if (isFirstCall) {
				// 首次调用：生成执行计划并创建 Todo 列表
				humanMessage = new HumanMessage({
					content: `请为以下用户任务进行分析和规划，流式输出你的执行计划，然后使用 write_todos 工具创建子任务列表：
注意：
- write_todos 的 todos 字段必须传数组，不要传空对象，也不要把数组包成字符串
- content 中的引号必须转义：使用 \\" 而非裸引号，或改用「」『』“”等中文符号，否则 JSON 解析会失败

## 用户指令
${state.userInput}`,
					additional_kwargs: {
						created_at: new Date().toISOString(),
					},
				});
			} else {
				// 后续调用：评估 Executor 执行结果
				humanMessage = new HumanMessage({
					content: `## 子任务执行反馈
**子任务**: ${state.executorOutput?.task || state.executorInput?.instruction || "未知"}
**结果**: ${state.executorOutput?.success ? "执行成功" : "执行失败"}
**记录的关键信息**: ${state.executorOutput?.notes || state.executorOutput?.fail_reason || "无"}

请使用 read_todos 工具查看当前任务列表状态，然后根据执行结果决定下一步操作：
- 如果子任务成功，使用 write_todos 标记完成并准备下一个子任务
- 如果子任务失败，分析原因并调整后重试或重新规划
- 如果所有任务都完成，在你的回复中明确说明"所有任务已完成"`,
					additional_kwargs: {
						created_at: new Date().toISOString(),
					},
				});
			}

			// ===== 流式执行 Agent =====
			let accumulatedText = "";
			let streamTotalTokens = 0;

			const signal = runnableConfig?.signal;
			const stream = await agent.stream(
				{ messages: [...modelHistory, humanMessage] },
				{
					recursionLimit: 25,
					streamMode: "messages" as const,
					signal,
				},
			);

			for await (const chunk of stream) {
				// 检查 abort signal，尽早退出以节省 token
				if (signal?.aborted) break;

				const [messageChunk] = chunk as [AIMessageChunk, unknown];

				// Accumulate token usage from chunks
				if (messageChunk instanceof AIMessageChunk && messageChunk.usage_metadata?.total_tokens) {
					streamTotalTokens += messageChunk.usage_metadata.total_tokens;
				}

				// 只处理 LLM 输出的 AIMessageChunk，跳过 ToolMessage 等
				if (!(messageChunk instanceof AIMessageChunk)) continue;

				const content = messageChunk.content;
				if (Array.isArray(content)) {
					for (const block of content) {
						if (
							block.type === "tool_use" ||
							block.type === "tool_call"
						) {
							const toolName =
								(block as any).name || "";
							if (toolName) {
								executionGateway.sendAgentEvent(
									state.taskExecutionId,
									{
										type: AgentEventType.TOOL_CALL,
										taskExecutionId:
											state.taskExecutionId,
										from: AgentEventSource.PLAN_SUPERVISOR,
										content: JSON.stringify({
											toolName,
										}),
									},
								);
							}
							continue;
						}

						if (
							block.type === "thinking" &&
							"thinking" in block &&
							block.thinking
						) {
							const sent = executionGateway.sendAgentEvent(
								state.taskExecutionId,
								{
									type: AgentEventType.REASONING_DELTA,
									taskExecutionId:
										state.taskExecutionId,
									from: AgentEventSource.PLAN_SUPERVISOR,
									content: block.thinking as string,
								},
							);
							if (!sent) break;
						} else if (
							block.type === "text" &&
							"text" in block &&
							block.text
						) {
							const textContent = block.text as string;
							accumulatedText += textContent;
							const sent = executionGateway.sendAgentEvent(
								state.taskExecutionId,
								{
									type: AgentEventType.TEXT_DELTA,
									taskExecutionId:
										state.taskExecutionId,
									from: AgentEventSource.PLAN_SUPERVISOR,
									content: textContent,
								},
							);
							if (!sent) break;
						}
					}
				} else if (typeof content === "string" && content) {
					accumulatedText += content;
					const sent = executionGateway.sendAgentEvent(
						state.taskExecutionId,
						{
							type: AgentEventType.TEXT_DELTA,
							taskExecutionId: state.taskExecutionId,
							from: AgentEventSource.PLAN_SUPERVISOR,
							content: content,
						},
					);
					if (!sent) break;
				}
			}

			// 发送完成事件
			executionGateway.sendAgentEvent(state.taskExecutionId, {
				type: AgentEventType.FINISH,
				taskExecutionId: state.taskExecutionId,
				from: AgentEventSource.PLAN_SUPERVISOR,
				content: "",
			});

			logger.log(
				`Supervisor completed. Output length: ${accumulatedText.length}`,
			);

			// === Billing: deduct credits based on accumulated stream token usage ===
			if (streamTotalTokens > 0) {
				const billing = await billingService.deductByTokens(
					state.userId,
					streamTotalTokens,
					state.taskId,
					state.taskExecutionId,
				);
				if (!billing.success) {
					logger.error(
						`Billing deduction failed for user ${state.userId} (${streamTotalTokens} tokens)`,
					);
				}
			}

			// 只返回本轮新增消息，由 MessagesValue reducer 追加到 state
			// （窗口限制已在 modelHistory 处理，state 保留完整历史供 summarizer 参考）
			return {
				plannerMessages: [
					humanMessage,
					new AIMessage({ content: accumulatedText }),
				],
				supervisorStreamOutput: accumulatedText,
				// 首次调用时设置 planDocument（用于 summarizer）
				...(isFirstCall ? { planDocument: accumulatedText } : {}),
			};
		} catch (error) {
			const err = error as Error;

			// GraphInterrupt from billing interrupt — re-throw without logging as error
			if (err.name === "GraphInterrupt") {
				throw error;
			}

			// AbortError 必须 re-throw，graph 才能正确终止（cancel/pause/lease_expired）
			if (err.name === "AbortError" || err.message?.includes("abort")) {
				throw error;
			}

			logger.error(
				`Supervisor node error: ${err.message}`,
				err.stack,
			);

			executionGateway.sendAgentEvent(state.taskExecutionId, {
				type: AgentEventType.ERROR,
				taskExecutionId: state.taskExecutionId,
				from: AgentEventSource.PLAN_SUPERVISOR,
				content: JSON.stringify({ error: err.message }),
			});

			// 不再 throw — 返回错误状态，路由层会将其导向 summarizer 生成补救总结
			return {
				supervisorError: true,
			};
		}
	};
}
