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
 *
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

			const startTime = Date.now();
			const resp = await executionGateway.sendScreenshotReq(state.taskExecutionId);
			logger.log(`Screenshot request took ${Date.now() - startTime}ms for user ${state.userId}`);

				if (!resp.success || !resp.screenshotUri) {
					throw new Error("Screenshot request failed");
				}


			const imgResult = await tosService.getImageAsBase64(resp.screenshotUri);
				if (!imgResult.success || !imgResult.base64) {
					throw new Error("Failed to read screenshot");
				}
			const ext = resp.screenshotUri.endsWith(".webp") ? "webp" : resp.screenshotUri.endsWith(".jpg") ? "jpeg" : "png";
			const screenshotUrl = `data:image/${ext};base64,${imgResult.base64}`;
			logger.log(`Screenshot taken successfully: ${resp.screenshotUri}`);



			const screenshotMessage = new HumanMessage({
				content: [
					{
						type: "image_url",
						image_url: screenshotUrl,
					},
					{
						type: "text",
							text: `Current running app: ${resp.currentAppName}`,
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

			if (error.name === "AbortError" || error.message?.includes("abort")) {
				logger.log("Screenshot aborted, stopping execution");
				throw error;
			}

			logger.error(`Screenshot failed: ${error.message}`, error.stack);
			return {
					executor: {
						status: "error",
						errorMessage: `Screenshot failed: ${error.message}`,
					},
			} as Partial<AgentState>;
		}
	};
}
