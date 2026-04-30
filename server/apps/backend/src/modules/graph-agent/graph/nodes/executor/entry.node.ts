import type { RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@nestjs/common";
import { AgentEventSource, AgentEventType } from "../../../../../common/base/enum";
import { ExecutionGateway } from "../../../../../common/ws";
import { AgentConfigProvider } from "../../../config/agent-config.provider";
import { AgentName } from "../../../config/types";
import type { SkillProvider } from "../../../skill/skill.provider";
import {
	type AgentState,
	type ExecutorInput,
	type ExecutorInternalState,
} from "../../state/executor-state.types";
import { DEFAULT_EXECUTION_METRICS } from "../../utils/execution-metrics";
import { clearCompletedSummaries } from "./post-execute.node";

const logger = new Logger("ExecutorEntryNode");

const RUNTIME_VLM_ACTION_PROMPT = `You are a mobile GUI Executor.

You are given a user task, action history, and screenshots. Your job is to choose the next single UI action that best moves the task forward.

## Output Format

Always output exactly:

Summary: ...
Thought: ...
Action: ...

## Action Space

click(point='<point>x y</point>')

long_press(point='<point>x y</point>')

type(content='')
Use this only after clicking and activating an input field. Do not add escape characters inside the content. To submit input, end with "\\n".

scroll(point='<point>x y</point>', direction='up/down/left/right')
Direction means finger movement:
- up: swipe up to see lower content or next video
- down: swipe down to refresh or go back to previous content

open_app(app_name='')

drag(start_point='<point>x1 y1</point>', end_point='<point>x2 y2</point>')

press_home()

press_back()

downgrade_to_a11y()
Use only after visual understanding is no longer needed. If A11Y is unavailable in the current build, continue with GUI actions instead.

need_login(content='...')
Use when login, registration, face ID, fingerprint, or payment password is required.

asset_risk(content='...')
Use before the final step of real money spending, transfer, payment, refund, cart clearing, or bank-card removal.

delete_confirm(content='...')
Use before deleting important historical data, such as chat history, account data, or account cancellation.

finished(content='...')
Use when the task is completed, blocked, skipped, or failed. Report honestly.

## Core Rules

1. Output only one action each turn.

2. Use open_app to open or switch apps. Do not swipe around the home screen to find apps.

3. Before typing, click the input field first and make sure it is active.

4. If the current page is unclear after opening an app, inspect or navigate minimally until the page purpose is clear.

5. Search must preserve the exact target entity.
If no result is found, report no result. Do not substitute similar names.
Limited expansion is allowed only if the entity remains unchanged, such as:
elys -> elys AI product

6. Do not guess high-impact actions.
If the target button, object, or comment is ambiguous, use a safer action to clarify first.

7. For comments or replies, identify whether the target is a top-level comment or a nested reply.
If replying to a nested reply, use that reply's own reply button, not the global input box.

8. For videos, do not wait unnecessarily. Decide from the visible frame, title, caption, and immediate context.

9. If a popup, ad, permission prompt, or overlay blocks the task, first try to close, skip, go back, or tap a safe blank area.

10. If a click does not work, retry once with a slightly shifted point inside the same target area.

## Memory Rules

If new feed content, posts, comments, profiles, products, or search results are observed before interacting or scrolling, record key facts with update_working_memory first.

Store observed facts in facts.

Store guesses, plans, or unverified assumptions in hypotheses.

If you interact with a post, comment, profile, or item, record its identity to avoid duplicate interaction.

Do not mix information from different platforms.

## Visual Assistance

If you receive a visual assistance request, answer the visual question first and use visual understanding to continue the task.

When visual understanding is no longer needed, use:

downgrade_to_a11y()

Do not downgrade while image or video understanding is still required.

## Risk Escalation

You must ask for user intervention in these cases:

- Login, registration, face ID, fingerprint, or payment password:
  need_login(content='...')

- Final confirmation for real money payment, transfer, order submission, refund, or major asset change:
  asset_risk(content='...')

- Deleting important historical data or irreversible account/data removal:
  delete_confirm(content='...')

Never perform these actions yourself.

## Interaction Style

When writing social replies, make them sound like a real human message in WhatsApp, WeChat, Xiaohongshu, X/Twitter, Telegram, or similar apps.

Avoid AI-like completeness. Be short, natural, opinionated, and conversational. You may respond to only one point instead of everything.

## Failure and Skip Rules

Do not fake success.

If the required element is not visible after reasonable fallback attempts, stop honestly:

finished(content='SKIP: element not visible, try next task')

If the task is completed, use:

finished(content='...')

The final report must state what was done or why it could not be done.

## Thought Format

Summary must be English, concise, and no more than 10 words.

Thought must be English and include:
1. What is on the current page and any new information
2. Whether memory needs updating
3. The next operation plan
4. A short next-step summary within 10 words

Action must contain exactly one valid action from the action space.

Current user task:
{instruction}`;

/**
 *
 */
function createInitialExecutorState(
	guiSystemPrompt: string,
): ExecutorInternalState {
	return {
		_reset: true,
		remindReason: "",
		needRemind: false,
		screenshotUri: "",
		currentAppName: "",
		screenWidth: 0,
		screenHeight: 0,
		currentPrediction: "",
		parsedPrediction: null,
		loopCount: 0,
		status: "running",
		errorMessage: "",
		lastError: null,
		callUserThought: "",
		sharedMessages: [],
		guiSystemPrompt,
		totalTokens: 0,
		executionMetrics: { ...DEFAULT_EXECUTION_METRICS },
		lastSummarizedLoopCount: 0,
		lastSummarizedAppName: "",
		recentActions: [],
		recentScreenshotHashes: [],
		currentScreenshotHash: "",
		needRefreshImageUrls: false,
		currentChannel: "gui",
		semanticHistory: [],
	};
}

/**
 * Create the Executor entry node.
 *
 * Responsibilities:
 * 1. Read instructions from executorInput and build a system prompt with skills.
 * 2. Initialize executor internal state for normal entry or fork resume.
 * 3. Notify the client that the GUI Agent is starting execution.
 *
 * Fork resume: graph-runner already appended the new instruction HumanMessage
 * to sharedMessages, so entry only clears the forkResume flag, sets status=running,
 * and updates the system prompt.
 */
export function createExecutorEntryNode(
	configProvider: AgentConfigProvider,
	executionGateway: ExecutionGateway,
	skillProvider: SkillProvider,
) {
	/**
	 * Build the system prompt by reading model config, replacing the instruction
	 * placeholder, and injecting skills.
	 */
	async function buildSystemPrompt(
		agentName: AgentName,
		instruction: string,
		skills?: ExecutorInput["skills"],
	): Promise<string> {
		const modelConfig = await configProvider.getModelConfig(agentName);
		let prompt = modelConfig.systemPrompt
			? modelConfig.systemPrompt.replace("{instruction}", instruction)
			: "";

		if (
			agentName === AgentName.EXECUTOR_VLM &&
			(!prompt.trim() ||
				prompt.includes("System Prompt \u5728\u8fd0\u884c\u65f6\u52a8\u6001\u6784\u5efa") ||
				prompt.includes("system prompt is built dynamically at runtime"))
		) {
			prompt = RUNTIME_VLM_ACTION_PROMPT.replace("{instruction}", instruction);
		}

		if (skills && skills.length > 0) {
			const skillPrompt = skillProvider.buildSkillPrompt(skills);
			if (skillPrompt) {
				prompt = `${prompt}\n\n---\n\n# Loaded Skills\n\n${skillPrompt}`;
				logger.debug(
					`Injected ${skills.length} skills: ${skills.map((s) => s.name).join(", ")}`,
				);
			}
		}

		return prompt;
	}

	return async (
		state: AgentState,
	): Promise<Partial<AgentState>> => {
		const instruction = state.executorInput?.instruction ?? "";
		logger.log(
			`Executor entry: instruction=${instruction.substring(0, 100)}..., isCancelled: ${state.isCancelled}`,
		);


		if (state.isCancelled) {
			logger.log("Task cancelled by user, skipping executor entry");
			return {
				executor: { ...state.executor, status: "finished" },
				executorOutput: {
					success: false,
					fail_reason: "Task cancelled by user",
					task: instruction,
					notes: "Task cancelled by user",
				},
			};
		}


		executionGateway.sendAgentEvent(state.taskExecutionId, {
			type: AgentEventType.CALL_GUI_AGENT,
			taskExecutionId: state.taskExecutionId,
			from: AgentEventSource.EXECUTOR,
			content: instruction,
		});


		clearCompletedSummaries(state.taskExecutionId);


		const guiPrompt = await buildSystemPrompt(
			AgentName.EXECUTOR_VLM, instruction, state.executorInput?.skills,
		);


		if (state.forkResume) {
			logger.log(
				`Fork resume: preserving ${state.executor.sharedMessages.length} shared messages, updating system prompts`,
			);

			return {
				executorEntered: true,
				forkResume: false,
				executor: {
					...state.executor,
					status: "running",
					needRefreshImageUrls: true,
					totalTokens: 0,
					executionMetrics: {},
					guiSystemPrompt: guiPrompt,
				},
			};
		}


		return {
			executorEntered: true,
			executor: createInitialExecutorState(guiPrompt),
		};
	};
}
