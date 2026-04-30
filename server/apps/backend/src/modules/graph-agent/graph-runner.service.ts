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
 * Task execution input.
 */
export interface ExecuteTaskInput {
  userId: number;
  taskId: number;
  taskExecutionId: number;
  userInput: string;
  knowledgeBaseId?: number;
  /** User region (CN/US). */
  userRegion: string;
  /** User tenant ID. */
  tenantId: number;
}

/**
 * Task execution result.
 */
export interface ExecuteTaskResult {
  success: boolean;
  hitl_reason?: string;
  /** Interrupt type: call_user means user action is required; insufficient_balance means credits are insufficient. */
  hitl_type?: "call_user" | "insufficient_balance";
  summary?: string;
  error?: string;
  /** Whether the task was cancelled through abort. */
  cancelled?: boolean;
  /** Abort source: cancel = user cancelled, pause = user paused, lease_expired = lease expired. */
  abortReason?: "cancel" | "pause" | "lease_expired";
}

/**
 * Cancel execution result.
 */
export interface CancelExecutionResult {
  success: boolean;
  summary?: string;
  error?: string;
}

/**
 * User response type.
 */
export interface CallUserResponse {
  /** User feedback. */
  feedback?: string;
}

/**
 * Fork execution input.
 */
export interface ForkExecutionInput {
  userId: number;
  taskId: number;
  taskExecutionId: number; // New execution ID.
  originExecutionId: number; // Original execution ID.
  instruction?: string; // Additional user instruction; continue directly when omitted.
  userRegion: string;
  tenantId: number;
}

@Injectable()
export class GraphRunnerService {
  private readonly logger = new Logger(GraphRunnerService.name);
  private readonly activeExecutions = new Map<number, AbortController>();
  private readonly threadIdMap = new Map<number, string>(); // taskExecutionId -> threadId.
  private readonly leaseMonitors = new Map<number, NodeJS.Timeout>(); // taskExecutionId -> monitor timer.
  private readonly abortReasons = new Map<
    number,
    "cancel" | "pause" | "lease_expired"
  >(); // taskExecutionId -> abort reason.

  /** Lease check interval in milliseconds; roughly one third of the TTL is recommended. */
  private readonly LEASE_CHECK_INTERVAL_MS = 3000;

  constructor(
    private readonly graphService: MobileAgentGraphService,
    @Inject(forwardRef(() => LeaseService))
    private readonly leaseService: LeaseService,
    private readonly prismaService: PrismaService,
    private readonly workingMemoryService: WorkingMemoryService,
  ) {}

  /**
   * Check whether this instance owns an execution.
   */
  hasExecution(taskExecutionId: number): boolean {
    return (
      this.activeExecutions.has(taskExecutionId) ||
      this.threadIdMap.has(taskExecutionId)
    );
  }

  /**
   * Pre-register an execution so cancelExecution can find it before the
   * setImmediate callback runs. Existing AbortController instances are kept.
   */
  preRegisterExecution(taskExecutionId: number): AbortController {
    const existing = this.activeExecutions.get(taskExecutionId);
    if (existing) return existing;
    const ac = new AbortController();
    this.activeExecutions.set(taskExecutionId, ac);
    return ac;
  }

  /**
   * Detect whether an error came from aborting the task.
   */
  private isAbortError(error: Error): boolean {
    return (
      error.name === "AbortError" ||
      error.message === "This operation was aborted" ||
      error.message?.includes("The operation was aborted")
    );
  }

  /**
   * Extract interrupt info from the result.
   * LangGraph interrupt(value) stores the value at result[INTERRUPT][0].value.
   */
  private extractInterruptInfo(result: any): {
    hitl_reason: string;
    hitl_type: "call_user" | "insufficient_balance";
  } {
    const interruptValue = result?.[INTERRUPT]?.[0]?.value;
    const hitl_reason = typeof interruptValue === "string"
      ? interruptValue
	      : "User intervention is required";
    const hitl_type = hitl_reason === "insufficient_balance"
      ? "insufficient_balance" as const
      : "call_user" as const;
    return { hitl_reason, hitl_type };
  }

  /**
   * Execute a task synchronously.
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
    // Store the threadId mapping for later resume/cancel operations.
    this.threadIdMap.set(taskExecutionId, threadId);

    // If the execution was cancelled after pre-registration and before executeTask, return immediately.
    if (abortController.signal.aborted) {
      const reason = this.abortReasons.get(taskExecutionId) || "cancel";
      this.activeExecutions.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      return { success: false, cancelled: true, abortReason: reason };
    }

    // Start lease monitoring.
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

      // Stop lease monitoring.
      this.stopLeaseMonitor(taskExecutionId);

      // Persist token usage.
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      if (isInterrupted(result)) {
        // Keep the mapping on interrupt for later resume, but remove the
        // active execution because the current run is suspended.
        this.activeExecutions.delete(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        return { success: true, ...this.extractInterruptInfo(result) };
      }

      // Normal completion: clean mappings.
      this.activeExecutions.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);

      return {
        success: true,
        summary: result.finalSummary || undefined,
      };
    } catch (error) {
      // Stop lease monitoring.
      this.stopLeaseMonitor(taskExecutionId);

      // Persist any token usage collected before failure.
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // Clean mappings after failure.
      this.activeExecutions.delete(taskExecutionId);

      // Detect abort errors, which mean the task was cancelled.
      if (this.isAbortError(error as Error)) {
        const reason = this.abortReasons.get(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        this.logger.log(
          `Execution ${taskExecutionId} was cancelled (reason: ${reason}): ${(error as Error).message}`,
        );

        if (reason === "pause") {
          // Keep threadIdMap on pause so resume/cancel can still find the execution.
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

      // Non-abort errors get a full cleanup.
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
   * Cancel task execution.
   *
   * @param taskExecutionId Execution ID.
   * @param userId User ID
   * @param taskId Task ID.
   * @param skipSummary Whether to skip summary generation; cancels triggered by starting a new task should skip it.
   * @returns Cancel result with a summary when generated.
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
      // Try the default thread format.
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
   * Execute the cancellation flow.
   *
   * Cancellation flow:
   * 1. Abort the current execution when an AbortController exists.
   * 2. Skip abort when there is no AbortController, which means the execution is suspended.
   * 3. Check whether the executor subgraph was entered; skip summarizer if not.
   * 4. When skipSummary=false and executor was entered, jump to summarizer with Command.
   *
   * @param threadId Thread ID.
   * @param taskExecutionId Execution ID.
   * @param skipSummary Whether to skip summary generation.
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

    // Step 1: Abort first when an AbortController exists.
    if (abortController) {
      // Set the reason only when missing, so a cancel immediately after pause does not overwrite "pause".
      if (!this.abortReasons.has(taskExecutionId)) {
        this.abortReasons.set(taskExecutionId, "cancel");
      }
      abortController.abort();
      // Poll for up to 3 seconds while the graph handles abort and saves the checkpoint.
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!this.activeExecutions.has(taskExecutionId)) break;
      }
    } else {
      // Missing AbortController means the execution is suspended.
      this.logger.log(`Execution ${taskExecutionId} is suspended`);
    }

    // If summary is skipped, clean up and return directly.
    if (skipSummary) {
      this.activeExecutions.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);
      this.logger.log(`Execution ${taskExecutionId} cancelled (skip summary)`);
      return { success: true };
    }

    try {
      // Step 2: Check whether the executor subgraph was entered.
      this.logger.log(
        `[CANCEL] Checking executorEntered for ${taskExecutionId}, threadId=${threadId}`,
      );
      const stateSnapshot = await this.graphService
        .getMobileAgentGraph()
        .getState({
          configurable: { thread_id: threadId },
        });
      const executorEntered = stateSnapshot?.values?.executorEntered ?? false;

      // Skip summarizer when executor was never entered.
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

      // Step 3: Jump to summarizer with Command to generate the summary.
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
              // First-token callback: clear the timeout after the LLM starts responding.
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

      // Persist token usage.
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // Cleanup.
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

      // Summarizer timeout: degrade gracefully with a fallback summary.
      if (this.isAbortError(err)) {
        this.logger.warn(
          `Cancel summarizer timed out for execution ${taskExecutionId}, using fallback`,
        );
        this.activeExecutions.delete(taskExecutionId);
        this.threadIdMap.delete(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        clearCompletedSummaries(taskExecutionId);
	        return { success: true, summary: "Task cancelled; summary generation timed out" };
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
   * Pause task execution.
   *
   * Use AbortController to stop the current execution stream; checkpoints are saved automatically.
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

    // Stop lease monitoring first so the monitor cannot overwrite abortReason.
    this.stopLeaseMonitor(taskExecutionId);

    // Set abort reason to user pause.
    this.abortReasons.set(taskExecutionId, "pause");

    // Abort current execution.
    abortController.abort();

    // Give the graph a short moment to handle abort and save the checkpoint.
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Remove activeExecutions but keep threadId mapping for resume.
    this.activeExecutions.delete(taskExecutionId);

    this.logger.log(`Execution ${taskExecutionId} paused`);
    return true;
  }

  /**
   * Resume execution from pause.
   *
   * Use null input to continue from the checkpoint.
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
      // Try the default thread format.
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
   * Execute resume-from-pause.
   * Note: the caller (task-execution.service) owns status updates.
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

    // Reuse a pre-registered controller that was not aborted; otherwise create a new one.
    const existing = this.activeExecutions.get(taskExecutionId);
    const abortController = (existing && !existing.signal.aborted) ? existing : new AbortController();
    this.activeExecutions.set(taskExecutionId, abortController);

    // Recreate the lease because it may have expired during pause.
    if (userId != null && taskId != null) {
      await this.leaseService.createLease(taskExecutionId, userId, taskId);
    }

    // Start lease monitoring.
    this.startLeaseMonitor(taskExecutionId, abortController);

    // TOS signed URLs may expire during pause, so request URL refresh.
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

    // Inject the user's additional pause-resume instruction into executor graph state.
    const trimmedFeedback = feedback?.trim();
    if (trimmedFeedback) {
      try {
        const graph = this.graphService.getMobileAgentGraph();
        const config = { configurable: { thread_id: threadId } };

        const feedbackMsg = new HumanMessage({
	          content: `Additional instruction after user pause: ${trimmedFeedback}`,
          additional_kwargs: {
            created_at: new Date().toISOString(),
          },
        });

        // Inject into sharedMessages.
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
      // Continue from the checkpoint with null input.
      const result = await this.graphService
        .getMobileAgentGraph()
        .invoke(null, {
          configurable: { thread_id: threadId },
          recursionLimit: 5000,
          signal: abortController.signal,
          callbacks: [tokenHandler],
        });

      // Stop lease monitoring.
      this.stopLeaseMonitor(taskExecutionId);

      // Persist token usage.
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // Clean mappings.
      this.activeExecutions.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);

      // Check whether execution was interrupted for HITL.
      if (isInterrupted(result)) {
        // Keep threadIdMap on interrupt for later resume, same as executeTask.
        return { success: true, ...this.extractInterruptInfo(result) };
      }

      // Normal completion: clean all mappings.
      this.threadIdMap.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);

      return {
        success: true,
        summary: result.finalSummary || undefined,
      };
    } catch (error) {
      // Stop lease monitoring.
      this.stopLeaseMonitor(taskExecutionId);

      // Persist any token usage collected before failure.
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      this.activeExecutions.delete(taskExecutionId);

      // Detect abort errors, which mean the task was cancelled.
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
   * Resume an interrupted HITL execution.
   * Call this after the user finishes the required high-risk/manual action.
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
      // Try the default thread format.
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
   * Execute HITL resume.
   * Note: the caller (task-execution.service) owns status updates.
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

    // Reuse a pre-registered controller that was not aborted; otherwise create a new one.
    const existing = this.activeExecutions.get(taskExecutionId);
    const abortController = (existing && !existing.signal.aborted) ? existing : new AbortController();
    this.activeExecutions.set(taskExecutionId, abortController);

    // Start lease monitoring.
    this.startLeaseMonitor(taskExecutionId, abortController);

    const tokenHandler = new TokenUsageCallbackHandler();

    try {
      // Resume execution with Command.
      const result = await this.graphService
        .getMobileAgentGraph()
        .invoke(new Command({ resume: response }), {
          configurable: { thread_id: threadId },
          recursionLimit: 5000,
          signal: abortController.signal,
          callbacks: [tokenHandler],
        });

      // Stop lease monitoring.
      this.stopLeaseMonitor(taskExecutionId);

      // Persist token usage.
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // Clean activeExecutions; suspended/completed executions no longer need an AbortController.
      this.activeExecutions.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);

      // Check whether the execution was interrupted again for HITL.
      if (isInterrupted(result)) {
        // Keep threadIdMap on interrupt so resume/cancel can find the execution, same as executeTask.
        return { success: true, ...this.extractInterruptInfo(result) };
      }

      // Normal completion: clean all mappings.
      this.threadIdMap.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);

      return {
        success: true,
        summary: result.finalSummary || undefined,
      };
    } catch (error) {
      // Stop lease monitoring.
      this.stopLeaseMonitor(taskExecutionId);

      // Persist any token usage collected before failure.
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      this.activeExecutions.delete(taskExecutionId);

      // Detect abort errors, which mean the task was cancelled.
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
   * Fork execution.
   *
   * Create a new execution from a terminated one, copy conversation history,
   * and continue from the plan_supervisor node.
   * Main steps:
   * 1. Read the original thread state.
   * 2. Clear reset-control fields such as finalSummary and planTodoComplete.
   * 3. Append the new instruction as a HumanMessage to plannerMessages.
   * 4. Use updateState to jump to plan_supervisor.
   * 5. Run the graph.
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

    // Whether the user provided an additional instruction.
    const hasUserInstruction = !!rawInstruction?.trim();

    // Build original and new thread IDs.
    const originThreadId = `task-${taskId}-exec-${originExecutionId}`;
    const newThreadId = `task-${taskId}-exec-${taskExecutionId}`;

    this.logger.log(
      `[FORK] Starting fork execution: new=${taskExecutionId}, origin=${originExecutionId}, threadId=${newThreadId}`,
    );

    const tokenHandler = new TokenUsageCallbackHandler();

    try {
      // 1. Read original thread state.
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

			// 1.5 Fallback: read the original instruction from user_task when key fields are missing.
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

			// userInput fallback chain: originState.userInput -> task_description -> rawInstruction.
			const effectiveUserInput =
				originState.userInput ||
				taskInstruction ||
				rawInstruction ||
					"Please continue executing the task";

			// Append the additional user instruction only when provided.
			const appendedUserInput = hasUserInstruction
					? `${effectiveUserInput}\n\n---\n\nAdditional user instruction: ${rawInstruction}`
				: effectiveUserInput;

			// 1.6 Copy working_memory from the original thread to the new thread.
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

			// 2. Build baseForkedState with fields shared by all branches.
			const baseForkedState: Partial<AgentState> = {
				userId,
				taskId,
				userRegion,
				tenantId,
				taskExecutionId,
				originExecutionId,
				startTime: Date.now(),
				// Keep original state with fallbacks.
				userInput: effectiveUserInput,
				planDocument: originState.planDocument,
				actionSummaryList: originState.actionSummaryList || [],
				executorEntered: originState.executorEntered,
				// Always provide a valid executorInput to avoid undefined propagation.
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
				// Reset control fields.
				planTodoComplete: false,
				isCancelled: false,
				isPaused: false,
			};

			// 3. Pick the fork start node based on whether the user provided feedback.
			let asNode: string;
			let forkedState: Partial<AgentState>;

			if (hasUserInstruction) {
				// Case A: user feedback exists -> supervisor replans and executor starts fresh.
				// Supervisor sees the additional instruction through plannerMessages,
				// reads the previous result from executorOutput, then reevaluates and updates todos.
				asNode = "supervisor";
				forkedState = {
					...baseForkedState,
					userInput: appendedUserInput,
					plannerMessages: [
						...(originState.plannerMessages || []),
						new HumanMessage({
								content: `Additional user instruction: ${rawInstruction}`,
							additional_kwargs: {
								created_at: new Date().toISOString(),
							},
						}),
					],
					messages: originState.messages || [],
					// Leave forkResume unset so executor entry uses normal entry, _reset=true, and VLM starts fresh.
				};
			} else {
				// Case B: no feedback -> inspect todos to decide how to continue.
				const todos = await this.workingMemoryService.getTodos(newThreadId);
				const hasPendingTodos = todos?.some(
					(t) => t.status === "in_progress" || t.status === "pending",
				);

				if (hasPendingTodos && originState.executor?.sharedMessages?.length > 0) {
					// Pending todo plus shared message history -> fork resume and continue executor.
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
					// Pending todo without VLM history -> run extract_todo normally.
					asNode = "extract_todo";
					forkedState = {
						...baseForkedState,
						plannerMessages: originState.plannerMessages || [],
						messages: originState.messages || [],
					};
				} else {
					// No todo or all todos completed -> supervisor replans.
					asNode = "supervisor";
					forkedState = {
						...baseForkedState,
						userInput: effectiveUserInput,
						plannerMessages: originState.plannerMessages || [],
						messages: originState.messages || [],
					};
				}
			}

			// 4. Initialize the new thread with updateState.
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

      // 5. Reuse a pre-registered controller that was not aborted; otherwise create a new one.
      const existingAc = this.activeExecutions.get(taskExecutionId);
      const abortController = (existingAc && !existingAc.signal.aborted) ? existingAc : new AbortController();
      this.activeExecutions.set(taskExecutionId, abortController);
      this.threadIdMap.set(taskExecutionId, newThreadId);
      this.startLeaseMonitor(taskExecutionId, abortController);

      // 6. Continue from the new thread.
      const result = await this.graphService.getMobileAgentGraph().invoke(
        null, // Continue from the checkpoint.
        {
          configurable: { thread_id: newThreadId },
          recursionLimit: 5000,
          signal: abortController.signal,
          callbacks: [tokenHandler],
        },
      );

      // 7. Stop lease monitoring.
      this.stopLeaseMonitor(taskExecutionId);

      // Persist token usage.
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // 8. Handle result.
      if (isInterrupted(result)) {
        // Keep mappings on interrupt for later resume.
        this.activeExecutions.delete(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        return { success: true, ...this.extractInterruptInfo(result) };
      }

      // Normal completion: clean mappings.
      this.activeExecutions.delete(taskExecutionId);
      this.threadIdMap.delete(taskExecutionId);
      this.abortReasons.delete(taskExecutionId);
      clearCompletedSummaries(taskExecutionId);

      return {
        success: true,
        summary: result.finalSummary || undefined,
      };
    } catch (error) {
      // Stop lease monitoring.
      this.stopLeaseMonitor(taskExecutionId);

      // Persist any token usage collected before failure.
      const tokenUsage = tokenHandler.getResult();
      if (tokenUsage.total_tokens > 0) {
        await this.updateTokenUsage(taskExecutionId, tokenUsage);
      }

      // Clean mappings after failure.
      this.activeExecutions.delete(taskExecutionId);

      // Detect abort errors, which mean the task was cancelled.
      if (this.isAbortError(error as Error)) {
        const reason = this.abortReasons.get(taskExecutionId);
        this.abortReasons.delete(taskExecutionId);
        this.logger.log(
          `[FORK] Execution ${taskExecutionId} was cancelled (reason: ${reason}): ${(error as Error).message}`,
        );

        if (reason === "pause") {
          // Keep threadIdMap on pause so resume/cancel can still find the execution.
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

      // Non-abort errors get a full cleanup.
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

  // ============= Token Usage =============

  /**
   * Update token_usage by merging increments across resume/fork flows.
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

      // Merge with existing values for resume/fork flows.
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

  // ============= Lease Monitoring =============

  /**
   * Start lease monitoring.
   *
   * Periodically check whether the lease is valid. If it expires, abort the task.
   * This stops execution promptly after the client process is killed and saves tokens.
   */
  private startLeaseMonitor(
    taskExecutionId: number,
    abortController: AbortController,
  ): void {
    // Clear any existing monitor first.
    this.stopLeaseMonitor(taskExecutionId);

    // Consecutive failure count prevents aborting on a single transient miss.
    // Require two consecutive misses, roughly 6 seconds, before aborting.
    // This leaves a short window for heartbeat lease recreation after reconnect.
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

            // Set abortReason only when missing so "pause" is not overwritten.
            if (!this.abortReasons.has(taskExecutionId)) {
              this.abortReasons.set(taskExecutionId, "lease_expired");
            }

            // Abort only once.
            if (!abortController.signal.aborted) {
              abortController.abort();
            }

            // Stop monitoring.
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
        // Do not terminate the task on monitor errors; keep monitoring.
      }
    }, this.LEASE_CHECK_INTERVAL_MS);

    this.leaseMonitors.set(taskExecutionId, monitor);
    this.logger.debug(
      `[LEASE MONITOR] Started monitoring execution ${taskExecutionId}, interval: ${this.LEASE_CHECK_INTERVAL_MS}ms`,
    );
  }

  /**
   * Stop lease monitoring.
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
