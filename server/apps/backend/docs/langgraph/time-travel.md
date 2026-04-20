> ## Documentation Index
> Fetch the complete documentation index at: https://docs.langchain.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Use time-travel

When working with non-deterministic systems that make model-based decisions (e.g., agents powered by LLMs), it can be useful to examine their decision-making process in detail:

1. <Icon icon="lightbulb" size={16} /> **Understand reasoning**: Analyze the steps that led to a successful result.
2. <Icon icon="bug" size={16} /> **Debug mistakes**: Identify where and why errors occurred.
3. <Icon icon="magnifying-glass" size={16} /> **Explore alternatives**: Test different paths to uncover better solutions.

LangGraph provides time-travel functionality to support these use cases. Specifically, you can resume execution from a prior checkpoint — either replaying the same state or modifying it to explore alternatives. In all cases, resuming past execution produces a new fork in the history.

To use time-travel in LangGraph:

1. [Run the graph](#1-run-the-graph) with initial inputs using [`invoke`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.index.CompiledStateGraph.html#invoke) or [`stream`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.index.CompiledStateGraph.html#stream) methods.
2. [Identify a checkpoint in an existing thread](#2-identify-a-checkpoint): Use the [`getStateHistory`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.pregel.Pregel.html#getStateHistory) method to retrieve the execution history for a specific `thread_id` and locate the desired `checkpoint_id`.
   Alternatively, set a [breakpoint](/oss/javascript/langgraph/interrupts) before the node(s) where you want execution to pause. You can then find the most recent checkpoint recorded up to that breakpoint.
3. [Update the graph state (optional)](#3-update-the-state-optional): Use the [`updateState`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.pregel.Pregel.html#updateState) method to modify the graph's state at the checkpoint and resume execution from alternative state.
4. [Resume execution from the checkpoint](#4-resume-execution-from-the-checkpoint): Use the `invoke` or `stream` methods with an input of `null` and a configuration containing the appropriate `thread_id` and `checkpoint_id`.

## In a workflow

This example builds a simple LangGraph workflow that generates a joke topic and writes a joke using an LLM. It demonstrates how to run the graph, retrieve past execution checkpoints, optionally modify the state, and resume execution from a chosen checkpoint to explore alternate outcomes.

### Setup

To build this workflow in this example you need to set up the Anthropic LLM and install the required dependencies:

1. Install dependencies

<CodeGroup>
  ```bash npm theme={null}
  npm install @langchain/langgraph @langchain/core
  ```

  ```bash pnpm theme={null}
  pnpm add @langchain/langgraph @langchain/core
  ```

  ```bash yarn theme={null}
  yarn add @langchain/langgraph @langchain/core
  ```

  ```bash bun theme={null}
  bun add @langchain/langgraph @langchain/core
  ```
</CodeGroup>

2. Initialize the LLM:

```typescript  theme={null}
import { ChatAnthropic } from "@langchain/anthropic";

const llm = new ChatAnthropic({
  model: "claude-sonnet-4-5-20250929",
  apiKey: "<your_anthropic_key>"
});
```

<Tip>
  Sign up for [LangSmith](https://smith.langchain.com) to quickly spot issues and improve the performance of your LangGraph projects. LangSmith lets you use trace data to debug, test, and monitor your LLM apps built with LangGraph. You can also [fetch traces from LangSmith](/langsmith/export-traces#fetch-a-single-run-by-id) to replay and debug production issues locally.
</Tip>

3. Implement the workflow
   The implementation of the workflow is a simple graph with two nodes, one for generating a joke topic, another for writing the joke itself and a state to storing the intermediate values.

```typescript  theme={null}
import { v4 as uuidv4 } from "uuid";
import * as z from "zod";
import { StateGraph, StateSchema, GraphNode, START, END, MemorySaver } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";

const State = new StateSchema({
  topic: z.string().optional(),
  joke: z.string().optional(),
});

const model = new ChatAnthropic({
  model: "claude-sonnet-4-5-20250929",
  temperature: 0,
});

const generateTopic: GraphNode<typeof State> = async (state) => {
  // LLM call to generate a topic for the joke
  const msg = await model.invoke("Give me a funny topic for a joke");
  return { topic: msg.content };
};

const writeJoke: GraphNode<typeof State> = async (state) => {
  // LLM call to write a joke based on the topic
  const msg = await model.invoke(`Write a short joke about ${state.topic}`);
  return { joke: msg.content };
};

// Build workflow
const workflow = new StateGraph(State)
  // Add nodes
  .addNode("generateTopic", generateTopic)
  .addNode("writeJoke", writeJoke)
  // Add edges to connect nodes
  .addEdge(START, "generateTopic")
  .addEdge("generateTopic", "writeJoke")
  .addEdge("writeJoke", END);

// Compile
const checkpointer = new MemorySaver();
const graph = workflow.compile({ checkpointer });
```

### 1. Run the graph

To start the workflow, [`invoke`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.index.CompiledStateGraph.html#invoke) is called without any inputs. Note the `thread_id` to track this execution and retrieve its checkpoints later.

```typescript  theme={null}
const config = {
  configurable: {
    thread_id: uuidv4(),
  },
};

const state = await graph.invoke({}, config);

console.log(state.topic);
console.log();
console.log(state.joke);
```

**Output:**

```
How about "The Secret Life of Socks in the Dryer"? You know, exploring the mysterious phenomenon of how socks go into the laundry as pairs but come out as singles. Where do they go? Are they starting new lives elsewhere? Is there a sock paradise we don't know about? There's a lot of comedic potential in the everyday mystery that unites us all!

# The Secret Life of Socks in the Dryer

I finally discovered where all my missing socks go after the dryer. Turns out they're not missing at all—they've just eloped with someone else's socks from the laundromat to start new lives together.

My blue argyle is now living in Bermuda with a red polka dot, posting vacation photos on Sockstagram and sending me lint as alimony.
```

### 2. Identify a checkpoint

To continue from a previous point in the graphs run, use [`get_state_history`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.pregel.Pregel.html#getStateHistory) to retrieve all the states and select the one where you want to resume execution.

```typescript  theme={null}
// The states are returned in reverse chronological order.
const states = [];
for await (const state of graph.getStateHistory(config)) {
  states.push(state);
}

for (const state of states) {
  console.log(state.next);
  console.log(state.config.configurable?.checkpoint_id);
  console.log();
}
```

**Output:**

```
[]
1f02ac4a-ec9f-6524-8002-8f7b0bbeed0e

['writeJoke']
1f02ac4a-ce2a-6494-8001-cb2e2d651227

['generateTopic']
1f02ac4a-a4e0-630d-8000-b73c254ba748

['__start__']
1f02ac4a-a4dd-665e-bfff-e6c8c44315d9
```

```typescript  theme={null}
// This is the state before last (states are listed in chronological order)
const selectedState = states[1];
console.log(selectedState.next);
console.log(selectedState.values);
```

**Output:**

```
['writeJoke']
{'topic': 'How about "The Secret Life of Socks in the Dryer"? You know, exploring the mysterious phenomenon of how socks go into the laundry as pairs but come out as singles. Where do they go? Are they starting new lives elsewhere? Is there a sock paradise we don\\'t know about? There\\'s a lot of comedic potential in the everyday mystery that unites us all!'}
```

<a id="optional" />

### 3. Update the state (optional)

`updateState` will create a new checkpoint. The new checkpoint will be associated with the same thread, but a new checkpoint ID.

```typescript  theme={null}
const newConfig = await graph.updateState(selectedState.config, {
  topic: "chickens",
});
console.log(newConfig);
```

**Output:**

```
{'configurable': {'thread_id': 'c62e2e03-c27b-4cb6-8cea-ea9bfedae006', 'checkpoint_ns': '', 'checkpoint_id': '1f02ac4a-ecee-600b-8002-a1d21df32e4c'}}
```

### 4. Resume execution from the checkpoint

For resumings execution from the selected checkpoint, call [`invoke`](https://reference.langchain.com/javascript/classes/_langchain_langgraph.index.CompiledStateGraph.html#invoke) with the config that points to the new checkpoint.

```typescript  theme={null}
await graph.invoke(null, newConfig);
```

**Output:**

```typescript  theme={null}
{
  'topic': 'chickens',
  'joke': 'Why did the chicken join a band?\n\nBecause it had excellent drumsticks!'
}
```

***

<Callout icon="pen-to-square" iconType="regular">
  [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/use-time-travel.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
</Callout>

<Tip icon="terminal" iconType="regular">
  [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
</Tip>
