import { HumanMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@nestjs/common";
import { ExecutionGateway } from "../../../../../common/ws";
import { TosService } from "../../../../tos/tos.service";
import {
	AgentState,
	VLM_AGENT_DEFAULTS,
} from "../../state/executor-state.types";

const logger = new Logger("ScreenshotNode");

/**
 * 创建截图节点
 *
 * @param executionGateway - 执行网关，用于发送截图请求
 * @param tosService - TOS 服务，用于生成公开 URL
 * @returns 截图节点函数
 */
export function createScreenshotNode(
	executionGateway: ExecutionGateway,
	tosService: TosService,
) {
	return async (
		state: AgentState,
		config?: RunnableConfig,
	): Promise<Partial<AgentState>> => {
		const signal = config?.signal;

		// 检查是否已被 abort
		if (signal?.aborted) {
			logger.log("Execution aborted, skipping screenshot");
			return {
				executor: {
					status: "cancelled",
				},
			} as Partial<AgentState>;
		}

		logger.log(`Taking screenshot for user ${state.userId}`);

		try {
			// 发送截图请求（重试由 LangGraph retryPolicy 处理）
			const startTime = Date.now();
			const resp = await executionGateway.sendScreenshotReq(state.taskExecutionId);
			logger.log(`Screenshot request took ${Date.now() - startTime}ms for user ${state.userId}`);

			if (!resp.success || !resp.screenshotUri) {
				throw new Error("截图请求失败");
			}

			// 将截图转为 base64 data URL 供 VLM 访问
			const imgResult = await tosService.getImageAsBase64(resp.screenshotUri);
			if (!imgResult.success || !imgResult.base64) {
				throw new Error("截图读取失败");
			}
			const ext = resp.screenshotUri.endsWith(".webp") ? "webp" : resp.screenshotUri.endsWith(".jpg") ? "jpeg" : "png";
			const screenshotUrl = `data:image/${ext};base64,${imgResult.base64}`;
			logger.log(`Screenshot taken successfully: ${resp.screenshotUri}`);

			// 创建包含截图的 HumanMessage，模拟 GUIAgent.ts 的消息拼接
			// 使用多模态消息格式：文本占位符 + 图片 URL
			const screenshotMessage = new HumanMessage({
				content: [
					{
						type: "image_url",
						image_url: screenshotUrl,
					},
					{
						type: "text",
						text: `当前正在运行的应用：${resp.currentAppName}`,
					},
				],
				additional_kwargs: {
					created_at: new Date().toISOString(),
					screenshotKey: resp.screenshotUri,
				},
			});

			return {
				executor: {
					...state.executor,
					screenshotUri: resp.screenshotUri,
					screenWidth: resp.screenWidth,
					screenHeight: resp.screenHeight,
					currentAppName: resp.currentAppName,
					loopCount: state.executor.loopCount + 1,
					sharedMessages: [screenshotMessage],
				},
			};
		} catch (error: any) {
			// 如果是 abort 错误，重新抛出让图停止执行
			if (error.name === "AbortError" || error.message?.includes("abort")) {
				logger.log("Screenshot aborted, stopping execution");
				throw error;
			}

			logger.error(`Screenshot failed: ${error.message}`, error.stack);
			return {
				executor: {
					status: "error",
					errorMessage: `截图失败: ${error.message}`,
				},
			} as Partial<AgentState>;
		}
	};
}
