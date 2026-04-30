import { HumanMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@nestjs/common";
import { ExecutionGateway, type ActionReqPayload } from "../../../../../common/ws";
import { AgentState } from "../../state/executor-state.types";
import type { ActionInputs, Coords } from "../../state/state.types";
import { ErrorSeverity } from "../../utils/error-classification";
import {
	buildExecutionConnectionLostMessage,
	isExecutionConnectionLost,
} from "../../utils/execution-connection";

const logger = new Logger("ExecuteActionNode");

/**
 */
enum MobileActionType {
	CLICK = "click",
	LONG_PRESS = "long_press",
	TYPE = "type",
	SCROLL = "scroll",
	OPEN_APP = "open_app",
	DRAG = "drag",
	PRESS_HOME = "press_home",
	PRESS_BACK = "press_back",
	FINISHED = "finished",
	CALL_USER = "call_user",
	WAIT = "wait",
}

const FALLBACK_SCREEN_WIDTH = 1080;
const FALLBACK_SCREEN_HEIGHT = 1920;

function hasCoords(coords?: Coords): coords is [number, number] {
	return (
		Array.isArray(coords) &&
		coords.length === 2 &&
		Number.isFinite(coords[0]) &&
		Number.isFinite(coords[1])
	);
}

function clampCoordinate(value: number, max: number): number {
	const safeMax = Math.max(1, max);
	return Math.round(Math.max(0, Math.min(value, safeMax - 1)));
}

function defaultScrollStart(
	direction: string,
	screenWidth: number,
	screenHeight: number,
): [number, number] {
	const width = screenWidth > 0 ? screenWidth : FALLBACK_SCREEN_WIDTH;
	const height = screenHeight > 0 ? screenHeight : FALLBACK_SCREEN_HEIGHT;
	const normalizedDirection = direction.toLowerCase();

	switch (normalizedDirection) {
		case "down":
			return [
				clampCoordinate(width * 0.5, width),
				clampCoordinate(height * 0.25, height),
			];
		case "left":
			return [
				clampCoordinate(width * 0.25, width),
				clampCoordinate(height * 0.5, height),
			];
		case "right":
			return [
				clampCoordinate(width * 0.75, width),
				clampCoordinate(height * 0.5, height),
			];
		case "up":
		default:
			return [
				clampCoordinate(width * 0.5, width),
				clampCoordinate(height * 0.75, height),
			];
	}
}

function buildActionParams(
	actionType: string,
	actionInputs: ActionInputs | undefined,
	screenWidth: number,
	screenHeight: number,
) {
	let startCoords = actionInputs?.start_coords;
	const direction = actionInputs?.direction ?? "";

	if (
		actionType === MobileActionType.SCROLL &&
		!hasCoords(startCoords)
	) {
		startCoords = defaultScrollStart(direction, screenWidth, screenHeight);
		logger.debug(
			`Using default scroll start coords: (${startCoords[0]}, ${startCoords[1]}), direction=${direction || "up"}`,
		);
	}

	return {
		start_x: startCoords?.[0] ?? 0,
		start_y: startCoords?.[1] ?? 0,
		end_x: actionInputs?.end_coords?.[0] ?? 0,
		end_y: actionInputs?.end_coords?.[1] ?? 0,
		content: actionInputs?.content ?? "",
		direction,
		app_name: actionInputs?.app_name ?? "",
	};
}

/**
 *
 */
export function createExecuteActionNode(
	executionGateway: ExecutionGateway,
) {
	return async (state: AgentState, config?: RunnableConfig): Promise<Partial<AgentState>> => {
		const signal = config?.signal;
		const exec = state.executor;
		const { parsedPrediction } = exec;


		if (signal?.aborted) {
			logger.log("Execution aborted, skipping action execution");
			return {
				executor: {
					status: "cancelled",
				},
			} as Partial<AgentState>;
		}

		if (!parsedPrediction) {
			return {
				executor: {
					status: "error",
					errorMessage: "No parsed action result",
				},
			} as Partial<AgentState>;
		}

		const actionType = parsedPrediction.action_type;
		logger.log(`Executing action: ${actionType}`);

		try {

			const validActionTypes = Object.values(MobileActionType) as string[];
			if (!validActionTypes.includes(actionType)) {
				logger.warn(`Unknown action type: ${actionType}`);
				const errorMsg = new HumanMessage({
					content: `Unknown action type: ${actionType}. Output one valid action type.`,
					additional_kwargs: { created_at: new Date().toISOString() },
				});
				return {
					executor: {
						status: "running",
						lastError: {
							severity: ErrorSeverity.RECOVERABLE,
							code: "UNKNOWN_ACTION_TYPE",
							message: `Unknown action type: ${actionType}`,
						},
						executionMetrics: { actionFailureCount: 1 },
						sharedMessages: [errorMsg],
					},
				} as Partial<AgentState>;
			}


			const actionInputs = parsedPrediction.action_inputs;
			const actionParams = buildActionParams(
				actionType,
				actionInputs,
				exec.screenWidth,
				exec.screenHeight,
			);


			const actionReq: ActionReqPayload = {
				executionId: state.taskExecutionId,
				actionType: actionType,
				actionInputs: actionParams,
			};


			await executionGateway.sendActionReq(state.taskExecutionId, actionReq);

			logger.log(`Action ${actionType} executed successfully`);

			return {
				executor: {
					status: "running",
					executionMetrics: {
						actionSuccessCount: 1,
					},
				},
			} as Partial<AgentState>;
		} catch (error: any) {

			if (error.name === "AbortError" || error.message?.includes("abort")) {
				logger.log("Execute action aborted, stopping execution");
				throw error;
			}

			logger.error(`Execute action failed: ${error.message}`, error.stack);

			if (isExecutionConnectionLost(error)) {
				const message = buildExecutionConnectionLostMessage(state.taskExecutionId);
				return {
					executor: {
						status: "error",
						errorMessage: message,
						lastError: {
							severity: ErrorSeverity.FATAL,
							code: "EXECUTION_CONNECTION_LOST",
							message,
						},
						executionMetrics: {
							actionFailureCount: 1,
						},
					},
				} as Partial<AgentState>;
			}


				const errorMsg = new HumanMessage({
					content: `Failed to execute ${actionType}: ${error.message}`,
				additional_kwargs: {
					created_at: new Date().toISOString(),
				},
			});
			return {
				executor: {
					status: "running", // Keep running so the VLM can retry.
					lastError: {
						severity: ErrorSeverity.RECOVERABLE,
						code: "EXECUTE_FAILED",
							message: `Failed to execute ${actionType}: ${error.message}`,
					},
					executionMetrics: {
						actionFailureCount: 1,
					},
					sharedMessages: [errorMsg],
				},
			} as Partial<AgentState>;
		}
	};
}
