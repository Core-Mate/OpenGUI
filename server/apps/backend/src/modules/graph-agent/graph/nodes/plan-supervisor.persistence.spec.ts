import { START, END, StateGraph } from "@langchain/langgraph";
import { Logger } from "@nestjs/common";
import { FakeToolCallingModel } from "langchain";
import type { PrismaService } from "../../../../prisma/prisma.service";
import { createConfiguredChatModel } from "../../config/chat-model.factory";
import { SupervisorTodosToolService } from "../../tools/supervisor-todos.tool";
import { WorkingMemoryService } from "../../working-memory/working-memory.service";
import { routeAfterSupervisor } from "../edges/routing";
import { AgentStateSchema, type SupervisorTodo } from "../state/state.types";
import { createExtractTodoNode } from "./extract-todo.node";
import { createSupervisorNode } from "./plan-supervisor.node";

jest.mock("@repo/db", () => ({ prisma: {} }));
jest.mock("../../config/chat-model.factory", () => ({ createConfiguredChatModel: jest.fn() }));

const updatedTodos: SupervisorTodo[] = [
  { content: "Send the message", status: "completed", result: "success" },
  { content: "Return home", status: "in_progress" },
];
const config = { configurable: { thread_id: "todo-persistence-test" } };

function createMemory(writeFails: boolean) {
  let todos: SupervisorTodo[] = [
    { content: "Send the message", status: "in_progress" },
    { content: "Return home", status: "pending" },
  ];
  const database = {
    working_memory: { findUnique: async () => ({ todos }) },
    $executeRaw: async (_query: TemplateStringsArray, threadId: string, serialized: string) => {
      if (threadId !== config.configurable.thread_id) throw new Error("Unexpected thread");
      if (writeFails) throw new Error("Database unavailable");
      todos = JSON.parse(serialized);
    },
  };
  return new WorkingMemoryService(database as unknown as PrismaService);
}

async function runSupervisor(writeFails: boolean) {
  const memory = createMemory(writeFails);
  const model = new FakeToolCallingModel({
    toolCalls: [[{ name: "write_todos", args: { todos: updatedTodos }, id: "save-todos" }], [], []],
  });
  jest.mocked(createConfiguredChatModel).mockReturnValue(
    model as unknown as ReturnType<typeof createConfiguredChatModel>,
  );
  type Dependencies = Parameters<typeof createSupervisorNode>;
  const skills = { getSkillsForNode: async () => [] } as unknown as Dependencies[1];
  const supervisor = createSupervisorNode(
    { getModelConfig: async () => ({ systemPrompt: "Update the task plan." }) } as unknown as Dependencies[0],
    skills,
    new SupervisorTodosToolService(memory),
    { sendAgentEvent: () => true } as unknown as Dependencies[3],
    { getBalance: async () => ({ remaining: Infinity }) } as unknown as Dependencies[4],
    {} as Dependencies[5],
  );
  const dispatched: string[] = [];
  const graph = new StateGraph(AgentStateSchema)
    .addNode("supervisor", supervisor)
    .addNode("extract_todo", createExtractTodoNode(memory, skills))
    .addNode("summarizer", () => ({ finalSummary: "Stopped after planning failure" }))
    .addNode("gui_executor", state => {
      dispatched.push(state.executorInput!.instruction!);
      return {};
    })
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", routeAfterSupervisor, {
      extract_todo: "extract_todo", summarizer: "summarizer",
    })
    .addEdge("extract_todo", "gui_executor")
    .addEdge("gui_executor", END)
    .addEdge("summarizer", END)
    .compile();
  const result = await graph.invoke({
    userId: 1, taskId: 2, taskExecutionId: 3, userRegion: "CN",
    userInput: "Send a message and return home",
    executorInput: { instruction: "Send the message" },
    executorOutput: { task: "Send the message", success: true, notes: "Message sent" },
  }, config);
  return { result, dispatched, model, memory };
}

describe("Supervisor todo persistence", () => {
  beforeEach(() => {
    for (const method of ["log", "warn", "error", "debug"] as const) {
      jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it("rejects a completion update when the database write fails", async () => {
    const service = new SupervisorTodosToolService(createMemory(true));
    await expect(service.createWriteTodosTool().invoke({ todos: updatedTodos }, config))
      .rejects.toThrow("Database unavailable");
  });

  it("stops before dispatching the stale completed action after a write failure", async () => {
    const { result, dispatched, model } = await runSupervisor(true);
    expect(dispatched).toEqual([]);
    expect(result.supervisorError).toBe(true);
    // A storage error must escape the tool loop without asking the model to retry.
    expect(model.index).toBe(1);
  });

  it("dispatches the next step after the completion update is persisted", async () => {
    const { result, dispatched, memory } = await runSupervisor(false);
    expect(dispatched).toEqual(["Return home"]);
    expect(result.supervisorError).toBe(false);
    expect(await memory.getTodos(config.configurable.thread_id)).toEqual(updatedTodos);
  });
});
