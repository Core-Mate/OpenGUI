import { GraphRunnerService } from "./graph-runner.service";
import type { SupervisorTodo } from "./graph/state/state.types";

// These providers initialize database/model infrastructure at module load.
// Keep the runner real and replace only its external execution/storage boundary.
jest.mock("./graph/mobile-agent.graph", () => ({ MobileAgentGraphService: class {} }));
jest.mock("../../common/lease/lease.service", () => ({ LeaseService: class {} }));
jest.mock("../../prisma/prisma.service", () => ({ PrismaService: class {} }));
jest.mock("./working-memory/working-memory.service", () => ({ WorkingMemoryService: class {} }));
jest.mock("uuid", () => ({ v4: () => "test-trace-id" }));
jest.mock("./graph/nodes/executor/post-execute.node", () => ({ clearCompletedSummaries: () => undefined }));

const input = {
  userId: 1, taskId: 2, taskExecutionId: 3,
  userInput: "Open Settings", userRegion: "CN", tenantId: -1,
};

type RunMode = "new" | "pause" | "hitl" | "fork";

function createRunner(state: Record<string, unknown>, todos: SupervisorTodo[] = []) {
  const graph = {
    invoke: async () => state,
    updateState: async () => undefined,
    getState: async () => ({ values: { userInput: input.userInput, executorInput: { instruction: input.userInput } } }),
  };
  const memory = {
    getTodos: async () => todos,
    getFullWorkingMemory: async () => ({ content: "", todos: null, template: null }),
    copyFullWorkingMemory: async () => undefined,
  };
  type Dependencies = ConstructorParameters<typeof GraphRunnerService>;
  return new GraphRunnerService(
    { getMobileAgentGraph: () => graph } as unknown as Dependencies[0],
    { isLeaseValid: async () => true } as unknown as Dependencies[1],
    {} as Dependencies[2],
    memory as unknown as Dependencies[3],
  );
}

async function run(runner: GraphRunnerService, mode: RunMode) {
  switch (mode) {
    case "new": return runner.executeTask(input);
    case "pause": return runner.resumeFromPause(input.taskId, input.taskExecutionId);
    case "hitl": return runner.resumeExecution(input.taskId, input.taskExecutionId, { feedback: "Continue" });
    case "fork": return runner.forkExecution({ ...input, originExecutionId: 4, instruction: "Try again" });
  }
}

describe.each<RunMode>(["new", "pause", "hitl", "fork"])("GraphRunner terminal result (%s)", (mode) => {
  it("returns failure when screenshot sensing failed despite a generated summary", async () => {
    const runner = createRunner({
      executor: { status: "error", errorMessage: "Sense failed: Screenshot request failed" },
      executorOutput: { success: false, task: "Open Settings", fail_reason: "Sense failed: Screenshot request failed" },
      finalSummary: "No screenshots were available", planTodoComplete: true,
    });
    const result = await run(runner, mode);
    expect(result).toMatchObject({ success: false, error: "Sense failed: Screenshot request failed", summary: "No screenshots were available" });
  });

  it("returns failure when an earlier todo failed but the last executor succeeded", async () => {
    const runner = createRunner({
      executor: { status: "finished" }, executorOutput: { success: true, task: "Report result" },
      finalSummary: "Only reporting succeeded", planTodoComplete: true,
    }, [
      { content: "Open Settings", status: "failed", result: "failure" },
      { content: "Report result", status: "completed", result: "success" },
    ]);
    const result = await run(runner, mode);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Open Settings");
  });

  it("returns success after failed work is recovered and all todos succeed", async () => {
    const runner = createRunner({
      executor: { status: "finished", errorMessage: "Earlier transient error" },
      executorOutput: { success: true, task: "Report result" },
      finalSummary: "Settings opened", planTodoComplete: true,
    }, [
      { content: "Open Settings", status: "completed", result: "success" },
      { content: "Report result", status: "completed" },
    ]);
    expect(await run(runner, mode)).toEqual({ success: true, summary: "Settings opened" });
  });

  it("keeps human intervention suspended instead of marking unfinished todos failed", async () => {
    const runner = createRunner({
      __interrupt__: [{ value: "Please enable accessibility", id: "accessibility" }],
    }, [{ content: "Open Settings", status: "in_progress" }]);
    expect(await run(runner, mode)).toEqual({
      success: true, hitl_reason: "Please enable accessibility", hitl_type: "call_user",
    });
  });
});

describe("GraphRunner terminal failure boundaries", () => {
  it.each<SupervisorTodo>([
    { content: "Read screen", status: "pending" },
    { content: "Read screen", status: "in_progress" },
    { content: "Read screen", status: "completed", result: "failure" },
    { content: "Read screen", status: "completed", result: "refused" },
  ])("does not report unfinished or unsuccessful todos as success: %j", async (todo) => {
    const runner = createRunner({ finalSummary: "Stopped", planTodoComplete: true }, [todo]);
    expect((await runner.executeTask(input)).success).toBe(false);
  });

  it("does not report an unrecoverable supervisor error as success", async () => {
    const runner = createRunner({ supervisorError: true, finalSummary: "Planning failed" });
    expect((await runner.executeTask(input)).success).toBe(false);
  });

  it("preserves successful completion without a device subtask", async () => {
    const runner = createRunner({ finalSummary: "Answered without device actions" });
    expect(await runner.executeTask(input)).toEqual({ success: true, summary: "Answered without device actions" });
  });
});
