# Streaming

LangGraph implements a streaming system to surface real-time updates. Streaming is crucial for enhancing the responsiveness of applications built on LLMs. By displaying output progressively, even before a complete response is ready, streaming significantly improves user experience (UX), particularly when dealing with the latency of LLMs.

What's possible with LangGraph streaming:

* <Icon icon="share-nodes" size={16} /> [**Stream graph state**](#stream-graph-state) — get state updates / values with `updates` and `values` modes.
* <Icon icon="square-poll-horizontal" size={16} /> [**Stream subgraph outputs**](#stream-subgraph-outputs) — include outputs from both the parent graph and any nested subgraphs.
* <Icon icon="square-binary" size={16} /> [**Stream LLM tokens**](#messages) — capture token streams from anywhere: inside nodes, subgraphs, or tools.
* <Icon icon="table" size={16} /> [**Stream custom data**](#stream-custom-data) — send custom updates or progress signals directly from tool functions.
* <Icon icon="layer-plus" size={16} /> [**Use multiple streaming modes**](#stream-multiple-modes) — choose from `values` (full state), `updates` (state deltas), `messages` (LLM tokens + metadata), `custom` (arbitrary user data), or `debug` (detailed traces).

## Supported stream modes

Pass one or more of the following stream modes as a list to the [`stream`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.index.CompiledStateGraph.html#stream) method:

| Mode       | Description                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `values`   | Streams the full value of the state after each step of the graph.                                                                                                                   |
| `updates`  | Streams the updates to the state after each step of the graph. If multiple updates are made in the same step (e.g., multiple nodes are run), those updates are streamed separately. |
| `custom`   | Streams custom data from inside your graph nodes.                                                                                                                                   |
| `messages` | Streams 2-tuples (LLM token, metadata) from any graph nodes where an LLM is invoked.                                                                                                |
| `debug`    | Streams as much information as possible throughout the execution of the graph.                                                                                                      |

## Basic usage example

LangGraph graphs expose the [`stream`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.pregel.Pregel.html#stream) method to yield streamed outputs as iterators.

```typescript  theme={null}
for await (const chunk of await graph.stream(inputs, {
  streamMode: "updates",
})) {
  console.log(chunk);
}
```

<Accordion title="Extended example: streaming updates">
  ```typescript  theme={null}
  import { StateGraph, START, END } from "@langchain/langgraph";
  import * as z from "zod";

const State = z.object({
topic: z.string(),
joke: z.string(),
});

const graph = new StateGraph(State)
.addNode("refineTopic", (state) => {
return { topic: state.topic + " and cats" };
})
.addNode("generateJoke", (state) => {
return { joke: `This is a joke about ${state.topic}` };
})
.addEdge(START, "refineTopic")
.addEdge("refineTopic", "generateJoke")
.addEdge("generateJoke", END)
.compile();

for await (const chunk of await graph.stream(
{ topic: "ice cream" },
// Set streamMode: "updates" to stream only the updates to the graph state after each node
// Other stream modes are also available. See supported stream modes for details
{ streamMode: "updates" }
)) {
console.log(chunk);
}
  ```

  ```python  theme={null}
  {'refineTopic': {'topic': 'ice cream and cats'}}
  {'generateJoke': {'joke': 'This is a joke about ice cream and cats'}}
  ```
</Accordion>

## Stream multiple modes

You can pass an array as the `streamMode` parameter to stream multiple modes at once.

The streamed outputs will be tuples of `[mode, chunk]` where `mode` is the name of the stream mode and `chunk` is the data streamed by that mode.

```typescript  theme={null}
for await (const [mode, chunk] of await graph.stream(inputs, {
  streamMode: ["updates", "custom"],
})) {
  console.log(chunk);
}
```

## Stream graph state

Use the stream modes `updates` and `values` to stream the state of the graph as it executes.

* `updates` streams the **updates** to the state after each step of the graph.
* `values` streams the **full value** of the state after each step of the graph.

```typescript  theme={null}
import { StateGraph, START, END } from "@langchain/langgraph";
import * as z from "zod";

const State = z.object({
  topic: z.string(),
  joke: z.string(),
});

const graph = new StateGraph(State)
  .addNode("refineTopic", (state) => {
    return { topic: state.topic + " and cats" };
  })
  .addNode("generateJoke", (state) => {
    return { joke: `This is a joke about ${state.topic}` };
  })
  .addEdge(START, "refineTopic")
  .addEdge("refineTopic", "generateJoke")
  .addEdge("generateJoke", END)
  .compile();
```

<Tabs>
  <Tab title="updates">
    Use this to stream only the **state updates** returned by the nodes after each step. The streamed outputs include the name of the node as well as the update.

    ```typescript  theme={null}
    for await (const chunk of await graph.stream(
      { topic: "ice cream" },
      { streamMode: "updates" }
    )) {
      console.log(chunk);
    }
    ```
  </Tab>

  <Tab title="values">
    Use this to stream the **full state** of the graph after each step.

    ```typescript  theme={null}
    for await (const chunk of await graph.stream(
      { topic: "ice cream" },
      { streamMode: "values" }
    )) {
      console.log(chunk);
    }
    ```
  </Tab>
</Tabs>

## Stream subgraph outputs

To include outputs from [subgraphs](/oss/javascript/langgraph/use-subgraphs) in the streamed outputs, you can set `subgraphs: true` in the `.stream()` method of the parent graph. This will stream outputs from both the parent graph and any subgraphs.

The outputs will be streamed as tuples `[namespace, data]`, where `namespace` is a tuple with the path to the node where a subgraph is invoked, e.g. `["parent_node:<task_id>", "child_node:<task_id>"]`.

```typescript  theme={null}
for await (const chunk of await graph.stream(
  { foo: "foo" },
  {
    // Set subgraphs: true to stream outputs from subgraphs
    subgraphs: true,
    streamMode: "updates",
  }
)) {
  console.log(chunk);
}
```

<Accordion title="Extended example: streaming from subgraphs">
  ```typescript  theme={null}
  import { StateGraph, START } from "@langchain/langgraph";
  import * as z from "zod";

// Define subgraph
const SubgraphState = z.object({
foo: z.string(), // note that this key is shared with the parent graph state
bar: z.string(),
});

const subgraphBuilder = new StateGraph(SubgraphState)
.addNode("subgraphNode1", (state) => {
return { bar: "bar" };
})
.addNode("subgraphNode2", (state) => {
return { foo: state.foo + state.bar };
})
.addEdge(START, "subgraphNode1")
.addEdge("subgraphNode1", "subgraphNode2");
const subgraph = subgraphBuilder.compile();

// Define parent graph
const ParentState = z.object({
foo: z.string(),
});

const builder = new StateGraph(ParentState)
.addNode("node1", (state) => {
return { foo: "hi! " + state.foo };
})
.addNode("node2", subgraph)
.addEdge(START, "node1")
.addEdge("node1", "node2");
const graph = builder.compile();

for await (const chunk of await graph.stream(
{ foo: "foo" },
{
streamMode: "updates",
// Set subgraphs: true to stream outputs from subgraphs
subgraphs: true,
}
)) {
console.log(chunk);
}
  ```

  ```
[[], {'node1': {'foo': 'hi! foo'}}]
[['node2:dfddc4ba-c3c5-6887-5012-a243b5b377c2'], {'subgraphNode1': {'bar': 'bar'}}]
[['node2:dfddc4ba-c3c5-6887-5012-a243b5b377c2'], {'subgraphNode2': {'foo': 'hi! foobar'}}]
[[], {'node2': {'foo': 'hi! foobar'}}]
  ```

  **Note** that we are receiving not just the node updates, but we also the namespaces which tell us what graph (or subgraph) we are streaming from.
</Accordion>

<a id="debug" />

### Debugging

Use the `debug` streaming mode to stream as much information as possible throughout the execution of the graph. The streamed outputs include the name of the node as well as the full state.

```typescript  theme={null}
for await (const chunk of await graph.stream(
  { topic: "ice cream" },
  { streamMode: "debug" }
)) {
  console.log(chunk);
}
```

<a id="messages" />

## LLM tokens

Use the `messages` streaming mode to stream Large Language Model (LLM) outputs **token by token** from any part of your graph, including nodes, tools, subgraphs, or tasks.

The streamed output from [`messages` mode](#supported-stream-modes) is a tuple `[message_chunk, metadata]` where:

* `message_chunk`: the token or message segment from the LLM.
* `metadata`: a dictionary containing details about the graph node and LLM invocation.

> If your LLM is not available as a LangChain integration, you can stream its outputs using `custom` mode instead. See [use with any LLM](#use-with-any-llm) for details.

```typescript  theme={null}
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, START } from "@langchain/langgraph";
import * as z from "zod";

const MyState = z.object({
  topic: z.string(),
  joke: z.string().default(""),
});

const model = new ChatOpenAI({ model: "gpt-4o-mini" });

const callModel = async (state: z.infer<typeof MyState>) => {
  // Call the LLM to generate a joke about a topic
  // Note that message events are emitted even when the LLM is run using .invoke rather than .stream
  const modelResponse = await model.invoke([
    { role: "user", content: `Generate a joke about ${state.topic}` },
  ]);
  return { joke: modelResponse.content };
};

const graph = new StateGraph(MyState)
  .addNode("callModel", callModel)
  .addEdge(START, "callModel")
  .compile();

// The "messages" stream mode returns an iterator of tuples [messageChunk, metadata]
// where messageChunk is the token streamed by the LLM and metadata is a dictionary
// with information about the graph node where the LLM was called and other information
for await (const [messageChunk, metadata] of await graph.stream(
  { topic: "ice cream" },
  { streamMode: "messages" }
)) {
  if (messageChunk.content) {
    console.log(messageChunk.content + "|");
  }
}
```

#### Filter by LLM invocation

You can associate `tags` with LLM invocations to filter the streamed tokens by LLM invocation.

```typescript  theme={null}
import { ChatOpenAI } from "@langchain/openai";

// model1 is tagged with "joke"
const model1 = new ChatOpenAI({
  model: "gpt-4o-mini",
  tags: ['joke']
});
// model2 is tagged with "poem"
const model2 = new ChatOpenAI({
  model: "gpt-4o-mini",
  tags: ['poem']
});

const graph = // ... define a graph that uses these LLMs

// The streamMode is set to "messages" to stream LLM tokens
// The metadata contains information about the LLM invocation, including the tags
for await (const [msg, metadata] of await graph.stream(
  { topic: "cats" },
  { streamMode: "messages" }
)) {
  // Filter the streamed tokens by the tags field in the metadata to only include
  // the tokens from the LLM invocation with the "joke" tag
  if (metadata.tags?.includes("joke")) {
    console.log(msg.content + "|");
  }
}
```

<Accordion title="Extended example: filtering by tags">
  ```typescript  theme={null}
  import { ChatOpenAI } from "@langchain/openai";
  import { StateGraph, START } from "@langchain/langgraph";
  import * as z from "zod";

// The jokeModel is tagged with "joke"
const jokeModel = new ChatOpenAI({
model: "gpt-4o-mini",
tags: ["joke"]
});
// The poemModel is tagged with "poem"
const poemModel = new ChatOpenAI({
model: "gpt-4o-mini",
tags: ["poem"]
});

const State = z.object({
topic: z.string(),
joke: z.string(),
poem: z.string(),
});

const graph = new StateGraph(State)
.addNode("callModel", async (state) => {
const topic = state.topic;
console.log("Writing joke...");

      const jokeResponse = await jokeModel.invoke([
        { role: "user", content: `Write a joke about ${topic}` }
      ]);

      console.log("\n\nWriting poem...");
      const poemResponse = await poemModel.invoke([
        { role: "user", content: `Write a short poem about ${topic}` }
      ]);

      return {
        joke: jokeResponse.content,
        poem: poemResponse.content
      };
    })
    .addEdge(START, "callModel")
    .compile();

// The streamMode is set to "messages" to stream LLM tokens
// The metadata contains information about the LLM invocation, including the tags
for await (const [msg, metadata] of await graph.stream(
{ topic: "cats" },
{ streamMode: "messages" }
)) {
// Filter the streamed tokens by the tags field in the metadata to only include
// the tokens from the LLM invocation with the "joke" tag
if (metadata.tags?.includes("joke")) {
console.log(msg.content + "|");
}
}
  ```
</Accordion>

#### Filter by node

To stream tokens only from specific nodes, use `stream_mode="messages"` and filter the outputs by the `langgraph_node` field in the streamed metadata:

```typescript  theme={null}
// The "messages" stream mode returns a tuple of [messageChunk, metadata]
// where messageChunk is the token streamed by the LLM and metadata is a dictionary
// with information about the graph node where the LLM was called and other information
for await (const [msg, metadata] of await graph.stream(
  inputs,
  { streamMode: "messages" }
)) {
  // Filter the streamed tokens by the langgraph_node field in the metadata
  // to only include the tokens from the specified node
  if (msg.content && metadata.langgraph_node === "some_node_name") {
    // ...
  }
}
```

<Accordion title="Extended example: streaming LLM tokens from specific nodes">
  ```typescript  theme={null}
  import { ChatOpenAI } from "@langchain/openai";
  import { StateGraph, START } from "@langchain/langgraph";
  import * as z from "zod";

const model = new ChatOpenAI({ model: "gpt-4o-mini" });

const State = z.object({
topic: z.string(),
joke: z.string(),
poem: z.string(),
});

const graph = new StateGraph(State)
.addNode("writeJoke", async (state) => {
const topic = state.topic;
const jokeResponse = await model.invoke([
{ role: "user", content: `Write a joke about ${topic}` }
]);
return { joke: jokeResponse.content };
})
.addNode("writePoem", async (state) => {
const topic = state.topic;
const poemResponse = await model.invoke([
{ role: "user", content: `Write a short poem about ${topic}` }
]);
return { poem: poemResponse.content };
})
// write both the joke and the poem concurrently
.addEdge(START, "writeJoke")
.addEdge(START, "writePoem")
.compile();

// The "messages" stream mode returns a tuple of [messageChunk, metadata]
// where messageChunk is the token streamed by the LLM and metadata is a dictionary
// with information about the graph node where the LLM was called and other information
for await (const [msg, metadata] of await graph.stream(
{ topic: "cats" },
{ streamMode: "messages" }
)) {
// Filter the streamed tokens by the langgraph_node field in the metadata
// to only include the tokens from the writePoem node
if (msg.content && metadata.langgraph_node === "writePoem") {
console.log(msg.content + "|");
}
}
  ```
</Accordion>

## Stream custom data

To send **custom user-defined data** from inside a LangGraph node or tool, follow these steps:

1. Use the `writer` parameter from the `LangGraphRunnableConfig` to emit custom data.
2. Set `streamMode: "custom"` when calling `.stream()` to get the custom data in the stream. You can combine multiple modes (e.g., `["updates", "custom"]`), but at least one must be `"custom"`.

<Tabs>
  <Tab title="node">
    ```typescript  theme={null}
    import { StateGraph, START, LangGraphRunnableConfig } from "@langchain/langgraph";
    import * as z from "zod";

    const State = z.object({
      query: z.string(),
      answer: z.string(),
    });

    const graph = new StateGraph(State)
      .addNode("node", async (state, config) => {
        // Use the writer to emit a custom key-value pair (e.g., progress update)
        config.writer({ custom_key: "Generating custom data inside node" });
        return { answer: "some data" };
      })
      .addEdge(START, "node")
      .compile();

    const inputs = { query: "example" };

    // Set streamMode: "custom" to receive the custom data in the stream
    for await (const chunk of await graph.stream(inputs, { streamMode: "custom" })) {
      console.log(chunk);
    }
    ```
  </Tab>

  <Tab title="tool">
    ```typescript  theme={null}
    import { tool } from "@langchain/core/tools";
    import { LangGraphRunnableConfig } from "@langchain/langgraph";
    import * as z from "zod";

    const queryDatabase = tool(
      async (input, config: LangGraphRunnableConfig) => {
        // Use the writer to emit a custom key-value pair (e.g., progress update)
        config.writer({ data: "Retrieved 0/100 records", type: "progress" });
        // perform query
        // Emit another custom key-value pair
        config.writer({ data: "Retrieved 100/100 records", type: "progress" });
        return "some-answer";
      },
      {
        name: "query_database",
        description: "Query the database.",
        schema: z.object({
          query: z.string().describe("The query to execute."),
        }),
      }
    );

    const graph = // ... define a graph that uses this tool

    // Set streamMode: "custom" to receive the custom data in the stream
    for await (const chunk of await graph.stream(inputs, { streamMode: "custom" })) {
      console.log(chunk);
    }
    ```
  </Tab>
</Tabs>

## Use with any LLM

You can use `streamMode: "custom"` to stream data from **any LLM API** — even if that API does **not** implement the LangChain chat model interface.

This lets you integrate raw LLM clients or external services that provide their own streaming interfaces, making LangGraph highly flexible for custom setups.

```typescript  theme={null}
import { LangGraphRunnableConfig } from "@langchain/langgraph";

const callArbitraryModel = async (
  state: any,
  config: LangGraphRunnableConfig
) => {
  // Example node that calls an arbitrary model and streams the output
  // Assume you have a streaming client that yields chunks
  // Generate LLM tokens using your custom streaming client
  for await (const chunk of yourCustomStreamingClient(state.topic)) {
    // Use the writer to send custom data to the stream
    config.writer({ custom_llm_chunk: chunk });
  }
  return { result: "completed" };
};

const graph = new StateGraph(State)
  .addNode("callArbitraryModel", callArbitraryModel)
  // Add other nodes and edges as needed
  .compile();

// Set streamMode: "custom" to receive the custom data in the stream
for await (const chunk of await graph.stream(
  { topic: "cats" },
  { streamMode: "custom" }
)) {
  // The chunk will contain the custom data streamed from the llm
  console.log(chunk);
}
```

<Accordion title="Extended example: streaming arbitrary chat model">
  ```typescript  theme={null}
  import { StateGraph, START, MessagesZodMeta, LangGraphRunnableConfig } from "@langchain/langgraph";
  import { BaseMessage } from "@langchain/core/messages";
  import { registry } from "@langchain/langgraph/zod";
  import * as z from "zod";
  import OpenAI from "openai";

const openaiClient = new OpenAI();
const modelName = "gpt-4o-mini";

async function* streamTokens(modelName: string, messages: any[]) {
const response = await openaiClient.chat.completions.create({
messages,
model: modelName,
stream: true,
});

    let role: string | null = null;
    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.role) {
        role = delta.role;
      }

      if (delta?.content) {
        yield { role, content: delta.content };
      }
    }
}

// this is our tool
const getItems = tool(
async (input, config: LangGraphRunnableConfig) => {
let response = "";
for await (const msgChunk of streamTokens(
modelName,
[
{
role: "user",
content: `Can you tell me what kind of items i might find in the following place: '${input.place}'. List at least 3 such items separating them by a comma. And include a brief description of each item.`,
},
]
)) {
response += msgChunk.content;
config.writer?.(msgChunk);
}
return response;
},
{
name: "get_items",
description: "Use this tool to list items one might find in a place you're asked about.",
schema: z.object({
place: z.string().describe("The place to look up items for."),
}),
}
);

const State = z.object({
messages: z
.array(z.custom<BaseMessage>())
.register(registry, MessagesZodMeta),
});

const graph = new StateGraph(State)
// this is the tool-calling graph node
.addNode("callTool", async (state) => {
const aiMessage = state.messages.at(-1);
const toolCall = aiMessage.tool_calls?.at(-1);

      const functionName = toolCall?.function?.name;
      if (functionName !== "get_items") {
        throw new Error(`Tool ${functionName} not supported`);
      }

      const functionArguments = toolCall?.function?.arguments;
      const args = JSON.parse(functionArguments);

      const functionResponse = await getItems.invoke(args);
      const toolMessage = {
        tool_call_id: toolCall.id,
        role: "tool",
        name: functionName,
        content: functionResponse,
      };
      return { messages: [toolMessage] };
    })
    .addEdge(START, "callTool")
    .compile();
  ```

  Let's invoke the graph with an [`AIMessage`](https://reference.langchain.com/javascript/classes/_langchain_core.messages.AIMessage.html) that includes a tool call:

  ```typescript  theme={null}
  const inputs = {
    messages: [
      {
        content: null,
        role: "assistant",
        tool_calls: [
          {
            id: "1",
            function: {
              arguments: '{"place":"bedroom"}',
              name: "get_items",
            },
            type: "function",
          }
        ],
      }
    ]
  };

  for await (const chunk of await graph.stream(
    inputs,
    { streamMode: "custom" }
  )) {
    console.log(chunk.content + "|");
  }
  ```
</Accordion>

## Disable streaming for specific chat models

If your application mixes models that support streaming with those that do not, you may need to explicitly disable streaming for
models that do not support it.

Set `streaming: false` when initializing the model.

```typescript  theme={null}
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "o1-preview",
  // Set streaming: false to disable streaming for the chat model
  streaming: false,
});
```

<Note>
  Not all chat model integrations support the `streaming` parameter. If your model doesn't support it, use `disableStreaming: true` instead. This parameter is available on all chat models via the base class.
</Note>

***

<Callout icon="pen-to-square" iconType="regular">
  [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/streaming.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
</Callout>

<Tip icon="terminal" iconType="regular">
  [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
</Tip>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.langchain.com/llms.txt