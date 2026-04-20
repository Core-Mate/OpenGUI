> ## Documentation Index
> Fetch the complete documentation index at: https://docs.langchain.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Durable execution

**Durable execution** is a technique in which a process or workflow saves its progress at key points, allowing it to pause and later resume exactly where it left off. This is particularly useful in scenarios that require [human-in-the-loop](/oss/javascript/langgraph/interrupts), where users can inspect, validate, or modify the process before continuing, and in long-running tasks that might encounter interruptions or errors (e.g., calls to an LLM timing out). By preserving completed work, durable execution enables a process to resume without reprocessing previous steps -- even after a significant delay (e.g., a week later).

LangGraph's built-in [persistence](/oss/javascript/langgraph/persistence) layer provides durable execution for workflows, ensuring that the state of each execution step is saved to a durable store. This capability guarantees that if a workflow is interrupted -- whether by a system failure or for [human-in-the-loop](/oss/javascript/langgraph/interrupts) interactions -- it can be resumed from its last recorded state.

<Tip>
  If you are using LangGraph with a checkpointer, you already have durable execution enabled. You can pause and resume workflows at any point, even after interruptions or failures.
  To make the most of durable execution, ensure that your workflow is designed to be [deterministic](#determinism-and-consistent-replay) and [idempotent](#determinism-and-consistent-replay) and wrap any side effects or non-deterministic operations inside [tasks](/oss/javascript/langgraph/functional-api#task). You can use [tasks](/oss/javascript/langgraph/functional-api#task) from both the [StateGraph (Graph API)](/oss/javascript/langgraph/graph-api) and the [Functional API](/oss/javascript/langgraph/functional-api).
</Tip>

## Requirements

To leverage durable execution in LangGraph, you need to:

1. Enable [persistence](/oss/javascript/langgraph/persistence) in your workflow by specifying a [checkpointer](/oss/javascript/langgraph/persistence#checkpointer-libraries) that will save workflow progress.

2. Specify a [thread identifier](/oss/javascript/langgraph/persistence#threads) when executing a workflow. This will track the execution history for a particular instance of the workflow.

3. Wrap any non-deterministic operations (e.g., random number generation) or operations with side effects (e.g., file writes, API calls) inside [tasks](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.task.html) to ensure that when a workflow is resumed, these operations are not repeated for the particular run, and instead their results are retrieved from the persistence layer. For more information, see [Determinism and Consistent Replay](#determinism-and-consistent-replay).

## Determinism and consistent replay

When you resume a workflow run, the code does **NOT** resume from the **same line of code** where execution stopped; instead, it will identify an appropriate [starting point](#starting-points-for-resuming-workflows) from which to pick up where it left off. This means that the workflow will replay all steps from the [starting point](#starting-points-for-resuming-workflows) until it reaches the point where it was stopped.

As a result, when you are writing a workflow for durable execution, you must wrap any non-deterministic operations (e.g., random number generation) and any operations with side effects (e.g., file writes, API calls) inside [tasks](/oss/javascript/langgraph/functional-api#task) or [nodes](/oss/javascript/langgraph/graph-api#nodes).

To ensure that your workflow is deterministic and can be consistently replayed, follow these guidelines:

* **Avoid Repeating Work**: If a [node](/oss/javascript/langgraph/graph-api#nodes) contains multiple operations with side effects (e.g., logging, file writes, or network calls), wrap each operation in a separate **task**. This ensures that when the workflow is resumed, the operations are not repeated, and their results are retrieved from the persistence layer.
* **Encapsulate Non-Deterministic Operations:** Wrap any code that might yield non-deterministic results (e.g., random number generation) inside **tasks** or **nodes**. This ensures that, upon resumption, the workflow follows the exact recorded sequence of steps with the same outcomes.
* **Use Idempotent Operations**: When possible ensure that side effects (e.g., API calls, file writes) are idempotent. This means that if an operation is retried after a failure in the workflow, it will have the same effect as the first time it was executed. This is particularly important for operations that result in data writes. In the event that a **task** starts but fails to complete successfully, the workflow's resumption will re-run the **task**, relying on recorded outcomes to maintain consistency. Use idempotency keys or verify existing results to avoid unintended duplication, ensuring a smooth and predictable workflow execution.

For some examples of pitfalls to avoid, see the [Common Pitfalls](/oss/javascript/langgraph/functional-api#common-pitfalls) section in the functional API, which shows
how to structure your code using **tasks** to avoid these issues. The same principles apply to the [StateGraph (Graph API)](https://reference.langchain.com/javascript/classes/_langchain_langgraph.index.StateGraph.html).

## Durability modes

LangGraph supports three durability modes that allow you to balance performance and data consistency based on your application's requirements. A higher durability mode adds more overhead to the workflow execution. You can specify the durability mode when calling any graph execution method:

```typescript  theme={null}
await graph.stream(
  { input: "test" },
  { durability: "sync" }
)
```

The durability modes, from least to most durable, are as follows:

* `"exit"`: LangGraph persists changes only when graph execution exits either successfully, with an error, or due to a human in the loop interrupt. This provides the best performance for long-running graphs but means intermediate state is not saved, so you cannot recover from system failures (like process crashes) that occur mid-execution.
* `"async"`: LangGraph persists changes asynchronously while the next step executes. This provides good performance and durability, but there's a small risk that LangGraph does not write checkpoints if the process crashes during execution.
* `"sync"`: LangGraph persists changes synchronously before the next step starts. This ensures that LangGraph writes every checkpoint before continuing execution, providing high durability at the cost of some performance overhead.

## Using tasks in nodes

If a [node](/oss/javascript/langgraph/graph-api#nodes) contains multiple operations, you may find it easier to convert each operation into a **task** rather than refactor the operations into individual nodes.

<Tabs>
  <Tab title="Original">
    ```typescript  theme={null}
    import { StateGraph, StateSchema, GraphNode, START, END, MemorySaver } from "@langchain/langgraph";
    import { v4 as uuidv4 } from "uuid";
    import * as z from "zod";

    // Define a StateSchema to represent the state
    const State = new StateSchema({
      url: z.string(),
      result: z.string().optional(),
    });

    const callApi: GraphNode<typeof State> = async (state) => {
      const response = await fetch(state.url);  // [!code highlight]
      const text = await response.text();
      const result = text.slice(0, 100); // Side-effect
      return {
        result,
      };
    };

    // Create a StateGraph builder and add a node for the callApi function
    const builder = new StateGraph(State)
      .addNode("callApi", callApi)
      .addEdge(START, "callApi")
      .addEdge("callApi", END);

    // Specify a checkpointer
    const checkpointer = new MemorySaver();

    // Compile the graph with the checkpointer
    const graph = builder.compile({ checkpointer });

    // Define a config with a thread ID.
    const threadId = uuidv4();
    const config = { configurable: { thread_id: threadId } };

    // Invoke the graph
    await graph.invoke({ url: "https://www.example.com" }, config);
    ```
  </Tab>

  <Tab title="With task">
    ```typescript  theme={null}
    import { StateGraph, StateSchema, GraphNode, START, END, MemorySaver, task } from "@langchain/langgraph";
    import { v4 as uuidv4 } from "uuid";
    import * as z from "zod";

    // Define a StateSchema to represent the state
    const State = new StateSchema({
      urls: z.array(z.string()),
      results: z.array(z.string()).optional(),
    });

    const makeRequest = task("makeRequest", async (url: string) => {
      const response = await fetch(url);  // [!code highlight]
      const text = await response.text();
      return text.slice(0, 100);
    });

    const callApi: GraphNode<typeof State> = async (state) => {
      const requests = state.urls.map((url) => makeRequest(url));  // [!code highlight]
      const results = await Promise.all(requests);
      return {
        results,
      };
    };

    // Create a StateGraph builder and add a node for the callApi function
    const builder = new StateGraph(State)
      .addNode("callApi", callApi)
      .addEdge(START, "callApi")
      .addEdge("callApi", END);

    // Specify a checkpointer
    const checkpointer = new MemorySaver();

    // Compile the graph with the checkpointer
    const graph = builder.compile({ checkpointer });

    // Define a config with a thread ID.
    const threadId = uuidv4();
    const config = { configurable: { thread_id: threadId } };

    // Invoke the graph
    await graph.invoke({ urls: ["https://www.example.com"] }, config);
    ```
  </Tab>
</Tabs>

## Resuming workflows

Once you have enabled durable execution in your workflow, you can resume execution for the following scenarios:

* **Pausing and Resuming Workflows:** Use the [interrupt](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) function to pause a workflow at specific points and the [`Command`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.index.Command.html) primitive to resume it with updated state. See [**Interrupts**](/oss/javascript/langgraph/interrupts) for more details.
* **Recovering from Failures:** Automatically resume workflows from the last successful checkpoint after an exception (e.g., LLM provider outage). This involves executing the workflow with the same thread identifier by providing it with a `null` as the input value (see this [example](/oss/javascript/langgraph/use-functional-api#resuming-after-an-error) with the functional API).

## Starting points for resuming workflows

* If you're using a [StateGraph (Graph API)](/oss/javascript/langgraph/graph-api), the starting point is the beginning of the [**node**](/oss/javascript/langgraph/graph-api#nodes) where execution stopped.
* If you're making a subgraph call inside a node, the starting point will be the **parent** node that called the subgraph that was halted.
  Inside the subgraph, the starting point will be the specific [**node**](/oss/javascript/langgraph/graph-api#nodes) where execution stopped.
* If you're using the Functional API, the starting point is the beginning of the [**entrypoint**](/oss/javascript/langgraph/functional-api#entrypoint) where execution stopped.

***

<Callout icon="pen-to-square" iconType="regular">
  [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/durable-execution.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
</Callout>

<Tip icon="terminal" iconType="regular">
  [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
</Tip>
