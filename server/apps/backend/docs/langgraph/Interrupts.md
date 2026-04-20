# Interrupts

Interrupts allow you to pause graph execution at specific points and wait for external input before continuing. This enables human-in-the-loop patterns where you need external input to proceed. When an interrupt is triggered, LangGraph saves the graph state using its [persistence](/oss/javascript/langgraph/persistence) layer and waits indefinitely until you resume execution.

Interrupts work by calling the `interrupt()` function at any point in your graph nodes. The function accepts any JSON-serializable value which is surfaced to the caller. When you're ready to continue, you resume execution by re-invoking the graph using `Command`, which then becomes the return value of the `interrupt()` call from inside the node.

Unlike static breakpoints (which pause before or after specific nodes), interrupts are **dynamic**—they can be placed anywhere in your code and can be conditional based on your application logic.

* **Checkpointing keeps your place:** the checkpointer writes the exact graph state so you can resume later, even when in an error state.
* **`thread_id` is your pointer:** use `{ configurable: { thread_id: ... } }` as options to the `invoke` method to tell the checkpointer which state to load.
* **Interrupt payloads surface as `__interrupt__`:** the values you pass to `interrupt()` return to the caller in the `__interrupt__` field so you know what the graph is waiting on.

The `thread_id` you choose is effectively your persistent cursor. Reusing it resumes the same checkpoint; using a new value starts a brand-new thread with an empty state.

## Pause using `interrupt`

The [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) function pauses graph execution and returns a value to the caller. When you call [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) within a node, LangGraph saves the current graph state and waits for you to resume execution with input.

To use [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html), you need:

1. A **checkpointer** to persist the graph state (use a durable checkpointer in production)
2. A **thread ID** in your config so the runtime knows which state to resume from
3. To call `interrupt()` where you want to pause (payload must be JSON-serializable)

```typescript  theme={null}
import { interrupt } from "@langchain/langgraph";

async function approvalNode(state: State) {
    // Pause and ask for approval
    const approved = interrupt("Do you approve this action?");

    // Command({ resume: ... }) provides the value returned into this variable
    return { approved };
}
```

When you call [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html), here's what happens:

1. **Graph execution gets suspended** at the exact point where [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) is called
2. **State is saved** using the checkpointer so execution can be resumed later, In production, this should be a persistent checkpointer (e.g. backed by a database)
3. **Value is returned** to the caller under `__interrupt__`; it can be any JSON-serializable value (string, object, array, etc.)
4. **Graph waits indefinitely** until you resume execution with a response
5. **Response is passed back** into the node when you resume, becoming the return value of the `interrupt()` call

## Resuming interrupts

After an interrupt pauses execution, you resume the graph by invoking it again with a `Command` that contains the resume value. The resume value is passed back to the `interrupt` call, allowing the node to continue execution with the external input.

```typescript  theme={null}
import { Command } from "@langchain/langgraph";

// Initial run - hits the interrupt and pauses
// thread_id is the durable pointer back to the saved checkpoint
const config = { configurable: { thread_id: "thread-1" } };
const result = await graph.invoke({ input: "data" }, config);

// Check what was interrupted
// __interrupt__ mirrors every payload you passed to interrupt()
console.log(result.__interrupt__);
// [{ value: 'Do you approve this action?', ... }]

// Resume with the human's response
// Command({ resume }) returns that value from interrupt() in the node
await graph.invoke(new Command({ resume: true }), config);
```

**Key points about resuming:**

* You must use the **same thread ID** when resuming that was used when the interrupt occurred
* The value passed to `Command(resume=...)` becomes the return value of the [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) call
* The node restarts from the beginning of the node where the [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) was called when resumed, so any code before the [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) runs again
* You can pass any JSON-serializable value as the resume value

## Common patterns

The key thing that interrupts unlock is the ability to pause execution and wait for external input. This is useful for a variety of use cases, including:

* <Icon icon="check-circle" /> [Approval workflows](#approve-or-reject): Pause before executing critical actions (API calls, database changes, financial transactions)
* <Icon icon="pencil" /> [Review and edit](#review-and-edit-state): Let humans review and modify LLM outputs or tool calls before continuing
* <Icon icon="wrench" /> [Interrupting tool calls](#interrupts-in-tools): Pause before executing tool calls to review and edit the tool call before execution
* <Icon icon="shield-check" /> [Validating human input](#validating-human-input): Pause before proceeding to the next step to validate human input

### Approve or reject

One of the most common uses of interrupts is to pause before a critical action and ask for approval. For example, you might want to ask a human to approve an API call, a database change, or any other important decision.

```typescript  theme={null}
import { interrupt, Command } from "@langchain/langgraph";

function approvalNode(state: State): Command {
  // Pause execution; payload surfaces in result.__interrupt__
  const isApproved = interrupt({
    question: "Do you want to proceed?",
    details: state.actionDetails
  });

  // Route based on the response
  if (isApproved) {
    return new Command({ goto: "proceed" }); // Runs after the resume payload is provided
  } else {
    return new Command({ goto: "cancel" });
  }
}
```

When you resume the graph, pass `true` to approve or `false` to reject:

```typescript  theme={null}
// To approve
await graph.invoke(new Command({ resume: true }), config);

// To reject
await graph.invoke(new Command({ resume: false }), config);
```

<Accordion title="Full example">
  ```typescript  theme={null}
  import {
    Command,
    MemorySaver,
    START,
    END,
    StateGraph,
    interrupt,
  } from "@langchain/langgraph";
  import * as z from "zod";

const State = z.object({
actionDetails: z.string(),
status: z.enum(["pending", "approved", "rejected"]).nullable(),
});

const graphBuilder = new StateGraph(State)
.addNode("approval", async (state) => {
// Expose details so the caller can render them in a UI
const decision = interrupt({
question: "Approve this action?",
details: state.actionDetails,
});
return new Command({ goto: decision ? "proceed" : "cancel" });
}, { ends: ['proceed', 'cancel'] })
.addNode("proceed", () => ({ status: "approved" }))
.addNode("cancel", () => ({ status: "rejected" }))
.addEdge(START, "approval")
.addEdge("proceed", END)
.addEdge("cancel", END);

// Use a more durable checkpointer in production
const checkpointer = new MemorySaver();
const graph = graphBuilder.compile({ checkpointer });

const config = { configurable: { thread_id: "approval-123" } };
const initial = await graph.invoke(
{ actionDetails: "Transfer $500", status: "pending" },
config,
);
console.log(initial.__interrupt__);
// [{ value: { question: ..., details: ... } }]

// Resume with the decision; true routes to proceed, false to cancel
const resumed = await graph.invoke(new Command({ resume: true }), config);
console.log(resumed.status); // -> "approved"
  ```
</Accordion>

### Review and edit state

Sometimes you want to let a human review and edit part of the graph state before continuing. This is useful for correcting LLMs, adding missing information, or making adjustments.

```typescript  theme={null}
import { interrupt } from "@langchain/langgraph";

function reviewNode(state: State) {
  // Pause and show the current content for review (surfaces in result.__interrupt__)
  const editedContent = interrupt({
    instruction: "Review and edit this content",
    content: state.generatedText
  });

  // Update the state with the edited version
  return { generatedText: editedContent };
}
```

When resuming, provide the edited content:

```typescript  theme={null}
await graph.invoke(
  new Command({ resume: "The edited and improved text" }), // Value becomes the return from interrupt()
  config
);
```

<Accordion title="Full example">
  ```typescript  theme={null}
  import {
    Command,
    MemorySaver,
    START,
    END,
    StateGraph,
    interrupt,
  } from "@langchain/langgraph";
  import * as z from "zod";

const State = z.object({
generatedText: z.string(),
});

const builder = new StateGraph(State)
.addNode("review", async (state) => {
// Ask a reviewer to edit the generated content
const updated = interrupt({
instruction: "Review and edit this content",
content: state.generatedText,
});
return { generatedText: updated };
})
.addEdge(START, "review")
.addEdge("review", END);

const checkpointer = new MemorySaver();
const graph = builder.compile({ checkpointer });

const config = { configurable: { thread_id: "review-42" } };
const initial = await graph.invoke({ generatedText: "Initial draft" }, config);
console.log(initial.__interrupt__);
// [{ value: { instruction: ..., content: ... } }]

// Resume with the edited text from the reviewer
const finalState = await graph.invoke(
new Command({ resume: "Improved draft after review" }),
config,
);
console.log(finalState.generatedText); // -> "Improved draft after review"
  ```
</Accordion>

### Interrupts in tools

You can also place interrupts directly inside tool functions. This makes the tool itself pause for approval whenever it's called, and allows for human review and editing of the tool call before it is executed.

First, define a tool that uses [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html):

```typescript  theme={null}
import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import * as z from "zod";

const sendEmailTool = tool(
  async ({ to, subject, body }) => {
    // Pause before sending; payload surfaces in result.__interrupt__
    const response = interrupt({
      action: "send_email",
      to,
      subject,
      body,
      message: "Approve sending this email?",
    });

    if (response?.action === "approve") {
      // Resume value can override inputs before executing
      const finalTo = response.to ?? to;
      const finalSubject = response.subject ?? subject;
      const finalBody = response.body ?? body;
      return `Email sent to ${finalTo} with subject '${finalSubject}'`;
    }
    return "Email cancelled by user";
  },
  {
    name: "send_email",
    description: "Send an email to a recipient",
    schema: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
  },
);
```

This approach is useful when you want the approval logic to live with the tool itself, making it reusable across different parts of your graph. The LLM can call the tool naturally, and the interrupt will pause execution whenever the tool is invoked, allowing you to approve, edit, or cancel the action.

<Accordion title="Full example">
  ```typescript  theme={null}
  import { tool } from "@langchain/core/tools";
  import { ChatAnthropic } from "@langchain/anthropic";
  import {
    Command,
    MemorySaver,
    START,
    END,
    StateGraph,
    interrupt,
  } from "@langchain/langgraph";
  import * as z from "zod";

const sendEmailTool = tool(
async ({ to, subject, body }) => {
// Pause before sending; payload surfaces in result.__interrupt__
const response = interrupt({
action: "send_email",
to,
subject,
body,
message: "Approve sending this email?",
});

      if (response?.action === "approve") {
        const finalTo = response.to ?? to;
        const finalSubject = response.subject ?? subject;
        const finalBody = response.body ?? body;
        console.log("[sendEmailTool]", finalTo, finalSubject, finalBody);
        return `Email sent to ${finalTo}`;
      }
      return "Email cancelled by user";
    },
    {
      name: "send_email",
      description: "Send an email to a recipient",
      schema: z.object({
        to: z.string(),
        subject: z.string(),
        body: z.string(),
      }),
    },
);

const model = new ChatAnthropic({ model: "claude-sonnet-4-5-20250929" }).bindTools([sendEmailTool]);

const Message = z.object({
role: z.enum(["user", "assistant", "tool"]),
content: z.string(),
});

const State = z.object({
messages: z.array(Message),
});

const graphBuilder = new StateGraph(State)
.addNode("agent", async (state) => {
// LLM may decide to call the tool; interrupt pauses before sending
const response = await model.invoke(state.messages);
return { messages: [...state.messages, response] };
})
.addEdge(START, "agent")
.addEdge("agent", END);

const checkpointer = new MemorySaver();
const graph = graphBuilder.compile({ checkpointer });

const config = { configurable: { thread_id: "email-workflow" } };
const initial = await graph.invoke(
{
messages: [
{ role: "user", content: "Send an email to alice@example.com about the meeting" },
],
},
config,
);
console.log(initial.__interrupt__); // -> [{ value: { action: 'send_email', ... } }]

// Resume with approval and optionally edited arguments
const resumed = await graph.invoke(
new Command({
resume: { action: "approve", subject: "Updated subject" },
}),
config,
);
console.log(resumed.messages.at(-1)); // -> Tool result returned by send_email
  ```
</Accordion>

### Validating human input

Sometimes you need to validate input from humans and ask again if it's invalid. You can do this using multiple [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) calls in a loop.

```typescript  theme={null}
import { interrupt } from "@langchain/langgraph";

function getAgeNode(state: State) {
  let prompt = "What is your age?";

  while (true) {
    const answer = interrupt(prompt); // payload surfaces in result.__interrupt__

    // Validate the input
    if (typeof answer === "number" && answer > 0) {
      // Valid input - continue
      return { age: answer };
    } else {
      // Invalid input - ask again with a more specific prompt
      prompt = `'${answer}' is not a valid age. Please enter a positive number.`;
    }
  }
}
```

Each time you resume the graph with invalid input, it will ask again with a clearer message. Once valid input is provided, the node completes and the graph continues.

<Accordion title="Full example">
  ```typescript  theme={null}
  import {
    Command,
    MemorySaver,
    START,
    END,
    StateGraph,
    interrupt,
  } from "@langchain/langgraph";
  import * as z from "zod";

const State = z.object({
age: z.number().nullable(),
});

const builder = new StateGraph(State)
.addNode("collectAge", (state) => {
let prompt = "What is your age?";

      while (true) {
        const answer = interrupt(prompt); // payload surfaces in result.__interrupt__

        if (typeof answer === "number" && answer > 0) {
          return { age: answer };
        }

        prompt = `'${answer}' is not a valid age. Please enter a positive number.`;
      }
    })
    .addEdge(START, "collectAge")
    .addEdge("collectAge", END);

const checkpointer = new MemorySaver();
const graph = builder.compile({ checkpointer });

const config = { configurable: { thread_id: "form-1" } };
const first = await graph.invoke({ age: null }, config);
console.log(first.__interrupt__); // -> [{ value: "What is your age?", ... }]

// Provide invalid data; the node re-prompts
const retry = await graph.invoke(new Command({ resume: "thirty" }), config);
console.log(retry.__interrupt__); // -> [{ value: "'thirty' is not a valid age...", ... }]

// Provide valid data; loop exits and state updates
const final = await graph.invoke(new Command({ resume: 30 }), config);
console.log(final.age); // -> 30
  ```
</Accordion>

## Rules of interrupts

When you call [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) within a node, LangGraph suspends execution by raising an exception that signals the runtime to pause. This exception propagates up through the call stack and is caught by the runtime, which notifies the graph to save the current state and wait for external input.

When execution resumes (after you provide the requested input), the runtime restarts the entire node from the beginning—it does not resume from the exact line where [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) was called. This means any code that ran before the [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) will execute again. Because of this, there's a few important rules to follow when working with interrupts to ensure they behave as expected.

### Do not wrap `interrupt` calls in try/catch

The way that [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) pauses execution at the point of the call is by throwing a special exception. If you wrap the [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) call in a try/catch block, you will catch this exception and the interrupt will not be passed back to the graph.

* ✅ Separate [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) calls from error-prone code
* ✅ Conditionally catch errors if needed

<CodeGroup>
  ```typescript Separating logic theme={null}
  async function nodeA(state: State) {
      // ✅ Good: interrupting first, then handling error conditions separately
      const name = interrupt("What's your name?");
      try {
          await fetchData(); // This can fail
      } catch (err) {
          console.error(error);
      }
      return state;
  }
  ```

  ```typescript Conditionally handling errors theme={null}
  async function nodeA(state: State) {
      // ✅ Good: re-throwing the exception will
      // allow the interrupt to be passed back to
      // the graph
      try {
          const name = interrupt("What's your name?");
          await fetchData(); // This can fail
      } catch (err) {
          if (error instanceof NetworkError) {
              console.error(error);
          }
          throw error;
      }
      return state;
  }
  ```
</CodeGroup>

* 🔴 Do not wrap [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) calls in bare try/catch blocks

```typescript  theme={null}
async function nodeA(state: State) {
    // ❌ Bad: wrapping interrupt in bare try/catch will catch the interrupt exception
    try {
        const name = interrupt("What's your name?");
    } catch (err) {
        console.error(error);
    }
    return state;
}
```

### Do not reorder `interrupt` calls within a node

It's common to use multiple interrupts in a single node, however this can lead to unexpected behavior if not handled carefully.

When a node contains multiple interrupt calls, LangGraph keeps a list of resume values specific to the task executing the node. Whenever execution resumes, it starts at the beginning of the node. For each interrupt encountered, LangGraph checks if a matching value exists in the task's resume list. Matching is **strictly index-based**, so the order of interrupt calls within the node is important.

* ✅ Keep [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) calls consistent across node executions

```typescript  theme={null}
async function nodeA(state: State) {
    // ✅ Good: interrupt calls happen in the same order every time
    const name = interrupt("What's your name?");
    const age = interrupt("What's your age?");
    const city = interrupt("What's your city?");

    return {
        name,
        age,
        city
    };
}
```

* 🔴 Do not conditionally skip [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) calls within a node
* 🔴 Do not loop [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) calls using logic that isn't deterministic across executions

<CodeGroup>
  ```typescript Skipping interrupts theme={null}
  async function nodeA(state: State) {
      // ❌ Bad: conditionally skipping interrupts changes the order
      const name = interrupt("What's your name?");

      // On first run, this might skip the interrupt
      // On resume, it might not skip it - causing index mismatch
      if (state.needsAge) {
          const age = interrupt("What's your age?");
      }

      const city = interrupt("What's your city?");

      return { name, city };
}
  ```

  ```typescript Looping interrupts theme={null}
  async function nodeA(state: State) {
      // ❌ Bad: looping based on non-deterministic data
      // The number of interrupts changes between executions
      const results = [];
      for (const item of state.dynamicList || []) {  // List might change between runs
          const result = interrupt(`Approve ${item}?`);
          results.push(result);
      }

      return { results };
  }
  ```
</CodeGroup>

### Do not return complex values in `interrupt` calls

Depending on which checkpointer is used, complex values may not be serializable (e.g. you can't serialize a function). To make your graphs adaptable to any deployment, it's best practice to only use values that can be reasonably serialized.

* ✅ Pass simple, JSON-serializable types to [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html)
* ✅ Pass dictionaries/objects with simple values

<CodeGroup>
  ```typescript Simple values theme={null}
  async function nodeA(state: State) {
      // ✅ Good: passing simple types that are serializable
      const name = interrupt("What's your name?");
      const count = interrupt(42);
      const approved = interrupt(true);

      return { name, count, approved };
}
  ```

  ```typescript Structured data theme={null}
  async function nodeA(state: State) {
      // ✅ Good: passing objects with simple values
      const response = interrupt({
          question: "Enter user details",
          fields: ["name", "email", "age"],
          currentValues: state.user || {}
      });

      return { user: response };
  }
  ```
</CodeGroup>

* 🔴 Do not pass functions, class instances, or other complex objects to [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html)

<CodeGroup>
  ```typescript Functions theme={null}
  function validateInput(value: string): boolean {
      return value.length > 0;
  }

async function nodeA(state: State) {
// ❌ Bad: passing a function to interrupt
// The function cannot be serialized
const response = interrupt({
question: "What's your name?",
validator: validateInput  // This will fail
});
return { name: response };
}
  ```

  ```typescript Class instances theme={null}
  class DataProcessor {
      constructor(private config: any) {}
  }

  async function nodeA(state: State) {
      const processor = new DataProcessor({ mode: "strict" });

      // ❌ Bad: passing a class instance to interrupt
      // The instance cannot be serialized
      const response = interrupt({
          question: "Enter data to process",
          processor: processor  // This will fail
      });
      return { result: response };
  }
  ```
</CodeGroup>

### Side effects called before `interrupt` must be idempotent

Because interrupts work by re-running the nodes they were called from, side effects called before [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) should (ideally) be idempotent. For context, idempotency means that the same operation can be applied multiple times without changing the result beyond the initial execution.

As an example, you might have an API call to update a record inside of a node. If [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) is called after that call is made, it will be re-run multiple times when the node is resumed, potentially overwriting the initial update or creating duplicate records.

* ✅ Use idempotent operations before [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html)
* ✅ Place side effects after [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) calls
* ✅ Separate side effects into separate nodes when possible

<CodeGroup>
  ```typescript Idempotent operations theme={null}
  async function nodeA(state: State) {
      // ✅ Good: using upsert operation which is idempotent
      // Running this multiple times will have the same result
      await db.upsertUser({
          userId: state.userId,
          status: "pending_approval"
      });

      const approved = interrupt("Approve this change?");

      return { approved };
}
  ```

  ```typescript Side effects after interrupt theme={null}
  async function nodeA(state: State) {
      // ✅ Good: placing side effect after the interrupt
      // This ensures it only runs once after approval is received
      const approved = interrupt("Approve this change?");

      if (approved) {
          await db.createAuditLog({
              userId: state.userId,
              action: "approved"
          });
      }

      return { approved };
  }
  ```

  ```typescript Separating into different nodes theme={null}
  async function approvalNode(state: State) {
      // ✅ Good: only handling the interrupt in this node
      const approved = interrupt("Approve this change?");

      return { approved };
  }

  async function notificationNode(state: State) {
      // ✅ Good: side effect happens in a separate node
      // This runs after approval, so it only executes once
      if (state.approved) {
          await sendNotification({
              userId: state.userId,
              status: "approved"
          });
      }

      return state;
  }
  ```
</CodeGroup>

* 🔴 Do not perform non-idempotent operations before [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html)
* 🔴 Do not create new records without checking if they exist

<CodeGroup>
  ```typescript Creating records theme={null}
  async function nodeA(state: State) {
      // ❌ Bad: creating a new record before interrupt
      // This will create duplicate records on each resume
      const auditId = await db.createAuditLog({
          userId: state.userId,
          action: "pending_approval",
          timestamp: new Date()
      });

      const approved = interrupt("Approve this change?");

      return { approved, auditId };
}
  ```

  ```typescript Appending to arrays theme={null}
  async function nodeA(state: State) {
      // ❌ Bad: appending to an array before interrupt
      // This will add duplicate entries on each resume
      await db.appendToHistory(state.userId, "approval_requested");

      const approved = interrupt("Approve this change?");

      return { approved };
  }
  ```
</CodeGroup>

## Using with subgraphs called as functions

When invoking a subgraph within a node, the parent graph will resume execution from the **beginning of the node** where the subgraph was invoked and the [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) was triggered. Similarly, the **subgraph** will also resume from the beginning of the node where [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) was called.

```typescript  theme={null}
async function nodeInParentGraph(state: State) {
    someCode(); // <-- This will re-execute when resumed
    // Invoke a subgraph as a function.
    // The subgraph contains an `interrupt` call.
    const subgraphResult = await subgraph.invoke(someInput);
    // ...
}

async function nodeInSubgraph(state: State) {
    someOtherCode(); // <-- This will also re-execute when resumed
    const result = interrupt("What's your name?");
    // ...
}
```

## Debugging with interrupts

To debug and test a graph, you can use static interrupts as breakpoints to step through the graph execution one node at a time. Static interrupts are triggered at defined points either before or after a node executes. You can set these by specifying `interruptBefore` and `interruptAfter` when compiling the graph.

<Note>
  Static interrupts are **not** recommended for human-in-the-loop workflows. Use the [`interrupt`](https://reference.langchain.com/javascript/functions/_langchain_langgraph.index.interrupt.html) function instead.
</Note>

<Tabs>
  <Tab title="At compile time">
    ```typescript  theme={null}
    const graph = builder.compile({
        interruptBefore: ["node_a"],  // [!code highlight]
        interruptAfter: ["node_b", "node_c"],  // [!code highlight]
        checkpointer,
    });

    // Pass a thread ID to the graph
    const config = {
        configurable: {
            thread_id: "some_thread"
        }
    };

    // Run the graph until the breakpoint
    await graph.invoke(inputs, config);# [!code highlight]

    await graph.invoke(null, config);  # [!code highlight]
    ```

    1. The breakpoints are set during `compile` time.
    2. `interruptBefore` specifies the nodes where execution should pause before the node is executed.
    3. `interruptAfter` specifies the nodes where execution should pause after the node is executed.
    4. A checkpointer is required to enable breakpoints.
    5. The graph is run until the first breakpoint is hit.
    6. The graph is resumed by passing in `null` for the input. This will run the graph until the next breakpoint is hit.
  </Tab>

  <Tab title="At run time">
    ```typescript  theme={null}
    // Run the graph until the breakpoint
    graph.invoke(inputs, {
        interruptBefore: ["node_a"],  // [!code highlight]
        interruptAfter: ["node_b", "node_c"],  // [!code highlight]
        configurable: {
            thread_id: "some_thread"
        }
    });

    // Resume the graph
    await graph.invoke(null, config);  // [!code highlight]
    ```

    1. `graph.invoke` is called with the `interruptBefore` and `interruptAfter` parameters. This is a run-time configuration and can be changed for every invocation.
    2. `interruptBefore` specifies the nodes where execution should pause before the node is executed.
    3. `interruptAfter` specifies the nodes where execution should pause after the node is executed.
    4. The graph is run until the first breakpoint is hit.
    5. The graph is resumed by passing in `null` for the input. This will run the graph until the next breakpoint is hit.
  </Tab>
</Tabs>

### Using LangGraph Studio

You can use [LangGraph Studio](/langsmith/studio) to set static interrupts in your graph in the UI before running the graph. You can also use the UI to inspect the graph state at any point in the execution.

<img src="https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/static-interrupt.png?fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=5aa4e7cea2ab147cef5b4e210dd6c4a1" alt="image" data-og-width="1252" width="1252" data-og-height="1040" height="1040" data-path="oss/images/static-interrupt.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/static-interrupt.png?w=280&fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=52d02b507d0a6a879f7fb88d9c6767d0 280w, https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/static-interrupt.png?w=560&fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=e363cd4980edff9bab422f4f1c0ee3c8 560w, https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/static-interrupt.png?w=840&fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=49d26a3641953c23ef3fbc51e828c305 840w, https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/static-interrupt.png?w=1100&fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=2dba15683b3baa1a61bc3bcada35ae1e 1100w, https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/static-interrupt.png?w=1650&fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=9f9a2c0f2631c0e69cd248f6319933fe 1650w, https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/static-interrupt.png?w=2500&fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=5a46b765b436ab5d0dc2f41c01ffad80 2500w" />

***

<Callout icon="pen-to-square" iconType="regular">
  [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/interrupts.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
</Callout>

<Tip icon="terminal" iconType="regular">
  [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
</Tip>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.langchain.com/llms.txt