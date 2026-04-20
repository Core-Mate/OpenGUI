import { ChatAnthropic } from "@langchain/anthropic";
import {
	AIMessage,
	AIMessageChunk,
	BaseMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import { StructuredToolInterface } from "@langchain/core/tools";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { Logger } from "@nestjs/common";
import { AgentEventSource, AgentEventType } from "../../../../common/base/enum";
import { ExecutionGateway } from "../../../../common/ws";
import { PrismaService } from "../../../../prisma/prisma.service";
import type { BillingService } from "../../../credits/billing.service";
import type { AgentConfigProvider } from "../../config/agent-config.provider";
import { AgentName } from "../../config/types";
import type { TaskMemoryService } from "../../memory/task-memory.service";
import { WorkingMemoryToolService } from "../../tools/working-memory.tool";
import { AgentState } from "../state/state.types";

const logger = new Logger("SummarizerNode");

/**
 * 工具调用最大循环次数（防止无限循环）
 */
const MAX_TOOL_CALL_ITERATIONS = 5;

/**
 * 思考摘要最大抽样数量
 */
const MAX_SUMMARY_SAMPLE_SIZE = 100;

/**
 * 对数组进行均匀抽样
 *
 * 规则：
 * - 如果数组长度 <= maxSize，返回全量
 * - 如果数组长度 > maxSize，均匀抽取 maxSize 条
 *
 * 例如：150 条取 100 条，步长 1.5，取第 0, 1, 3, 4, 6, 7, 9, ... 条
 *
 * @param items 原始数组
 * @param maxSize 最大抽样数量
 * @returns 抽样后的数组
 */
function sampleArray<T>(items: T[], maxSize: number): T[] {
	if (items.length <= maxSize) {
		return items;
	}

	// 使用浮点步长确保能取满 maxSize 条且均匀分布
	const step = items.length / maxSize;
	const sampled: T[] = [];

	for (let i = 0; i < maxSize; i++) {
		const index = Math.floor(i * step);
		sampled.push(items[index]);
	}

	return sampled;
}

/**
 * 创建 Summarizer 节点函数
 *
 * 每次执行时从配置中心获取最新的模型配置和 System Prompt
 * 使用 ChatAnthropic + stream 模式流式获取输出，完成后更新数据库
 *
 * @param configProvider 配置提供者
 * @param workingMemoryToolService 工作记忆工具服务
 * @param prismaService Prisma 数据库服务
 * @param executionGateway 执行网关
 * @param taskMemoryService 任务记忆服务（用于提取关键信息后存储到长期记忆）
 * @returns Summarizer 节点函数
 */
export function createSummarizerNode(
	configProvider: AgentConfigProvider,
	workingMemoryToolService: WorkingMemoryToolService,
	prismaService: PrismaService,
	executionGateway: ExecutionGateway,
	taskMemoryService: TaskMemoryService,
	billingService: BillingService,
) {
	return async (
		state: AgentState,
		runnableConfig?: LangGraphRunnableConfig,
	): Promise<Partial<AgentState>> => {
		logger.log(`Summarizer node invoked for task ${state.taskExecutionId}`);

		// ===== 原子更新：防止重复执行 =====
		// 只有当状态不是 SUMMARIZING/FINISHED 时才更新
		const updateResult = await prismaService.task_execution.updateMany({
			where: {
				id: state.taskExecutionId,
				execution_status: {
					notIn: ["SUMMARIZING", "FINISHED"],
				},
			},
			data: {
				execution_status: "SUMMARIZING",
				updated_at: new Date(),
			},
		});

		// 如果没有更新（count=0），说明已有其他路径在执行或已完成
		if (updateResult.count === 0) {
			logger.log(
				`Summarizer already running or finished for task ${state.taskExecutionId}, skipping duplicate execution`,
			);
			// 返回现有的 finalSummary（如果有）
			return { finalSummary: state.finalSummary || null };
		}

		logger.log(
			`Execution ${state.taskExecutionId} status updated to SUMMARIZING`,
		);

		try {
			// 获取完整模型配置（包含 systemPrompt）
			const config = await configProvider.getModelConfig(
				AgentName.SUMMARIZER,
				state.userRegion,
			);

			// 创建模型实例（不需要 thinking）
			const model = new ChatAnthropic({
				model: config.model,
				apiKey: config.apiKey,
				temperature: config.temperature || 0.1,
				maxTokens: 64000,
				clientOptions: {
					baseURL: config.baseURL,
					maxRetries: 3,
					timeout: 60000,
					authToken: null,
				},
			});

			// 创建工具列表
			const tools: StructuredToolInterface[] = [
				workingMemoryToolService.createGetTool(),
			];

			const modelWithToolsAndFallbacks = model.bindTools(tools);

			// 构建任务完成情况
			const taskStatus = buildTaskStatus(state);

			// 构建思考摘要文本（对过长的列表进行均匀抽样）
			const sampledSummaryList = sampleArray(
				state.actionSummaryList,
				MAX_SUMMARY_SAMPLE_SIZE,
			);
			const thinkingSummary =
				sampledSummaryList.length > 0 ? sampledSummaryList.join("\n") : "无";

			// 如果是 fork 执行，获取原执行的 summary
			let historySummarySection = "";
			if (state.originExecutionId) {
				try {
					const originExecution = await prismaService.task_execution.findUnique(
						{
							where: { id: state.originExecutionId },
							select: { execution_result_summary: true },
						},
					);
					if (originExecution?.execution_result_summary) {
						historySummarySection = `
## 历史执行总结
以下是之前执行的总结，请结合这些信息进行综合总结：
${originExecution.execution_result_summary}
`;
						logger.log(
							`[FORK] Including origin execution summary for execution ${state.originExecutionId}`,
						);
					}
				} catch (error) {
					logger.warn(
						`[FORK] Failed to fetch origin execution summary: ${(error as Error).message}`,
					);
				}
			}

			// 构建消息列表（注入当前日期，防止总结报告日期错误）
			const now = new Date();
			const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
			const messages: BaseMessage[] = [
				new SystemMessage(
					`${config.systemPrompt}\n\n当前日期: ${currentDate}`,
				),
				new HumanMessage(`请为以下任务执行创建总结：

## 任务信息
- **用户原始指令**: ${state.userInput}
${state.planDocument ? `- **模型规划的预期执行路径**：${state.planDocument}` : ""}
- **最终状态**: ${taskStatus}
${historySummarySection}
### GUI Agent执行思维链
${thinkingSummary}

## 收集的信息
请调用 get_working_memory 工具获取执行过程中收集的信息，并将其整合到总结中。

${state.isCancelled ? "## 注意\n任务被用户主动取消。请根据已经执行的子任务和思考过程，对以上任务执行情况进行总结。" : ""}

请对以上任务执行情况进行总结。`),
			];

			// 构建 extra 信息，包含当前 execution 的执行结果
			const extraResult = {
				extraResult: state.executorOutput ?? null,
			};

			// 发送 TEXT_START 事件，通知客户端即将开始输出 Markdown 内容
			executionGateway.sendAgentEvent(state.taskExecutionId, {
				type: AgentEventType.TEXT_START,
				taskExecutionId: state.taskExecutionId,
				from: AgentEventSource.SUMMARIZER,
				content: "",
				extra: extraResult,
			});

			// 收集总结内容
			let summary = "";
			let summarizerTokens = 0;
			const conversationMessages = [...messages];
			let iterations = 0;

			// 工具调用循环
			while (iterations < MAX_TOOL_CALL_ITERATIONS) {
				iterations++;

				// 检查 abort signal
				if (runnableConfig?.signal?.aborted) break;

				// 流式调用模型
				const stream = await modelWithToolsAndFallbacks.stream(
					conversationMessages,
					runnableConfig,
				);

				// 累积完整消息以获取工具调用
				let fullMessage: AIMessageChunk | null = null;
				let firstTokenNotified = false;

				// 处理流式输出
				for await (const chunk of stream) {
					// 检查 abort signal，尽早退出
					if (runnableConfig?.signal?.aborted) break;

					// 首个 chunk 到达：通知调用方取消首 token 超时
					if (!firstTokenNotified) {
						firstTokenNotified = true;
						const onFirstToken = (runnableConfig?.configurable as Record<string, unknown>)?.onFirstToken;
						if (typeof onFirstToken === "function") (onFirstToken as () => void)();
					}

					// 累积消息以便后续获取完整的 tool_calls
					fullMessage = fullMessage
						? (fullMessage.concat(chunk) as AIMessageChunk)
						: chunk;

					// Accumulate token usage
					if (chunk.usage_metadata?.total_tokens) {
						summarizerTokens += chunk.usage_metadata.total_tokens;
					}

					// 处理流式内容块，累积文本
					const content = chunk.content;
					if (Array.isArray(content)) {
						for (const block of content) {
							// 跳过工具调用相关的块类型
							if (block.type === "tool_use") {
								continue;
							}

							if (block.type === "text" && "text" in block && block.text) {
								// 累积文本内容
								const textContent = block.text as string;
								summary += textContent;
								// 通过 SSE 流式下发给客户端
								const sent = executionGateway.sendAgentEvent(state.taskExecutionId, {
									type: AgentEventType.TEXT_DELTA,
									taskExecutionId: state.taskExecutionId,
									from: AgentEventSource.SUMMARIZER,
									content: textContent,
									extra: extraResult,
								});
								if (!sent) break;
							}
						}
					}
				}

				// 流结束后，检查是否有工具调用
				if (!fullMessage?.tool_calls || fullMessage.tool_calls.length === 0) {
					// 没有工具调用，任务完成
					break;
				}

				// 有工具调用，创建新的 AIMessage 添加到历史
				// 关键修复：使用空字符串 content + tool_calls
				// 这样 @langchain/anthropic 会正确将 tool_calls 转换为 tool_use 块
				// 避免流式 concat 导致的 content/tool_calls ID 不匹配问题
				const aiMessageWithToolCalls = new AIMessage({
					content: "", // 使用空字符串，让 tool_calls 被正确处理
					tool_calls: fullMessage.tool_calls,
				});
				conversationMessages.push(aiMessageWithToolCalls);

				// 执行工具调用
				logger.log(
					`Processing ${fullMessage.tool_calls.length} tool calls (iteration ${iterations})`,
				);

				const toolMessages: ToolMessage[] = [];
				for (const toolCall of fullMessage.tool_calls) {
					const tool = tools.find((t) => t.name === toolCall.name);
					if (!tool) {
						logger.warn(`Tool not found: ${toolCall.name}`);
						toolMessages.push(
							new ToolMessage({
								tool_call_id: toolCall.id || "",
								content: `Error: Tool "${toolCall.name}" not found`,
							}),
						);
						continue;
					}

					try {
						logger.debug(`Executing tool: ${toolCall.name}`);
						const result = await tool.invoke(toolCall.args, runnableConfig);
						const resultStr =
							typeof result === "string" ? result : JSON.stringify(result);
						toolMessages.push(
							new ToolMessage({
								tool_call_id: toolCall.id || "",
								content: resultStr,
							}),
						);
						logger.debug(`Tool ${toolCall.name} completed`);
					} catch (error) {
						logger.error(
							`Tool ${toolCall.name} failed: ${(error as Error).message}`,
						);
						toolMessages.push(
							new ToolMessage({
								tool_call_id: toolCall.id || "",
								content: `Error: ${(error as Error).message}`,
							}),
						);
					}
				}

				// 添加工具结果到历史
				conversationMessages.push(...toolMessages);
			}

			// 检查是否超过最大迭代次数
			if (iterations >= MAX_TOOL_CALL_ITERATIONS) {
				logger.warn(
					`Reached max tool call iterations (${MAX_TOOL_CALL_ITERATIONS})`,
				);
			}

			// === Billing: deduct credits (no interrupt — summarizer must complete) ===
			if (summarizerTokens > 0) {
				const billing = await billingService.deductByTokens(
					state.userId,
					summarizerTokens,
					state.taskId,
					state.taskExecutionId,
				);
				if (billing.insufficientBalance) {
					logger.warn(
						`Insufficient balance for user ${state.userId} during summarizer (${summarizerTokens} tokens), continuing anyway`,
					);
				}
			}

			logger.log(`Summary generated: ${summary.substring(0, 100)}...`);

			// 只有当 summary 有实际内容时才写入数据库，防止空值覆盖有效值
			if (summary && summary.trim().length > 0) {
				await prismaService.task_execution.update({
					where: { id: state.taskExecutionId },
					data: {
						execution_result_summary: summary,
						updated_at: new Date(),
					},
				});

				logger.log(
					`Updated execution_result_summary for task ${state.taskExecutionId}`,
				);
			} else {
				logger.warn(
					`Skipping empty summary update for task ${state.taskExecutionId}, preserving existing value`,
				);
			}

			// ===== 存储 summary 到长期记忆（异步提取关键信息后存储） =====
			const store = runnableConfig?.store;
			if (store && state.taskId && summary) {
				// 异步提取并存储，不阻塞主流程
				void taskMemoryService
					.storeMemory(store, {
						taskId: state.taskId,
						executionId: state.taskExecutionId,
						source: "summary",
						content: summary,
						userInput: state.userInput,
						userId: state.userId,
					})
					.catch((error) => {
						logger.warn(
							`Failed to store summary memory: ${(error as Error).message}`,
						);
					});
			}

			// 发送 FINISH 事件通知客户端总结生成完成
			executionGateway.sendAgentEvent(state.taskExecutionId, {
				type: AgentEventType.FINISH,
				taskExecutionId: state.taskExecutionId,
				from: AgentEventSource.SUMMARIZER,
				content: "",
				extra: extraResult,
			});

			return {
				finalSummary: summary,
				messages: [
					...state.messages,
					new AIMessage({
						content: `任务总结:\n${summary}`,
						name: "summarizer",
						additional_kwargs: {
							created_at: new Date().toISOString(),
						},
					}),
				],
			};
		} catch (error) {
			const err = error as Error;
			logger.error(`Summarizer node error: ${err.message}`, err.stack);

			// AbortError 必须 re-throw，否则 graph 无法正确终止
			if (err.name === "AbortError" || err.message?.includes("abort")) {
				throw error;
			}

			// 生成基本总结作为备用
			const basicSummary = generateFallbackSummary(state);

			// 尝试更新数据库（备用总结）
			try {
				await prismaService.task_execution.update({
					where: { id: state.taskExecutionId },
					data: {
						execution_result_summary: basicSummary,
						updated_at: new Date(),
					},
				});
			} catch (dbError) {
				logger.warn(
					`Failed to update execution_result_summary: ${(dbError as Error).message}`,
				);
			}

			const errorSummary = basicSummary || "任务总结失败";
			return {
				finalSummary: errorSummary,
				messages: [
					...state.messages,
					new AIMessage({
						content: errorSummary,
						name: "summarizer",
						additional_kwargs: {
							created_at: new Date().toISOString(),
						},
					}),
				],
			};
		}
	};
}

/**
 * 构建任务状态描述
 */
function buildTaskStatus(state: AgentState): string {
	if (state.isCancelled) {
		return "已取消";
	}

	if (state.planTodoComplete) {
		return "全部完成";
	}

	return state.executorOutput?.success ? "成功完成" : "执行失败";
}

/**
 * 生成备用总结
 */
function generateFallbackSummary(state: AgentState): string {
	const execResult = state.executorOutput;
	const status = state.isCancelled
		? "已取消"
		: execResult?.success
			? "成功"
			: "失败";

	// 构建思考摘要文本（对过长的列表进行均匀抽样）
	const sampledSummaryList = sampleArray(
		state.actionSummaryList,
		MAX_SUMMARY_SAMPLE_SIZE,
	);
	const thinkingSummary =
		sampledSummaryList.length > 0 ? sampledSummaryList.join("\n") : "无";

	let summary = `## 任务总结

### 执行状态
${status}

### 用户指令
${state.userInput}

`;

	if (thinkingSummary !== "无") {
		summary += `### 执行思考过程\n${thinkingSummary}\n\n`;
	}

	if (execResult?.notes && execResult.notes.length > 0) {
		summary += `### 收集的信息\n${execResult.notes}\n\n`;
	}

	summary += `### 统计\n- 执行时长: ${Math.round((Date.now() - state.startTime) / 1000)} 秒\n- Token 消耗: ${state.tokenUsage.totalTokens}`;

	return summary;
}
