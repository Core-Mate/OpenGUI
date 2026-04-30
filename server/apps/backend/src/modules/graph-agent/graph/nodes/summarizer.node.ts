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
import { createConfiguredChatModel } from "../../config/chat-model.factory";
import { AgentName } from "../../config/types";
import type { TaskMemoryService } from "../../memory/task-memory.service";
import { WorkingMemoryToolService } from "../../tools/working-memory.tool";
import { AgentState } from "../state/state.types";

const logger = new Logger("SummarizerNode");

/**
 */
const MAX_TOOL_CALL_ITERATIONS = 5;

/**
 */
const MAX_SUMMARY_SAMPLE_SIZE = 100;

/**
 *
 *
 *
 */
function sampleArray<T>(items: T[], maxSize: number): T[] {
	if (items.length <= maxSize) {
		return items;
	}


	const step = items.length / maxSize;
	const sampled: T[] = [];

	for (let i = 0; i < maxSize; i++) {
		const index = Math.floor(i * step);
		sampled.push(items[index]);
	}

	return sampled;
}

/**
 *
 *
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


		if (updateResult.count === 0) {
			logger.log(
				`Summarizer already running or finished for task ${state.taskExecutionId}, skipping duplicate execution`,
			);

			return { finalSummary: state.finalSummary || null };
		}

		logger.log(
			`Execution ${state.taskExecutionId} status updated to SUMMARIZING`,
		);

		try {

			const config = await configProvider.getModelConfig(
				AgentName.SUMMARIZER,
				state.userRegion,
			);


			const model = createConfiguredChatModel(config, {
				temperature: config.temperature ?? 0.1,
				maxTokens: 64000,
				maxRetries: 3,
				timeout: 60000,
			});


			const tools: StructuredToolInterface[] = [
				workingMemoryToolService.createGetTool(),
			];

			const modelWithToolsAndFallbacks = model.bindTools(tools);


			const taskStatus = buildTaskStatus(state);


			const sampledSummaryList = sampleArray(
				state.actionSummaryList,
				MAX_SUMMARY_SAMPLE_SIZE,
			);
			const thinkingSummary =
				sampledSummaryList.length > 0 ? sampledSummaryList.join("\n") : "None";


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
## Prior Execution Summary
Use this prior execution summary as context:
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


			const now = new Date();
			const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
			const messages: BaseMessage[] = [
				new SystemMessage(
					`${config.systemPrompt}\n\nCurrent date: ${currentDate}`,
				),
				new HumanMessage(`Create an execution summary for the following task:

## Task Information
- **Original user instruction**: ${state.userInput}
${state.planDocument ? `- **Planned execution path**: ${state.planDocument}` : ""}
- **Final status**: ${taskStatus}
${historySummarySection}
### GUI Agent Reasoning Trace
${thinkingSummary}

## Collected Information
Call the get_working_memory tool to retrieve information collected during execution and integrate it into the summary.

${state.isCancelled ? "## Note\nThe user cancelled the task. Summarize what was completed based on the executed subtasks and reasoning trace." : ""}

Summarize the execution in clear English.`),
			];


			const extraResult = {
				extraResult: state.executorOutput ?? null,
			};


			executionGateway.sendAgentEvent(state.taskExecutionId, {
				type: AgentEventType.TEXT_START,
				taskExecutionId: state.taskExecutionId,
				from: AgentEventSource.SUMMARIZER,
				content: "",
				extra: extraResult,
			});


			let summary = "";
			let summarizerTokens = 0;
			const conversationMessages = [...messages];
			let iterations = 0;


			while (iterations < MAX_TOOL_CALL_ITERATIONS) {
				iterations++;


				if (runnableConfig?.signal?.aborted) break;


				const stream = await modelWithToolsAndFallbacks.stream(
					conversationMessages,
					runnableConfig,
				);


				let fullMessage: AIMessageChunk | null = null;
				let firstTokenNotified = false;


				for await (const chunk of stream) {

					if (runnableConfig?.signal?.aborted) break;


					if (!firstTokenNotified) {
						firstTokenNotified = true;
						const onFirstToken = (runnableConfig?.configurable as Record<string, unknown>)?.onFirstToken;
						if (typeof onFirstToken === "function") (onFirstToken as () => void)();
					}


					fullMessage = fullMessage
						? (fullMessage.concat(chunk) as AIMessageChunk)
						: chunk;

					// Accumulate token usage
					if (chunk.usage_metadata?.total_tokens) {
						summarizerTokens += chunk.usage_metadata.total_tokens;
					}


					const content = chunk.content;
					if (typeof content === "string" && content) {
						summary += content;
						const sent = executionGateway.sendAgentEvent(state.taskExecutionId, {
							type: AgentEventType.TEXT_DELTA,
							taskExecutionId: state.taskExecutionId,
							from: AgentEventSource.SUMMARIZER,
							content,
							extra: extraResult,
						});
						if (!sent) break;
					} else if (Array.isArray(content)) {
						for (const block of content) {

							if (block.type === "tool_use") {
								continue;
							}

							if (block.type === "text" && "text" in block && block.text) {

								const textContent = block.text as string;
								summary += textContent;

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


				if (!fullMessage?.tool_calls || fullMessage.tool_calls.length === 0) {

					break;
				}





				const aiMessageWithToolCalls = new AIMessage({
					content: "", // Use an empty string so tool_calls are handled correctly.
					tool_calls: fullMessage.tool_calls,
				});
				conversationMessages.push(aiMessageWithToolCalls);


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


				conversationMessages.push(...toolMessages);
			}


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


			const store = runnableConfig?.store;
			if (store && state.taskId && summary) {

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
						content: `Execution summary:\n${summary}`,
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


			if (err.name === "AbortError" || err.message?.includes("abort")) {
				throw error;
			}


			const basicSummary = generateFallbackSummary(state);


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

			const errorSummary = basicSummary || "Failed to generate execution summary";
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
 */
function buildTaskStatus(state: AgentState): string {
	if (state.isCancelled) {
		return "Cancelled";
	}

	if (state.planTodoComplete) {
		return "All tasks completed";
	}

	return state.executorOutput?.success ? "Succeeded" : "Failed";
}

/**
 */
function generateFallbackSummary(state: AgentState): string {
	const execResult = state.executorOutput;
	const status = state.isCancelled
		? "Cancelled"
		: execResult?.success
			? "Succeeded"
			: "Failed";


	const sampledSummaryList = sampleArray(
		state.actionSummaryList,
		MAX_SUMMARY_SAMPLE_SIZE,
	);
	const thinkingSummary =
		sampledSummaryList.length > 0 ? sampledSummaryList.join("\n") : "None";

	let summary = `## Execution Summary

### Execution status
${status}

### User Instruction
${state.userInput}

`;

	if (thinkingSummary !== "None") {
		summary += `### Execution Reasoning\n${thinkingSummary}\n\n`;
	}

	if (execResult?.notes && execResult.notes.length > 0) {
		summary += `### Collected Information\n${execResult.notes}\n\n`;
	}

	const elapsedSeconds = state.startTime
		? Math.round((Date.now() - state.startTime) / 1000)
		: 0;
	const totalTokens = state.tokenUsage?.totalTokens ?? 0;

	summary += `### Metrics\n- Duration: ${elapsedSeconds} seconds\n- Token usage: ${totalTokens}`;

	return summary;
}
