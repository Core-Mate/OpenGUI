> ## Documentation Index
> Fetch the complete documentation index at: https://docs.langchain.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Long-term memory

## Overview

LangChain agents use [LangGraph persistence](/oss/javascript/langgraph/persistence#memory-store) to enable long-term memory. This is a more advanced topic and requires knowledge of LangGraph to use.

## Memory storage

LangGraph stores long-term memories as JSON documents in a [store](/oss/javascript/langgraph/persistence#memory-store).

Each memory is organized under a custom `namespace` (similar to a folder) and a distinct `key` (like a file name). Namespaces often include user or org IDs or other labels that makes it easier to organize information.

This structure enables hierarchical organization of memories. Cross-namespace searching is then supported through content filters.

```typescript  theme={null}
import { InMemoryStore } from "@langchain/langgraph";

const embed = (texts: string[]): number[][] => {
    // Replace with an actual embedding function or LangChain embeddings object
    return texts.map(() => [1.0, 2.0]);
};

// InMemoryStore saves data to an in-memory dictionary. Use a DB-backed store in production use.
const store = new InMemoryStore({ index: { embed, dims: 2 } }); // [!code highlight]
const userId = "my-user";
const applicationContext = "chitchat";
const namespace = [userId, applicationContext]; // [!code highlight]

await store.put( // [!code highlight]
    namespace,
    "a-memory",
    {
        rules: [
            "User likes short, direct language",
            "User only speaks English & TypeScript",
        ],
        "my-key": "my-value",
    }
);

// get the "memory" by ID
const item = await store.get(namespace, "a-memory"); // [!code highlight]

// search for "memories" within this namespace, filtering on content equivalence, sorted by vector similarity
const items = await store.search( // [!code highlight]
    namespace,
    {
        filter: { "my-key": "my-value" },
        query: "language preferences"
    }
);
```

For more information about the memory store, see the [Persistence](/oss/javascript/langgraph/persistence#memory-store) guide.

## Read long-term memory in tools

```typescript A tool the agent can use to look up user information theme={null}
import * as z from "zod";
import { createAgent, tool, type ToolRuntime } from "langchain";
import { InMemoryStore } from "@langchain/langgraph";

// InMemoryStore saves data to an in-memory dictionary. Use a DB-backed store in production.
const store = new InMemoryStore(); // [!code highlight]
const contextSchema = z.object({
  userId: z.string(),
});

// Write sample data to the store using the put method
await store.put( // [!code highlight]
  ["users"], // Namespace to group related data together (users namespace for user data)
  "user_123", // Key within the namespace (user ID as key)
  {
    name: "John Smith",
    language: "English",
  } // Data to store for the given user
);

const getUserInfo = tool(
  // Look up user info.
  async (_, runtime: ToolRuntime<unknown, z.infer<typeof contextSchema>>) => {
    // Access the store - same as that provided to `createAgent`
    const userId = runtime.context.userId;
    if (!userId) {
      throw new Error("userId is required");
    }
    // Retrieve data from store - returns StoreValue object with value and metadata
    const userInfo = await runtime.store.get(["users"], userId);
    return userInfo?.value ? JSON.stringify(userInfo.value) : "Unknown user";
  },
  {
    name: "getUserInfo",
    description: "Look up user info by userId from the store.",
    schema: z.object({}),
  }
);

const agent = createAgent({
  model: "gpt-4.1-mini",
  tools: [getUserInfo],
  contextSchema,
  // Pass store to agent - enables agent to access store when running tools
  store, // [!code highlight]
});

// Run the agent
const result = await agent.invoke(
  { messages: [{ role: "user", content: "look up user information" }] },
  { context: { userId: "user_123" } } // [!code highlight]
);

console.log(result.messages.at(-1)?.content);

/**
 * Outputs:
 * User Information:
 * - Name: John Smith
 * - Language: English
 */
```

<a id="write-long-term" />

## Write long-term memory from tools

```typescript Example of a tool that updates user information theme={null}
import * as z from "zod";
import { tool, createAgent, type ToolRuntime } from "langchain";
import { InMemoryStore } from "@langchain/langgraph";

// InMemoryStore saves data to an in-memory dictionary. Use a DB-backed store in production.
const store = new InMemoryStore(); // [!code highlight]

const contextSchema = z.object({
  userId: z.string(),
});

// Schema defines the structure of user information for the LLM
const UserInfo = z.object({
  name: z.string(),
});

// Tool that allows agent to update user information (useful for chat applications)
const saveUserInfo = tool(
  async (
    userInfo: z.infer<typeof UserInfo>,
    runtime: ToolRuntime<unknown, z.infer<typeof contextSchema>>
  ) => {
    const userId = runtime.context.userId;
    if (!userId) {
      throw new Error("userId is required");
    }
    // Store data in the store (namespace, key, data)
    await runtime.store.put(["users"], userId, userInfo);
    return "Successfully saved user info.";
  },
  {
    name: "save_user_info",
    description: "Save user info",
    schema: UserInfo,
  }
);

const agent = createAgent({
  model: "gpt-4.1-mini",
  tools: [saveUserInfo],
  contextSchema,
  store, // [!code highlight]
});

// Run the agent
await agent.invoke(
  { messages: [{ role: "user", content: "My name is John Smith" }] },
  // userId passed in context to identify whose information is being updated
  { context: { userId: "user_123" } } // [!code highlight]
);

// You can access the store directly to get the value
const result = await store.get(["users"], "user_123");
console.log(result?.value); // Output: { name: "John Smith" }

```

***

<Callout icon="pen-to-square" iconType="regular">
  [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langchain/long-term-memory.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
</Callout>

<Tip icon="terminal" iconType="regular">
  [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
</Tip>
