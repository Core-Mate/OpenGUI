import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 */
export const CALL_USER_TOOL_NAME = "call_user";

/**
 *
 *
 */
export function createCallUserTool() {
	return tool(
		async (input: { content: string }): Promise<string> => {
			return JSON.stringify({ success: true, message: input.content });
		},
		{
			name: CALL_USER_TOOL_NAME,
			description:
				"Request manual user intervention. Use only for: (1) high-risk actions that require explicit user confirmation, such as deletion, unsubscribe, payment, or permission authorization; (2) hard blockers after 3 or more attempts on the same subtask. Do not use for missing keywords or general decisions; first recover from task slots, working memory, or screen information.",
			schema: z.object({
				content: z
					.string()
					.describe("Explain why user intervention is needed and what the user should do"),
			}),
		},
	);
}

/**
 *
 *
 * - Redacts literal "Action:" text to avoid interfering with Thought line parsing.
 */
export function buildCallUserPrediction(content: string): string {
	const sanitized = content
		.replace(/'/g, "")
		.replace(/\n/g, " ")
		.replace(/Action[:：]/g, "Action -");
	return `Summary: Need user help\nThought: ${sanitized}\nAction: call_user(content='${sanitized}')`;
}
