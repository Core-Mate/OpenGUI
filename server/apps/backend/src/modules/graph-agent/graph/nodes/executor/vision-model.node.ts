import {
	AIMessage,
	BaseMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { StructuredToolInterface } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { interrupt } from "@langchain/langgraph";
import { Logger } from "@nestjs/common";
import type { BillingService } from "../../../../credits/billing.service";
import type { TosService } from "../../../../tos/tos.service";
import type { PrismaService } from "../../../../../prisma/prisma.service";
import type { AgentConfigProvider } from "../../../config/agent-config.provider";
import { AgentName } from "../../../config/types";
import { createCallUserTool, CALL_USER_TOOL_NAME, buildCallUserPrediction } from "../../../tools/call-user.tool";
import type { ContentCreationToolService } from "../../../tools/content-creation.tool";
import type { WorkingMemoryToolService } from "../../../tools/working-memory.tool";
import { AgentState, VLM_AGENT_DEFAULTS } from "../../state/executor-state.types";
import { ErrorSeverity } from "../../utils/error-classification";

const logger = new Logger("VisionModelNode");

export const IMAGE_REMOVED_PLACEHOLDER = "[image removed]";

/**
 */
const MAX_TOOL_CALL_ITERATIONS = 5;

/**
 */
export function isImageMessage(message: BaseMessage): boolean {
	if (!Array.isArray(message.content)) return false;
	return message.content.some(
		(item) =>
			typeof item === "object" && "type" in item && item.type === "image_url",
	);
}

/**
 */
function trimImageMessages(
	messages: BaseMessage[],
	maxImages: number,
): BaseMessage[] {
	const imageCount = messages.filter(isImageMessage).length;

	if (imageCount <= maxImages) {
		return messages;
	}

	let imagesToReplace = imageCount - maxImages;
	logger.log(
		`Replacing ${imagesToReplace} image messages with placeholders (total: ${imageCount}, max: ${maxImages})`,
	);

	return messages.map((msg) => {
		if (imagesToReplace > 0 && isImageMessage(msg)) {
			imagesToReplace--;
			return new HumanMessage({
				content: IMAGE_REMOVED_PLACEHOLDER,
				id: msg.id,
			});
		}
		return msg;
	});
}

/**
 */
async function refreshImageUrls(
	messages: BaseMessage[],
	tosService: TosService,
): Promise<BaseMessage[]> {
	return Promise.all(
		messages.map(async (msg) => {
			if (!isImageMessage(msg)) return msg;
			const key = msg.additional_kwargs?.screenshotKey as string | undefined;
			if (!key) return msg;

			try {
				const result = await tosService.getImageAsBase64(key);
				if (!result.success || !result.base64) {
					logger.warn(`Failed to load image for key ${key}`);
					return msg;
				}
				const ext = key.endsWith(".webp") ? "webp" : key.endsWith(".jpg") ? "jpeg" : "png";
				const dataUrl = `data:image/${ext};base64,${result.base64}`;
				const newContent = (msg.content as any[]).map((item) =>
					item.type === "image_url"
						? { ...item, image_url: { url: dataUrl } }
						: item,
				);
				return new HumanMessage({
					content: newContent,
					id: msg.id,
					additional_kwargs: msg.additional_kwargs,
				});
			} catch (err) {
				logger.warn(
					`Failed to refresh image for key ${key}: ${(err as Error).message}`,
				);
				return msg;
			}
		}),
	);
}

/**
 */
function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(block): block is { type: "text"; text: string } =>
				typeof block === "object" &&
				block !== null &&
				"type" in block &&
				block.type === "text" &&
				"text" in block &&
				typeof block.text === "string",
		)
		.map((block) => block.text)
		.join("");
}

/**
 *
 * 4. prepend SystemMessage
 */
function buildVlmCallMessages(
	sharedMessages: BaseMessage[],
	systemPrompt: string,
): BaseMessage[] {
	const { VLM_IMAGE_WINDOW_SIZE, VLM_MODEL_WINDOW_SIZE } = VLM_AGENT_DEFAULTS;


	const trimmed = trimImageMessages(sharedMessages, VLM_IMAGE_WINDOW_SIZE);


	const nonPlaceholder = trimmed.filter((msg) => {
		if (msg.type === "human" && typeof msg.content === "string") {
			return msg.content !== IMAGE_REMOVED_PLACEHOLDER;
		}
		return true;
	});


	const windowed =
		nonPlaceholder.length > VLM_MODEL_WINDOW_SIZE
			? nonPlaceholder.slice(-VLM_MODEL_WINDOW_SIZE)
			: nonPlaceholder;

	// 4. prepend SystemMessage
	return [new SystemMessage(systemPrompt), ...windowed];
}

/**
 *
 */
export function createVisionModelNode(
	configProvider: AgentConfigProvider,
	workingMemoryToolService: WorkingMemoryToolService,
	contentCreationToolService: ContentCreationToolService,
	tosService: TosService,
	billingService: BillingService,
	prismaService: PrismaService,
) {
	return async (
		state: AgentState,
		config?: RunnableConfig,
	): Promise<Partial<AgentState>> => {
		const signal = config?.signal;
		const exec = state.executor;

		if (signal?.aborted) {
			logger.log("Execution aborted, skipping VLM call");
			return {
				executor: {
					status: "cancelled",
				},
			} as Partial<AgentState>;
		}

		logger.log(`Vision model processing, loop ${exec.loopCount}`);

		try {

			const balance = await billingService.getBalance(state.userId);
			if (balance.remaining <= 0) {
				logger.warn(`Insufficient balance (${balance.remaining}), suspending before VLM call`);
				try {
					await prismaService.task_execution.update({
						where: { id: state.taskExecutionId },
						data: {
							execution_status: "SUSPENDED",
								status_message: "Insufficient credits. Please recharge and try again.",
							updated_at: new Date(),
						},
					});
				} catch (dbErr) {
					logger.error(`Failed to update execution status: ${(dbErr as Error).message}`);
				}
				interrupt("insufficient_balance");
			}


			const modelConfig = await configProvider.getModelConfig(
				AgentName.EXECUTOR_VLM,
				state.userRegion,
			);

			const baseModel = new ChatOpenAI({
				model: modelConfig.model,
				temperature: modelConfig.temperature ?? 0,
				topP: modelConfig.topP,
				apiKey: modelConfig.apiKey,
				...(modelConfig.baseURL && {
					configuration: { baseURL: modelConfig.baseURL },
				}),
				reasoning: {
					effort: "minimal",
				},
				timeout: 10000,
				maxRetries: 1,
				modelKwargs: {
					thinking: {
						type: "disabled",
					},
				},
			});


			const tools: StructuredToolInterface[] = [
				...workingMemoryToolService.createTools(),

				// createCallUserTool(),
			];

			const toolModel =
				tools.length > 0 ? baseModel.bindTools(tools) : baseModel;

			const fallbackBase = new ChatOpenAI({
				model: modelConfig.fallbackModel,
				temperature: modelConfig.temperature ?? 0,
				topP: modelConfig.topP,
				apiKey: modelConfig.apiKey,
				...(modelConfig.baseURL && {
					configuration: { baseURL: modelConfig.baseURL },
				}),
				timeout: 10000,
				maxRetries: 3,
			});
			const fallbackModel =
				tools.length > 0 ? fallbackBase.bindTools(tools) : fallbackBase;

			const model = toolModel.withFallbacks([fallbackModel]);

			const startTime = Date.now();


			let messages = exec.sharedMessages;
			if (exec.needRefreshImageUrls) {
				messages = await refreshImageUrls(messages, tosService);
			}


			let callMessages = buildVlmCallMessages(messages, exec.guiSystemPrompt);


			let shouldResetRemind = false;
			if (exec.needRemind && exec.remindReason) {
				const instruction = state.executorInput?.instruction || "";
				const remindMessage = new HumanMessage(
					`The current task may be stuck in a loop or drifting from the goal.\nExecution anomaly: ${exec.remindReason}\nOriginal task: ${instruction}\nCheck whether the execution is drifting from the original goal or stuck in a loop.`,
				);

				callMessages = [
					...callMessages.slice(0, -1),
					remindMessage,
					...callMessages.slice(-1),
				];
				shouldResetRemind = true;
				logger.warn(`Injecting task deviation reminder: ${exec.remindReason}`);
			}

			logger.log(
				`Invoking VLM: ${callMessages.length} messages${shouldResetRemind ? " (with reminder)" : ""}`,
			);


			let response = await model.invoke(callMessages, config);
			let totalTokens = response.usage_metadata?.total_tokens || 0;
			let iterations = 0;

			const conversationMessages: BaseMessage[] = [...callMessages];

			let callUserContent: string | null = null;
			while (
				response.tool_calls &&
				response.tool_calls.length > 0 &&
				iterations < MAX_TOOL_CALL_ITERATIONS
			) {
				iterations++;
				logger.log(
					`Processing ${response.tool_calls.length} tool calls (iteration ${iterations})`,
				);

				conversationMessages.push(response);

				const toolMessages: ToolMessage[] = [];
				for (const toolCall of response.tool_calls) {
					if (toolCall.name === CALL_USER_TOOL_NAME) {
						const content = (toolCall.args?.content as string) || "";
						callUserContent = content;
						logger.log(`call_user tool detected, content: ${content.substring(0, 100)}`);
					}

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
						const result = await tool.invoke(toolCall.args, config);
						const resultStr =
							typeof result === "string" ? result : JSON.stringify(result);
						toolMessages.push(
							new ToolMessage({
								tool_call_id: toolCall.id || "",
								content: resultStr,
							}),
						);
						logger.debug(
							`Tool ${toolCall.name} result: ${resultStr.substring(0, 100)}...`,
						);
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

				if (callUserContent !== null) {
					logger.log("Breaking tool call loop: call_user tool detected");
					break;
				}

				response = await model.invoke(conversationMessages, config);
				totalTokens += response.usage_metadata?.total_tokens || 0;
			}

			if (iterations >= MAX_TOOL_CALL_ITERATIONS) {
				logger.warn(
					`Reached max tool call iterations (${MAX_TOOL_CALL_ITERATIONS})`,
				);
			}

			// === Billing ===
			if (totalTokens > 0) {
				const billing = await billingService.deductByTokens(
					state.userId,
					totalTokens,
					state.taskId,
					state.taskExecutionId,
				);
				if (!billing.success) {
					logger.error(
						`Billing deduction failed for user ${state.userId} (${totalTokens} tokens)`,
					);
				}
			}

			logger.debug("vlm response:", JSON.stringify(response), "\n");
			let prediction = extractTextContent(response.content);


			if (callUserContent !== null) {
				prediction = buildCallUserPrediction(callUserContent);
				logger.log("Synthetic call_user prediction generated");
			}


			const reasoning = response.additional_kwargs?.reasoning as
				| { summary?: Array<{ type: string; text: string }> }
				| undefined;
			const thinking =
				reasoning?.summary
					?.filter((s) => s.type === "summary_text")
					.map((s) => s.text)
					.join("\n") || "";

			if (!prediction && thinking) {
				prediction = thinking;
				logger.log("Using reasoning summary as prediction (content was empty)");
			}


			if (!prediction.trim()) {
				logger.warn(`VLM returned empty prediction at loop ${exec.loopCount}, retrying`);
				const retryMessages = iterations > 0 ? conversationMessages : callMessages;
				const retryResponse = await model.invoke(retryMessages, config);
				const retryTokens = retryResponse.usage_metadata?.total_tokens || 0;
				totalTokens += retryTokens;

				if (retryTokens > 0) {
					await billingService.deductByTokens(
						state.userId,
						retryTokens,
						state.taskId,
						state.taskExecutionId,
					);
				}

				let retryPrediction = extractTextContent(retryResponse.content);
				if (!retryPrediction) {
					const retryReasoning = retryResponse.additional_kwargs?.reasoning as
						| { summary?: Array<{ type: string; text: string }> }
						| undefined;
					retryPrediction = retryReasoning?.summary
						?.filter((s) => s.type === "summary_text")
						.map((s) => s.text)
						.join("\n") || "";
				}

				if (retryPrediction.trim()) {
					prediction = retryPrediction;
					logger.log(`VLM retry succeeded`);
				} else {
					logger.warn(`VLM retry also returned empty prediction`);
				}
			}

			const endTime = Date.now();
			logger.log(
				`VLM response in ${endTime - startTime}ms (${iterations} tool iterations)`,
			);
			logger.log(`VLM prediction: ${prediction.substring(0, 200)}...`);


			return {
				executor: {
					currentPrediction: prediction,
					sharedMessages: prediction.trim()
						? [
								new AIMessage({
									content: prediction,
									additional_kwargs: {
										created_at: new Date().toISOString(),
									},
								}),
							]
						: [],
					totalTokens: totalTokens,
					executionMetrics: {
						modelCount: 1,
						totalModelLatencyMs: endTime - startTime,
					},
					...(shouldResetRemind && {
						needRemind: false,
						remindReason: null,
					}),
					...(exec.needRefreshImageUrls && {
						needRefreshImageUrls: false,
					}),
				},
			} as Partial<AgentState>;
		} catch (error: unknown) {
			const err = error as Error;

			if (err.name === "GraphInterrupt") {
				throw err;
			}

			if (err.name === "AbortError" || err.message?.includes("abort")) {
				logger.log("VLM call aborted, stopping execution");
				throw err;
			}

			logger.error(`VLM call failed: ${err.message}`, err.stack);
			return {
				executor: {
					status: "error",
						errorMessage: `VLM call failed: ${err.message}`,
					lastError: {
						severity: ErrorSeverity.FATAL,
						code: "VLM_FAILED",
							message: `VLM call failed: ${err.message}`,
					},
				},
			} as Partial<AgentState>;
		}
	};
}

/**
 */
export interface VLMConfig {
	model: string;
	apiKey: string;
	baseURL?: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
}
