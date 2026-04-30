import {HumanMessage} from "@langchain/core/messages";
import {RunnableConfig} from "@langchain/core/runnables";
import {Logger} from "@nestjs/common";
import {
    AgentEventSource,
    AgentEventType,
} from "../../../../../common/base/enum";
import {ExecutionGateway} from "../../../../../common/ws";
import {TosService} from "../../../../tos/tos.service";
import {
    AgentState,
    VLM_AGENT_DEFAULTS,
} from "../../state/executor-state.types";
import {ErrorSeverity} from "../../utils/error-classification";
import {
    buildExecutionConnectionLostMessage,
    isExecutionConnectionLost,
} from "../../utils/execution-connection";
import {computePHash} from "../../utils/phash";

const logger = new Logger("SenseNode");

/**
 *
 *
 */
export function createSenseNode(
    executionGateway: ExecutionGateway,
    tosService: TosService,
) {
    return async (
        state: AgentState,
        config?: RunnableConfig,
    ): Promise<Partial<AgentState>> => {

        if (config?.signal?.aborted) {
            throw new Error(
                (config.signal as any).reason || "Aborted",
            );
        }

        const executionId = state.taskExecutionId;
        const currentChannel = "gui" as const;

        logger.log(
            `Sense node: channel=${currentChannel}, executionId=${executionId}, loop=${state.executor.loopCount}`,
        );

        const senseStart = Date.now();

        try {
            const result = await handleGuiChannel(
                state,
                executionId,
                executionGateway,
                tosService,
            );


            const senseLatency = Date.now() - senseStart;


            const existingExecutor = (result as any).executor || {};
            (result as any).executor = {
                ...existingExecutor,
                executionMetrics: {
                    senseCount: 1,
                    totalSenseLatencyMs: senseLatency,
                    channelSwitchCount: 0,
                },
            };

            return result;
        } catch (error: any) {

            if (
                error.name === "AbortError" ||
                error.message?.includes("abort") ||
                error.message?.includes("Aborted")
            ) {
                logger.log("Sense node aborted, stopping execution");
                throw error;
            }

            const senseLatency = Date.now() - senseStart;
            logger.error(`Sense node failed: ${error.message}`, error.stack);
            const connectionLost = isExecutionConnectionLost(error);
	            const errorMessage = connectionLost
	                ? buildExecutionConnectionLostMessage(executionId)
	                : `Sense failed: ${error.message}`;
            return {
                executor: {
                    status: "error",
                    errorMessage,
                    lastError: {
                        severity: ErrorSeverity.FATAL,
                        code: connectionLost ? "EXECUTION_CONNECTION_LOST" : "SENSE_FAILED",
                        message: errorMessage,
                    },
                    loopCount: state.executor.loopCount + 1,
                    executionMetrics: {
                        senseCount: 1,
                        totalSenseLatencyMs: senseLatency,
                    },
                },
            } as Partial<AgentState>;
        }
    };
}

// ============================================================

// ============================================================

async function handleGuiChannel(
    state: AgentState,
    executionId: number,
    executionGateway: ExecutionGateway,
    tosService: TosService,
): Promise<Partial<AgentState>> {
    const startTime = Date.now();
    const resp = await executionGateway.sendScreenshotReq(executionId);
    logger.log(
        `Screenshot request took ${Date.now() - startTime}ms for execution ${executionId}`,
    );

    if (!resp.success || !resp.screenshotUri) {
	        throw new Error("Screenshot request failed");
    }

    return await takeScreenshotAndReturn(
        state,
        executionId,
        executionGateway,
        tosService,
        resp,
    );
}

// ============================================================

// ============================================================

async function takeScreenshotAndReturn(
    state: AgentState,
    executionId: number,
    executionGateway: ExecutionGateway,
    tosService: TosService,
    existingResp?: {
        success: boolean;
        screenshotUri: string;
        screenWidth: number;
        screenHeight: number;
        currentAppName: string;
        phash?: string;
    },
): Promise<Partial<AgentState>> {

    const resp =
        existingResp ??
        (await (async () => {
            const startTime = Date.now();
            const r = await executionGateway.sendScreenshotReq(executionId);
            logger.log(
                `Screenshot request took ${Date.now() - startTime}ms for execution ${executionId}`,
            );
            if (!r.success || !r.screenshotUri) {
	                throw new Error("Screenshot request failed");
            }
            return r;
        })());


    const imgResult = await tosService.getImageAsBase64(resp.screenshotUri);
    if (!imgResult.success || !imgResult.base64) {
        throw new Error("Failed to read screenshot");
    }
    const ext = resp.screenshotUri.endsWith(".webp") ? "webp" : resp.screenshotUri.endsWith(".jpg") ? "jpeg" : "png";
    const screenshotDataUrl = `data:image/${ext};base64,${imgResult.base64}`;
    logger.log(`Screenshot taken successfully: ${resp.screenshotUri}`);



    let currentScreenshotHash = "";
    if (resp.phash && /^[01]{64}$/.test(resp.phash)) {
        currentScreenshotHash = resp.phash;
    } else {
        try {
            const buffer = Buffer.from(imgResult.base64, "base64");
            currentScreenshotHash = await computePHash(buffer);
        } catch (err) {
            logger.warn(`pHash computation failed in sense: ${(err as Error).message}`);
        }
    }


    const screenshotMessage = new HumanMessage({
        content: [
            {
                type: "image_url",
                image_url: screenshotDataUrl,
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
            currentChannel: "gui",
            screenshotUri: resp.screenshotUri,
            screenWidth: resp.screenWidth,
            screenHeight: resp.screenHeight,
            currentAppName: resp.currentAppName,
            currentScreenshotHash,
            loopCount: state.executor.loopCount + 1,
            sharedMessages: [screenshotMessage],
        },
    } as Partial<AgentState>;
}
