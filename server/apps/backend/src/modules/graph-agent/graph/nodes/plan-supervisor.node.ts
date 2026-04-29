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
import { createConfiguredChatModel } from "../../config/chat-model.factory";
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
 */
function buildSkillsDescription(skills: SkillDTO[]): string {
	if (skills.length === 0) {
		return "";
	}

	const skillList = skills
		.map((s) => `- ${s.displayName}: ${s.description}`)
		.join("\n");

	return `# Available Supervisor Skills

You can use the load_skill tool to load these skills when they are relevant:

${skillList}

Load a skill before relying on its specialized guidance.`;
}

/**
 */
function buildExecutorSkillsDescription(skills: SkillDTO[]): string {
	if (skills.length === 0) {
		return "";
	}

	const skillList = skills
		.map((s) => `- ${s.displayName}: ${s.description}`)
		.join("\n");

	return `# Available Executor Skills

These skills can improve Executor performance. Select suitable skills in the required_skills field for each todo created with write_todos:

${skillList}

Use the skill name in required_skills. Omit the field when no skill is needed.`;
}

/**
 */
function createLoadSkillTool(skills: SkillDTO[]) {
	const skillMap = new Map(skills.map((s) => [s.name, s]));
	const availableNames = skills.map((s) => s.name);

	return tool(
		async ({ skillName }: { skillName: string }) => {
			const skill = skillMap.get(skillName);
			if (!skill) {
				return `Error: skill "${skillName}" does not exist. Available skills: ${availableNames.join(", ")}`;
			}
			logger.log(`Agent loading skill ${skillName}`);
			return `## ${skill.displayName} (v${skill.version})

${skill.content}`;
		},
		{
			name: "load_skill",
			description: `Load a specialized skill for detailed guidance and context. Available skills: ${availableNames.join(", ")}`,
			schema: z.object({
				skillName: z
					.string()
					.describe(
						`Skill name to load. Options: ${availableNames.join(", ")}`,
					),
			}),
		},
	);
}

/**
 *
 *
 * Reads streaming text output through streamMode: "messages".
 *
 * @param billingService
 * @param prismaService
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

			const balance = await billingService.getBalance(state.userId);
			if (balance.remaining <= 0) {
				logger.warn(`Insufficient balance (${balance.remaining}), suspending before Supervisor call`);
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


			const config = await configProvider.getModelConfig(
				AgentName.PLAN_SUPERVISOR,
				state.userRegion,
			);


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
							feedback: "User feedback",
							instruction: "Additional instruction",
							summary: "Execution summary",
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


			const tenantId = state.tenantId ?? -1;


			const supervisorSkills = await skillProvider.getSkillsForNode(
				SkillNodeType.PLAN_SUPERVISOR,
				tenantId,
				state.userRegion,
			);


			const executorSkills = await skillProvider.getSkillsForNode(
				SkillNodeType.EXECUTOR_VLM,
				tenantId,
				state.userRegion,
			);


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
				enhancedSystemPrompt += `\n\n---\n\n# Historical Memory\nUse these prior task memories to improve execution:\n\n${memoryContext}`;
			}


			const primaryModel = createConfiguredChatModel(config, {
				maxRetries: 2,
				timeout: 60000,
			});


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




			const agent = createAgent({
				model: primaryModel,
				tools,
				// middleware: [todoListMiddleware()],
				systemPrompt: enhancedSystemPrompt,
			});


			const isFirstCall =
				!state.executorOutput?.task &&
				!state.executorInput?.instruction;

			const filteredHistory = filterToolMessages(
				state.plannerMessages || [],
			);



			const PLANNER_MODEL_WINDOW = 10;
			const modelHistory = filteredHistory.length > PLANNER_MODEL_WINDOW
				? filteredHistory.slice(-PLANNER_MODEL_WINDOW)
				: filteredHistory;

			let humanMessage: HumanMessage;

			if (isFirstCall) {
				// First call: generate an execution plan and create the todo list.
				humanMessage = new HumanMessage({
					content: `Analyze and plan the following user task. Stream your execution plan, then use the write_todos tool to create the subtask list.
Notes:
- The write_todos todos field must be an array. Do not pass an empty object or encode the array as a string.
- Escape quotation marks inside content with \\" if needed, otherwise JSON parsing may fail.
- Write todo descriptions in English by default, but preserve user-provided names, search terms, and target text exactly.

## User instruction
${state.userInput}`,
					additional_kwargs: {
						created_at: new Date().toISOString(),
					},
				});
			} else {
				// Later calls: evaluate the Executor result.
				humanMessage = new HumanMessage({
					content: `## Subtask execution feedback
**Subtask**: ${state.executorOutput?.task || state.executorInput?.instruction || "Unknown"}
**Result**: ${state.executorOutput?.success ? "Succeeded" : "Failed"}
**Recorded key information**: ${state.executorOutput?.notes || state.executorOutput?.fail_reason || "None"}

Use read_todos to inspect the current todo list, then decide the next operation based on the result:
- If the subtask succeeded, use write_todos to mark it completed and prepare the next subtask.
- If the subtask failed, analyze the reason and retry with an adjusted subtask or replan.
- If all tasks are complete, explicitly state "All tasks are complete".`,
					additional_kwargs: {
						created_at: new Date().toISOString(),
					},
				});
			}


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

				if (signal?.aborted) break;

				const [messageChunk] = chunk as [AIMessageChunk, unknown];

				// Accumulate token usage from chunks
				if (messageChunk instanceof AIMessageChunk && messageChunk.usage_metadata?.total_tokens) {
					streamTotalTokens += messageChunk.usage_metadata.total_tokens;
				}


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



			return {
				plannerMessages: [
					humanMessage,
					new AIMessage({ content: accumulatedText }),
				],
				supervisorStreamOutput: accumulatedText,

				...(isFirstCall ? { planDocument: accumulatedText } : {}),
			};
		} catch (error) {
			const err = error as Error;

			// GraphInterrupt from billing interrupt — re-throw without logging as error
			if (err.name === "GraphInterrupt") {
				throw error;
			}


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


			return {
				supervisorError: true,
			};
		}
	};
}
