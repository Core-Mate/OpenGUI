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
import {computePHash} from "../../utils/phash";

const logger = new Logger("SenseNode");

/**
 * 创建 sense 感知节点
 *
 * GUI-only: 请求截图 → 生成签名 URL → 构造消息
 *
 * @param executionGateway - 执行网关，用于发送截图请求
 * @param tosService - TOS 服务，用于生成签名 URL
 * @returns sense 节点函数
 */
export function createSenseNode(
    executionGateway: ExecutionGateway,
    tosService: TosService,
) {
    return async (
        state: AgentState,
        config?: RunnableConfig,
    ): Promise<Partial<AgentState>> => {
        // 检查是否已被 abort
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

            // 计算 sense 指标
            const senseLatency = Date.now() - senseStart;

            // 将 metrics 合并到 result
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
            // 如果是 abort 错误，重新抛出让图停止执行
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
            return {
                executor: {
                    status: "error",
                    errorMessage: `感知失败: ${error.message}`,
                    lastError: {
                        severity: ErrorSeverity.FATAL,
                        code: "SENSE_FAILED",
                        message: `感知失败: ${error.message}`,
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
// GUI 通道处理（截图）
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
        throw new Error("截图请求失败");
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
// 截图辅助：生成签名 URL + 构造消息 + 返回状态
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
    // 如果已有截图响应则直接使用，否则请求截图
    const resp =
        existingResp ??
        (await (async () => {
            const startTime = Date.now();
            const r = await executionGateway.sendScreenshotReq(executionId);
            logger.log(
                `Screenshot request took ${Date.now() - startTime}ms for execution ${executionId}`,
            );
            if (!r.success || !r.screenshotUri) {
                throw new Error("截图请求失败");
            }
            return r;
        })());

    // 将截图转为 base64 data URL
    const imgResult = await tosService.getImageAsBase64(resp.screenshotUri);
    if (!imgResult.success || !imgResult.base64) {
        throw new Error("截图读取失败");
    }
    const ext = resp.screenshotUri.endsWith(".webp") ? "webp" : resp.screenshotUri.endsWith(".jpg") ? "jpeg" : "png";
    const screenshotDataUrl = `data:image/${ext};base64,${imgResult.base64}`;
    logger.log(`Screenshot taken successfully: ${resp.screenshotUri}`);

    // 计算 pHash（用于 anomaly-detect 截图相似度检测）
    // 优先使用客户端计算的 pHash，fallback 到服务端从 buffer 计算
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

    // 创建包含截图的 HumanMessage — 格式与 screenshot.node.ts 完全一致
    const screenshotMessage = new HumanMessage({
        content: [
            {
                type: "image_url",
                image_url: screenshotDataUrl,
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
