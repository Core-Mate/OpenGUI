import { HumanMessage } from "@langchain/core/messages";
import { Command, INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { setExecutionId } from "../../common/log/trace-id.interceptor";
import { LeaseService } from "../../common/lease/lease.service";
import { PrismaService } from "../../prisma/prisma.service";
import { MobileAgentGraphService } from "./graph/mobile-agent.graph";
import { AgentState } from "./graph/state/state.types";
import { WorkingMemoryService } from "./working-memory/working-memory.service";
import {
  TokenUsageCallbackHandler,
  type TokenUsageResult,
} from "./graph/utils/token-usage-handler";
import { clearCompletedSummaries } from "./graph/nodes/executor/post-execute.node";

/**
 * 任务执行输入
 */
export interface ExecuteTaskInput {
  userId: number;
  taskId: number;
  taskExecutionId: number;
  userInput: string;
  knowledgeBaseId?: number;
  /** 用户地区 (CN/US) */
  userRegion: string;
  /** 用户所属租户 ID */
  tenantId: number;
}

/**
 * 任务执行结果
 */
export interface ExecuteTaskResult {
  success: boolean;
  hitl_reason?: string;
  /** 中断类型：call_user = 需要用户操作, insufficient_balance = 余额不足 */
  hitl_type?: "call_user" | "insufficient_balance";
  summary?: string;
  error?: string;
  /** 标识任务是否被取消（abort） */
  cancelled?: boolean;
  /** abort 来源：'cancel' = 用户取消, 'pause' = 用户暂停, 'lease_expired' = 租约过期 */
  abortReason?: "cancel" | "pause" | "lease_expired";
}

/**
 * 取消执行结果
 */
export interface CancelExecutionResult {
  success: boolean;
  summary?: string;
  error?: string;
}

/**
 * 用户响应类型
 */
export interface CallUserResponse {
  /** 用户反馈信息 */
  feedback?: string;
}

/**
 * Fork 执行输入
 */
export interface ForkExecutionInput {
  userId: number;
  taskId: number;
  taskExecutionId: number; // 新执行 ID
  originExecutionId: number; // 原执行 ID
  instruction?: string; // 用户追加指令（可选，不传则直接继续执行）
  userRegion: string;
  tenantId: number;
}

@Injectable()
export class GraphRunnerService {
  private readonly logger = new Logger(GraphRunnerService.name);
  private readonly activeExecutions = new Map<number, AbortController>();
  private readonly threadIdMap = new Map<number, string>(); // taskExecutionId -> threadId
  private readonly leaseMonitors = new Map<number, NodeJS.Timeout>(); // taskExecutionId -> monitor timer
  private readonly abortReasons = new Map<
    number,
    "cancel" | "pause" | "lease_expired"
  >(); // taskExecutionId -> abort reason

  /** 租约检查间隔（毫秒），建议为 TTL 的 1/3 */
  private readonly LEASE_CHECK_INTERVAL_MS = 3000;

  constructor(
    private readonly graphService: MobileAgentGraphService,
    @Inject(forwardRef(() => LeaseService))
    private readonly leaseService: LeaseService,
    private readonly prismaService: PrismaService,
    private readonly workingMemoryService: WorkingMemoryService,
  ) {}

  /**
   * 检查本实例是否持有某个执行
   */
  hasExecution(taskExecutionId: number): boolean {
    return (
      this.activeExecutions.has(taskExecutionId) ||
      this.threadIdMap.has(taskExecutionId)
    );
  }

  /**
   * 预注册执行，使 cancelExecution 能在 setImmediate 回调前找到它。
   * 如果已有 AbortController 则不覆盖。
   */
  preRegisterExecution(taskExecutionId: number): AbortController {
    const existing = this.activeExecutions.get(taskExecutionId);
    if (existing) return existing;
    const ac = new AbortController();
    this.activeExecutions.set(taskExecutionId, ac);
    return ac;
  }

  /**
   * 检测是否是 abort 错误（任务被取消）
   */
  private isAbortError(error: Error): boolean {
    return (
      error.name === "AbortError" ||
      error.message === "This operation was aborted" ||
      error.message?.includes("The operation was aborted")
    );
  }

  /**
   * 从 interrupt 结果中提取中断信息
   * LangGraph 的 interrupt(value) 将值存储在 result[INTERRUPT][0].value
   */
  private extractInterruptInfo(result: any): {
    hitl_reason: string;
    hitl_type: "call_user" | "insufficient_balance";
  } {
    const interruptValue = result?.[INTERRUPT]?.[0]?.value;
    const hitl_reason = typeof interruptValue === "string"
      ? interruptValue
      : "需要用户介入";
    const hitl_type = hitl_reason === "insufficient_balance"
      ? "insufficient_balance" as const
      : "call_user" as const;
    return { hitl_reason, hitl_type };
  }

  /**
   * 同步执行任务
   */
  async executeTask(input: ExecuteTaskInput): Promise<ExecuteTaskResult> {
    const { userId, taskId, taskExecutionId, userInput, userRegion, tenantId } =
      input;
    setExecutionId(taskExecutionId);
    const threadId = `task-${taskId}-exec-${taskExecutionId}`;

    this.logger.log(
      `Starting sync task execution: ${taskExecutionId} for user ${userId} with threadId ${threadId}, region: ${userRegion}`,
    );

    const abortController = this.activeExecutions.get(taskExecutionId) ?? new AbortController();
    this.activeExecutions.set(taskExecutionId, abortController);
    // 存储 threadId 映射，以便后续恢复/取消时使用
    this.threadIdMap.set(taskExecutionId, threadId);

    // 如果在预注册后、executeTask 前已被取消，立即返回
    if (abortController.signal.aborted) {
      const reason = this.abortReasons.get(taskExecutionId) || "cancel";
      this.activeExecutions.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      return { success: false, cancelled: true, abortReason: reason };
    }

    // 启动租约监控
    this.startLeaseMonitor(taskExecutionId, abortController);

    const initialState: Partial<AgentState> = {
      userId,
      taskId,
      taskExecutionId,
      userInput,
      userRegion,
      tenantId,
      startTime: Date.now(),
    };

    const tokenHandler = new TokenUsageCallbackHandler();

    try {
      const result = await this.graphService
        .getMobileAgentGraph()
        .invoke(initialState, {
          configurable: {
            thread_id: threadId,
          },
          recursionLimit: 5000,
          signal: abortController.signal,
          callbacks: [tokenHandler],
        });

      // 停止租约监控
      this.stopLeaseMonitor(taskExecutionId);

      // 写入 token 使用统计
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      if (isInterrupted(result)) {
        // interrupt 时保留映射，以便后续恢复
        // 但移除 activeExecutions，因为当前执行已暂停
        this.activeExecutions.delete(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        return { success: true, ...this.extractInterruptInfo(result) };
      }

      // 正常完成，清理映射
      this.activeExecutions.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);

      return {
        success: true,
        summary: result.finalSummary || undefined,
      };
    } catch (error) {
      // 停止租约监控
      this.stopLeaseMonitor(taskExecutionId);

      // 即使失败也写入已收集到的 token 统计
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // 失败时清理映射
      this.activeExecutions.delete(taskExecutionId);

      // 检测是否是 abort 错误（任务被取消）
      if (this.isAbortError(error as Error)) {
        const reason = this.abortReasons.get(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        this.logger.log(
          `Execution ${taskExecutionId} was cancelled (reason: ${reason}): ${(error as Error).message}`,
        );

        if (reason === "pause") {
          // 暂停时保留 threadIdMap，以便后续恢复或取消时能找到执行
          this.logger.log(
            `Execution ${taskExecutionId} paused, keeping threadIdMap for resume/cancel`,
          );
        } else {
          this.threadIdMap.delete(taskExecutionId);
          clearCompletedSummaries(taskExecutionId);
        }

        return {
          success: false,
          cancelled: true,
          abortReason: reason,
          error: (error as Error).message,
        };
      }

      // 非 abort 错误，完全清理
      this.threadIdMap.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);
      this.logger.error(
        `Sync execution ${taskExecutionId} failed: ${(error as Error).message}`,
        (error as Error).stack,
      );

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 取消任务执行
   *
   * @param taskExecutionId 执行 ID
   * @param userId 用户 ID
   * @param taskId 任务 ID
   * @param skipSummary 是否跳过生成总结（启动新任务触发的取消应跳过）
   * @returns 取消结果，包含 summary（如果生成了）
   */
  async cancelExecution(
    taskExecutionId: number,
    userId?: number,
    taskId?: number,
    skipSummary = false,
  ): Promise<CancelExecutionResult> {
    const threadId = this.threadIdMap.get(taskExecutionId);
    if (!threadId) {
      this.logger.warn(
        `Thread ID not found for taskExecutionId: ${taskExecutionId}`,
      );
      // 尝试使用默认格式
      const fallbackThreadId = taskId
        ? `task-${taskId}-exec-${taskExecutionId}`
        : undefined;
      if (!fallbackThreadId) {
        return { success: false, error: "Thread ID not found" };
      }
      return this.doCancelExecution(
        fallbackThreadId,
        taskExecutionId,
        skipSummary,
      );
    }
    return this.doCancelExecution(threadId, taskExecutionId, skipSummary);
  }

  /**
   * 执行取消操作
   *
   * 取消流程：
   * 1. 如果有 AbortController（执行中），触发 abort 信号中断当前执行
   * 2. 如果没有 AbortController（SUSPENDED 状态），跳过 abort 步骤
   * 3. 检查是否进入过 executor 子图，如果没有进入过则跳过 summarizer
   * 4. 如果 skipSummary=false 且进入过 executor，使用 Command 跳转到 summarizer 生成总结
   *
   * @param threadId 线程 ID
   * @param taskExecutionId 执行 ID
   * @param skipSummary 是否跳过生成总结
   */
  private async doCancelExecution(
    threadId: string,
    taskExecutionId: number,
    skipSummary = false,
  ): Promise<CancelExecutionResult> {
    const abortController = this.activeExecutions.get(taskExecutionId);

    this.logger.log(
      `Cancelling execution ${taskExecutionId}, skipSummary=${skipSummary}`,
    );

    // Step 1: 如果有 AbortController（正在运行），先 abort
    if (abortController) {
      // 仅在未设置 reason 时才覆写，防止暂停后立即取消时丢失原始 "pause" reason
      if (!this.abortReasons.has(taskExecutionId)) {
        this.abortReasons.set(taskExecutionId, "cancel");
      }
      abortController.abort();
      // 轮询等待图处理 abort 并保存 checkpoint，最多 3 秒
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!this.activeExecutions.has(taskExecutionId)) break;
      }
    } else {
      // AbortController 不存在说明执行已暂停（SUSPENDED）
      this.logger.log(`Execution ${taskExecutionId} is suspended`);
    }

    // 如果跳过总结，直接清理并返回
    if (skipSummary) {
      this.activeExecutions.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);
      this.logger.log(`Execution ${taskExecutionId} cancelled (skip summary)`);
      return { success: true };
    }

    try {
      // Step 2: 检查是否进入过 executor 子图
      this.logger.log(
        `[CANCEL] Checking executorEntered for ${taskExecutionId}, threadId=${threadId}`,
      );
      const stateSnapshot = await this.graphService
        .getMobileAgentGraph()
        .getState({
          configurable: { thread_id: threadId },
        });
      const executorEntered = stateSnapshot?.values?.executorEntered ?? false;

      // 如果没有进入过 executor，跳过 summarizer
      if (!executorEntered) {
        this.logger.log(
          `Execution ${taskExecutionId} cancelled (executor not entered, skip summarizer)`,
        );
        this.activeExecutions.delete(taskExecutionId);
        this.threadIdMap.delete(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        clearCompletedSummaries(taskExecutionId);
        return { success: true };
      }

      this.logger.log(
        `[CANCEL] executorEntered=true for ${taskExecutionId}, invoking summarizer`,
      );

      // Step 3: 使用 Command 跳转到 summarizer 生成总结
      const summarizerAbort = new AbortController();
      const summarizerTimeout = setTimeout(() => summarizerAbort.abort(), 55_000);
      const tokenHandler = new TokenUsageCallbackHandler();
      let result: any;
      try {
        result = await this.graphService.getMobileAgentGraph().invoke(
          new Command({
            goto: "summarizer",
            update: { isCancelled: true },
          }),
          {
            configurable: {
              thread_id: threadId,
              // 首 token 回调：收到 LLM 首个响应后取消超时，让流式输出自然完成
              onFirstToken: () => clearTimeout(summarizerTimeout),
            },
            recursionLimit: 100,
            signal: summarizerAbort.signal,
            callbacks: [tokenHandler],
          },
        );
      } finally {
        clearTimeout(summarizerTimeout);
      }

      this.logger.log(
        `[CANCEL] Summarizer completed for ${taskExecutionId}, summary=${result?.finalSummary ? "present" : "empty"}`,
      );

      // 写入 token 使用统计
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // 清理
      this.activeExecutions.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);

      this.logger.log(`Execution ${taskExecutionId} cancelled successfully`);
      return {
        success: true,
        summary: result?.finalSummary || undefined,
      };
    } catch (error) {
      const err = error as Error;

      // Summarizer 超时：优雅降级，返回 success + 兜底摘要
      if (this.isAbortError(err)) {
        this.logger.warn(
          `Cancel summarizer timed out for execution ${taskExecutionId}, using fallback`,
        );
        this.activeExecutions.delete(taskExecutionId);
        this.threadIdMap.delete(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        clearCompletedSummaries(taskExecutionId);
        return { success: true, summary: "任务已取消（总结生成超时）" };
      }

      this.logger.error(
        `Cancel execution ${taskExecutionId} failed: ${err.message}`,
        err.stack,
      );
      this.activeExecutions.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);
      return { success: false, error: err.message };
    }
  }

  /**
   * 暂停任务执行
   *
   * 使用 abortController 中止当前执行流，checkpoint 会自动保存
   */
  async pauseExecution(
    taskExecutionId: number
  ): Promise<boolean> {
    const abortController = this.activeExecutions.get(taskExecutionId);

    if (!abortController) {
      this.logger.warn(
        `[PAUSE] Execution ${taskExecutionId} not found in activeExecutions`,
      );
      return false;
    }

    const threadId = this.threadIdMap.get(taskExecutionId);
    this.logger.log(
      `[PAUSE] Pausing execution ${taskExecutionId}, threadId: ${threadId}`,
    );

    // 先停止租约监控（防止 monitor 回调覆写 abortReason）
    this.stopLeaseMonitor(taskExecutionId);

    // 设置 abort 原因：用户暂停
    this.abortReasons.set(taskExecutionId, "pause");

    // 中止当前执行
    abortController.abort();

    // 等待一小段时间让图处理 abort 并保存 checkpoint
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 移除 activeExecutions，保留 threadId 映射以便恢复
    this.activeExecutions.delete(taskExecutionId);

    this.logger.log(`Execution ${taskExecutionId} paused`);
    return true;
  }

  /**
   * 从暂停状态恢复执行
   *
   * 使用 null 作为输入从 checkpoint 继续执行
   */
  async resumeFromPause(
    taskId: number,
    taskExecutionId: number,
    userId?: number,
    feedback?: string,
  ): Promise<ExecuteTaskResult> {
    const threadId = this.threadIdMap.get(taskExecutionId);

    if (!threadId) {
      this.logger.warn(
        `Thread ID not found for taskExecutionId: ${taskExecutionId}`,
      );
      // 尝试使用默认格式
      const fallbackThreadId = `task-${taskId}-exec-${taskExecutionId}`;
      return this.doResumeFromPause(
        fallbackThreadId,
        taskExecutionId,
        userId,
        taskId,
        feedback,
      );
    }

    return this.doResumeFromPause(threadId, taskExecutionId, userId, taskId, feedback);
  }

  /**
   * 执行从暂停恢复操作
   * 注意：状态更新由调用方 (task-execution.service) 负责
   */
  private async doResumeFromPause(
    threadId: string,
    taskExecutionId: number,
    userId?: number,
    taskId?: number,
    feedback?: string,
  ): Promise<ExecuteTaskResult> {
    setExecutionId(taskExecutionId);
    this.logger.log(
      `[RESUME FROM PAUSE] Starting resume for execution ${taskExecutionId} with threadId: ${threadId}`,
    );

    // 复用未 abort 的预注册 controller（保留 cancel 信号），否则创建新的（防止复用暂停时已 abort 的旧实例）
    const existing = this.activeExecutions.get(taskExecutionId);
    const abortController = (existing && !existing.signal.aborted) ? existing : new AbortController();
    this.activeExecutions.set(taskExecutionId, abortController);

    // 重建租约（暂停期间租约可能已过期）
    if (userId != null && taskId != null) {
      await this.leaseService.createLease(taskExecutionId, userId, taskId);
    }

    // 启动租约监控
    this.startLeaseMonitor(taskExecutionId, abortController);

    // 暂停期间 TOS 签名 URL 可能过期，设置刷新标志
    try {
      await this.graphService.getMobileAgentGraph().updateState(
        { configurable: { thread_id: threadId } },
        { executor: { needRefreshImageUrls: true } },
      );
    } catch (err) {
      this.logger.warn(
        `[RESUME] Failed to set needRefreshImageUrls: ${(err as Error).message}`,
      );
    }

    // 注入用户暂停后补充的指令到 executor graph state
    const trimmedFeedback = feedback?.trim();
    if (trimmedFeedback) {
      try {
        const graph = this.graphService.getMobileAgentGraph();
        const config = { configurable: { thread_id: threadId } };

        const feedbackMsg = new HumanMessage({
          content: `用户暂停后补充指令：${trimmedFeedback}`,
          additional_kwargs: {
            created_at: new Date().toISOString(),
          },
        });

        // 注入到共享 sharedMessages
        await graph.updateState(config, {
          executor: {
            sharedMessages: [feedbackMsg],
          },
        });

        this.logger.log(
          `[RESUME FROM PAUSE] Injected user feedback into graph state for execution ${taskExecutionId}`,
        );
      } catch (err) {
        this.logger.warn(
          `[RESUME] Failed to inject pause-resume feedback: ${(err as Error).message}`,
        );
      }
    }

    const tokenHandler = new TokenUsageCallbackHandler();

    try {
      // 使用 null 从 checkpoint 继续执行
      const result = await this.graphService
        .getMobileAgentGraph()
        .invoke(null, {
          configurable: { thread_id: threadId },
          recursionLimit: 5000,
          signal: abortController.signal,
          callbacks: [tokenHandler],
        });

      // 停止租约监控
      this.stopLeaseMonitor(taskExecutionId);

      // 写入 token 使用统计
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // 清理映射
      this.activeExecutions.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);

      // 检查是否被中断（HITL）
      if (isInterrupted(result)) {
        // interrupt 时保留 threadIdMap，以便后续恢复（与 executeTask 一致）
        return { success: true, ...this.extractInterruptInfo(result) };
      }

      // 正常完成，清理所有映射
      this.threadIdMap.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);

      return {
        success: true,
        summary: result.finalSummary || undefined,
      };
    } catch (error) {
      // 停止租约监控
      this.stopLeaseMonitor(taskExecutionId);

      // 即使失败也写入已收集到的 token 统计
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      this.activeExecutions.delete(taskExecutionId);

      // 检测是否是 abort 错误（任务被取消）
      if (this.isAbortError(error as Error)) {
        const reason = this.abortReasons.get(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        this.logger.log(
          `Resume from pause ${taskExecutionId} was cancelled (reason: ${reason}): ${(error as Error).message}`,
        );
        if (reason !== "pause") {
          this.threadIdMap.delete(taskExecutionId);
          clearCompletedSummaries(taskExecutionId);
        }
        return {
          success: false,
          cancelled: true,
          abortReason: reason,
          error: (error as Error).message,
        };
      }

      this.abortReasons.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);
      this.logger.error(
        `Resume from pause ${taskExecutionId} failed: ${(error as Error).message}`,
        (error as Error).stack,
      );

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 恢复被中断的任务执行（HITL）
   * 当用户完成高危操作后调用此方法继续执行
   */
  async resumeExecution(
    taskId: number,
    taskExecutionId: number,
    response: CallUserResponse,
  ): Promise<ExecuteTaskResult> {
    const threadId = this.threadIdMap.get(taskExecutionId);

    if (!threadId) {
      this.logger.warn(
        `Thread ID not found for taskExecutionId: ${taskExecutionId}`,
      );
      // 尝试使用默认格式
      const fallbackThreadId = `task-${taskId}-exec-${taskExecutionId}`;
      this.logger.log(`Using fallback threadId: ${fallbackThreadId}`);
      return this.doResumeExecution(
        fallbackThreadId,
        taskExecutionId,
        response,
      );
    }

    return this.doResumeExecution(threadId, taskExecutionId, response);
  }

  /**
   * 执行恢复操作 (HITL)
   * 注意：状态更新由调用方 (task-execution.service) 负责
   */
  private async doResumeExecution(
    threadId: string,
    taskExecutionId: number,
    response: CallUserResponse,
  ): Promise<ExecuteTaskResult> {
    setExecutionId(taskExecutionId);
    this.logger.log(
      `Resuming execution ${taskExecutionId} with response: ${JSON.stringify(response)}`,
    );

    // 复用未 abort 的预注册 controller（保留 cancel 信号），否则创建新的
    const existing = this.activeExecutions.get(taskExecutionId);
    const abortController = (existing && !existing.signal.aborted) ? existing : new AbortController();
    this.activeExecutions.set(taskExecutionId, abortController);

    // 启动租约监控
    this.startLeaseMonitor(taskExecutionId, abortController);

    const tokenHandler = new TokenUsageCallbackHandler();

    try {
      // 使用 Command 恢复执行
      const result = await this.graphService
        .getMobileAgentGraph()
        .invoke(new Command({ resume: response }), {
          configurable: { thread_id: threadId },
          recursionLimit: 5000,
          signal: abortController.signal,
          callbacks: [tokenHandler],
        });

      // 停止租约监控
      this.stopLeaseMonitor(taskExecutionId);

      // 写入 token 使用统计
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // 清理 activeExecutions（执行已暂停/完成，不需要 AbortController）
      this.activeExecutions.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);

      // 检查是否再次被中断（HITL）
      if (isInterrupted(result)) {
        // 中断时保留 threadIdMap，以便后续恢复/取消能找到执行（与 executeTask 一致）
        return { success: true, ...this.extractInterruptInfo(result) };
      }

      // 正常完成，清理所有映射
      this.threadIdMap.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);

      return {
        success: true,
        summary: result.finalSummary || undefined,
      };
    } catch (error) {
      // 停止租约监控
      this.stopLeaseMonitor(taskExecutionId);

      // 即使失败也写入已收集到的 token 统计
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      this.activeExecutions.delete(taskExecutionId);

      // 检测是否是 abort 错误（任务被取消）
      if (this.isAbortError(error as Error)) {
        const reason = this.abortReasons.get(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        this.logger.log(
          `Resume execution ${taskExecutionId} was cancelled (reason: ${reason}): ${(error as Error).message}`,
        );
        if (reason !== "pause") {
          this.threadIdMap.delete(taskExecutionId);
          clearCompletedSummaries(taskExecutionId);
        }
        return {
          success: false,
          cancelled: true,
          abortReason: reason,
          error: (error as Error).message,
        };
      }

      this.abortReasons.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);
      this.logger.error(
        `Resume execution ${taskExecutionId} failed: ${(error as Error).message}`,
        (error as Error).stack,
      );

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Fork 执行
   *
   * 基于已终止的执行创建新的执行，复制原有对话历史，从 plan_supervisor 节点继续执行。
   * 核心步骤：
   * 1. 获取原 thread 状态
   * 2. 清理重置控制字段（finalSummary, planTodoComplete 等）
   * 3. 追加新指令作为 HumanMessage 到 plannerMessages
   * 4. 使用 updateState 跳转到 plan_supervisor 节点
   * 5. 执行 graph
   */
  async forkExecution(input: ForkExecutionInput): Promise<ExecuteTaskResult> {
    const {
      userId,
      taskId,
      taskExecutionId,
      originExecutionId,
      instruction: rawInstruction,
      userRegion,
      tenantId,
    } = input;
    setExecutionId(taskExecutionId);

    // 用户是否提供了追加指令
    const hasUserInstruction = !!rawInstruction?.trim();

    // 构建原 threadId 和新 threadId
    const originThreadId = `task-${taskId}-exec-${originExecutionId}`;
    const newThreadId = `task-${taskId}-exec-${taskExecutionId}`;

    this.logger.log(
      `[FORK] Starting fork execution: new=${taskExecutionId}, origin=${originExecutionId}, threadId=${newThreadId}`,
    );

    const tokenHandler = new TokenUsageCallbackHandler();

    try {
      // 1. 获取原 thread 状态
      const originSnapshot = await this.graphService
        .getMobileAgentGraph()
        .getState({
          configurable: { thread_id: originThreadId },
        });

      if (!originSnapshot?.values) {
        this.logger.error(
          `[FORK] Origin thread state not found: ${originThreadId}`,
        );
        return {
          success: false,
          error: `Origin execution state not found for thread ${originThreadId}`,
        };
      }

      const originState = originSnapshot.values as AgentState;

			// 1.5 兜底：当 originState 关键字段缺失时，从 user_task 读取原始指令
			let taskInstruction: string | undefined;
			if (!originState.userInput || !originState.executorInput?.instruction) {
				const task = await this.prismaService.user_task.findUnique({
					where: { id: taskId },
					select: { task_description: true, task_name: true },
				});
				taskInstruction =
					task?.task_description || task?.task_name || undefined;
				if (taskInstruction) {
					this.logger.log(
						`[FORK] originState missing userInput/executorInput, using task instruction as fallback: ${taskInstruction.substring(0, 100)}...`,
					);
				}
			}

			// userInput 兜底链：originState.userInput → task_description → rawInstruction
			const effectiveUserInput =
				originState.userInput ||
				taskInstruction ||
				rawInstruction ||
				"请继续执行任务";

			// 拼接用户追加指令（仅当用户提供时才拼接）
			const appendedUserInput = hasUserInstruction
				? `${effectiveUserInput}\n\n---\n\n用户追加指令：${rawInstruction}`
				: effectiveUserInput;

			// 1.6 复制原 thread 的 working_memory 到新 thread（单次 upsert）
			const originMemory =
				await this.workingMemoryService.getFullWorkingMemory(originThreadId);
			if (originMemory.content || originMemory.todos || originMemory.template) {
				await this.workingMemoryService.copyFullWorkingMemory(
					newThreadId,
					originMemory,
				);
				this.logger.log(
					`[FORK] Copied working memory from ${originThreadId} to ${newThreadId}`,
				);
			}

			// 2. 构建 baseForkedState（三种情况的公共字段）
			const baseForkedState: Partial<AgentState> = {
				userId,
				taskId,
				userRegion,
				tenantId,
				taskExecutionId,
				originExecutionId,
				startTime: Date.now(),
				// 保留原状态（带兜底）
				userInput: effectiveUserInput,
				planDocument: originState.planDocument,
				actionSummaryList: originState.actionSummaryList || [],
				executorEntered: originState.executorEntered,
				// executorInput 始终提供有效值，防止 undefined 传播
				executorInput: {
					instruction:
						originState.executorInput?.instruction ||
						taskInstruction ||
						effectiveUserInput,
					...(originState.executorInput?.skills && {
						skills: originState.executorInput.skills,
					}),
					...(originState.executorInput?.memory && {
						memory: originState.executorInput.memory,
					}),
				},
				...(originState.executorOutput && {
					executorOutput: { ...originState.executorOutput },
				}),
				tokenUsage: originState.tokenUsage || {
					promptTokens: 0,
					completionTokens: 0,
					totalTokens: 0,
				},
				// 重置控制字段
				planTodoComplete: false,
				isCancelled: false,
				isPaused: false,
			};

			// 3. 判断 fork 起始节点（以用户是否提供 feedback 为分支条件）
			let asNode: string;
			let forkedState: Partial<AgentState>;

			if (hasUserInstruction) {
				// Case A: 有用户 feedback → supervisor 重新规划（executor 从零开始）
				// supervisor 通过 plannerMessages 历史看到用户追加指令，
				// 通过 executorOutput 了解上次执行结果，重新评估并更新 todo 列表
				asNode = "supervisor";
				forkedState = {
					...baseForkedState,
					userInput: appendedUserInput,
					plannerMessages: [
						...(originState.plannerMessages || []),
						new HumanMessage({
							content: `用户追加指令：${rawInstruction}`,
							additional_kwargs: {
								created_at: new Date().toISOString(),
							},
						}),
					],
					messages: originState.messages || [],
					// 不设 forkResume → executor entry 走正常入口，_reset: true，VLM 从零开始
				};
			} else {
				// Case B: 无 feedback → 检查 todos 决定继续方式
				const todos = await this.workingMemoryService.getTodos(newThreadId);
				const hasPendingTodos = todos?.some(
					(t) => t.status === "in_progress" || t.status === "pending",
				);

				if (hasPendingTodos && originState.executor?.sharedMessages?.length > 0) {
					// 有待执行 todo + 有共享消息历史 → fork resume，继续 executor
					asNode = "extract_todo";
					forkedState = {
						...baseForkedState,
						forkResume: true,
						plannerMessages: originState.plannerMessages || [],
						messages: originState.messages || [],
						executor: {
							...originState.executor,
							sharedMessages: [...(originState.executor.sharedMessages || [])],
						},
					};
				} else if (hasPendingTodos) {
					// 有待执行 todo 但无 VLM 历史 → extract_todo 正常提取
					asNode = "extract_todo";
					forkedState = {
						...baseForkedState,
						plannerMessages: originState.plannerMessages || [],
						messages: originState.messages || [],
					};
				} else {
					// 无 todo / 全部完成 → supervisor 重新规划
					asNode = "supervisor";
					forkedState = {
						...baseForkedState,
						userInput: effectiveUserInput,
						plannerMessages: originState.plannerMessages || [],
						messages: originState.messages || [],
					};
				}
			}

			// 4. 使用 updateState 初始化新 thread
			await this.graphService
				.getMobileAgentGraph()
				.updateState(
					{ configurable: { thread_id: newThreadId } },
					forkedState,
					asNode,
				);

			this.logger.log(
				`[FORK] State initialized for new thread ${newThreadId}, starting from ${asNode} (hasInstruction=${hasUserInstruction}, forkResume=${!!forkedState.forkResume})`,
			);

      // 5. 复用未 abort 的预注册 controller（保留 cancel 信号），否则创建新的
      const existingAc = this.activeExecutions.get(taskExecutionId);
      const abortController = (existingAc && !existingAc.signal.aborted) ? existingAc : new AbortController();
      this.activeExecutions.set(taskExecutionId, abortController);
      this.threadIdMap.set(taskExecutionId, newThreadId);
      this.startLeaseMonitor(taskExecutionId, abortController);

      // 6. 从新 thread 继续执行
      const result = await this.graphService.getMobileAgentGraph().invoke(
        null, // 使用 null 从 checkpoint 继续
        {
          configurable: { thread_id: newThreadId },
          recursionLimit: 5000,
          signal: abortController.signal,
          callbacks: [tokenHandler],
        },
      );

      // 7. 停止租约监控
      this.stopLeaseMonitor(taskExecutionId);

      // 写入 token 使用统计
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // 8. 处理结果
      if (isInterrupted(result)) {
        // interrupt 时保留映射，以便后续恢复
        this.activeExecutions.delete(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        return { success: true, ...this.extractInterruptInfo(result) };
      }

      // 正常完成，清理映射
      this.activeExecutions.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);

      return {
        success: true,
        summary: result.finalSummary || undefined,
      };
    } catch (error) {
      // 停止租约监控
      this.stopLeaseMonitor(taskExecutionId);

      // 即使失败也写入已收集到的 token 统计
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // 失败时清理映射
      this.activeExecutions.delete(taskExecutionId);

      // 检测是否是 abort 错误（任务被取消）
      if (this.isAbortError(error as Error)) {
        const reason = this.abortReasons.get(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        this.logger.log(
          `[FORK] Execution ${taskExecutionId} was cancelled (reason: ${reason}): ${(error as Error).message}`,
        );

        if (reason === "pause") {
          // 暂停时保留 threadIdMap，以便后续恢复或取消时能找到执行
          this.logger.log(
            `[FORK] Execution ${taskExecutionId} paused, keeping threadIdMap for resume/cancel`,
          );
        } else {
          this.threadIdMap.delete(taskExecutionId);
          clearCompletedSummaries(taskExecutionId);
        }

        return {
          success: false,
          cancelled: true,
          abortReason: reason,
          error: (error as Error).message,
        };
      }

      // 非 abort 错误，完全清理
      this.threadIdMap.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);
      this.logger.error(
        `[FORK] Execution ${taskExecutionId} failed: ${(error as Error).message}`,
        (error as Error).stack,
      );

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // ============= Token 使用统计 =============

  /**
   * 更新 token_usage（增量合并，支持 resume/fork 场景累加）
   */
  private async updateTokenUsage(
    taskExecutionId: number,
    newUsage: TokenUsageResult,
  ): Promise<void> {
    try {
      const existing = await this.prismaService.task_execution.findUnique({
        where: { id: taskExecutionId },
        select: { token_usage: true },
      });

      let finalUsage: TokenUsageResult = newUsage;

      // 如果有旧值（resume/fork 场景），合并
      if (existing?.token_usage && typeof existing.token_usage === "object") {
        const handler = new TokenUsageCallbackHandler();
        handler.merge(existing.token_usage as TokenUsageResult);
        handler.merge(newUsage);
        finalUsage = handler.getResult();
      }

      await this.prismaService.task_execution.update({
        where: { id: taskExecutionId },
        data: {
          token_usage: finalUsage as unknown as Record<string, unknown>,
          updated_at: new Date(),
        },
      });

      this.logger.debug(
        `Updated token usage for execution ${taskExecutionId}: ${finalUsage.total_tokens} tokens`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to update token usage for execution ${taskExecutionId}: ${(error as Error).message}`,
      );
    }
  }

  // ============= 租约监控 =============

  /**
   * 启动租约监控
   *
   * 定期检查租约是否有效，如果租约过期则触发 AbortController 终止任务。
   * 这样可以在客户端杀掉进程后，及时终止任务执行，节省 token。
   */
  private startLeaseMonitor(
    taskExecutionId: number,
    abortController: AbortController,
  ): void {
    // 清理已有的监控（如果有）
    this.stopLeaseMonitor(taskExecutionId);

    // 连续失效计数 — 避免因单次检测瞬时失效就中止任务
    // 要求连续 2 次（约 6s）检测到 lease 不存在才中止
    // 给重连后的心跳一个重建 lease 的窗口
    let consecutiveFailures = 0;
    const ABORT_THRESHOLD = 2;

    const monitor = setInterval(async () => {
      try {
        const isValid = await this.leaseService.isLeaseValid(taskExecutionId);

        if (!isValid) {
          consecutiveFailures++;
          if (consecutiveFailures >= ABORT_THRESHOLD) {
            this.logger.warn(
              `[LEASE MONITOR] Lease expired for execution ${taskExecutionId} (${consecutiveFailures} consecutive checks), aborting task`,
            );

            // 仅在尚未设置 abortReason 时写入（防止覆写 "pause"）
            if (!this.abortReasons.has(taskExecutionId)) {
              this.abortReasons.set(taskExecutionId, "lease_expired");
            }

            // 仅在尚未 abort 时触发
            if (!abortController.signal.aborted) {
              abortController.abort();
            }

            // 停止监控
            this.stopLeaseMonitor(taskExecutionId);
          } else {
            this.logger.warn(
              `[LEASE MONITOR] Lease not found for execution ${taskExecutionId} (${consecutiveFailures}/${ABORT_THRESHOLD}), waiting for possible reconnect`,
            );
          }
        } else {
          consecutiveFailures = 0;
        }
      } catch (error) {
        this.logger.error(
          `[LEASE MONITOR] Error checking lease for execution ${taskExecutionId}: ${(error as Error).message}`,
        );
        // 检查出错时不终止任务，继续监控
      }
    }, this.LEASE_CHECK_INTERVAL_MS);

    this.leaseMonitors.set(taskExecutionId, monitor);
    this.logger.debug(
      `[LEASE MONITOR] Started monitoring execution ${taskExecutionId}, interval: ${this.LEASE_CHECK_INTERVAL_MS}ms`,
    );
  }

  /**
   * 停止租约监控
   */
  private stopLeaseMonitor(taskExecutionId: number): void {
    const monitor = this.leaseMonitors.get(taskExecutionId);
    if (monitor) {
      clearInterval(monitor);
      this.leaseMonitors.delete(taskExecutionId);
      this.logger.debug(
        `[LEASE MONITOR] Stopped monitoring execution ${taskExecutionId}`,
      );
    }
  }
}
