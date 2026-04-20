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

/**
 * 创建 executor 初始状态（所有控制字段重置）
 *
 * 设置 _reset: true 触发 reducer 全量替换（_reset 会在重置后被剔除）
 * messages 不含 SystemMessage，由 model 节点在调用时 prepend
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
 * 创建 Executor 入口节点
 *
 * 职责：
 * 1. 从 executorInput 读取指令，构建含 skills 的 system prompt
 * 2. 初始化 executor 内部状态（正常入口 / fork resume）
 * 3. 通知客户端 GUI Agent 开始执行
 *
 * Fork resume 场景：graph-runner 已将新指令 HumanMessage 追加到 sharedMessages，
 * entry 只需清除 forkResume 标志、设置 status=running，更新 system prompt。
 */
export function createExecutorEntryNode(
	configProvider: AgentConfigProvider,
	executionGateway: ExecutionGateway,
	skillProvider: SkillProvider,
) {
	/**
	 * 构建 system prompt（获取模型配置 + 替换指令占位符 + 注入 skills）
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

		if (skills && skills.length > 0) {
			const skillPrompt = skillProvider.buildSkillPrompt(skills);
			if (skillPrompt) {
				prompt = `${prompt}\n\n---\n\n# 已加载的Skill\n\n${skillPrompt}`;
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

		// 取消 → 直接退出子图
		if (state.isCancelled) {
			logger.log("Task cancelled by user, skipping executor entry");
			return {
				executor: { ...state.executor, status: "finished" },
				executorOutput: {
					success: false,
					fail_reason: "任务已被用户取消",
					task: instruction,
					notes: "任务已被用户取消",
				},
			};
		}

		// 通知客户端 GUI Agent 开始执行
		executionGateway.sendAgentEvent(state.taskExecutionId, {
			type: AgentEventType.CALL_GUI_AGENT,
			taskExecutionId: state.taskExecutionId,
			from: AgentEventSource.EXECUTOR,
			content: instruction,
		});

		// 使旧的异步摘要任务失效（resume/fork 重入时可能有旧任务仍在运行）
		clearCompletedSummaries(state.taskExecutionId);

		// 构建 GUI system prompt
		const guiPrompt = await buildSystemPrompt(
			AgentName.EXECUTOR_VLM, instruction, state.executorInput?.skills,
		);

		// Fork resume：保留 sharedMessages 对话历史，仅更新 system prompt
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

		// 正常入口：全量重置 executor 状态
		return {
			executorEntered: true,
			executor: createInitialExecutorState(guiPrompt),
		};
	};
}
