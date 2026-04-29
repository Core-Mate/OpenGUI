import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";

interface NodeTokenUsage {
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
}

export interface TokenUsageResult {
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	by_node: Record<string, NodeTokenUsage>;
}

/**
 *
 *
 */
export class TokenUsageCallbackHandler extends BaseCallbackHandler {
	name = "TokenUsageCallbackHandler";

	private runNodeMap: Record<string, string> = {};
	private nodeUsage: Record<string, NodeTokenUsage> = {};

	handleChatModelStart(
		_llm: unknown,
		_messages: BaseMessage[][],
		runId: string,
		_parentRunId?: string,
		_extraParams?: Record<string, unknown>,
		_tags?: string[],
		metadata?: Record<string, unknown>,
		_runName?: string,
	): void {
		const nodeName = metadata?.langgraph_node as string;
		if (nodeName) {
			this.runNodeMap[runId] = nodeName;
		}
	}

	handleLLMEnd(output: LLMResult, runId: string): void {
		const nodeName = this.runNodeMap[runId] || "unknown";
		delete this.runNodeMap[runId];

		// Anthropic: llmOutput.usage = { input_tokens, output_tokens }
		// OpenAI:    llmOutput.tokenUsage = { promptTokens, completionTokens, totalTokens }
		const usage = output.llmOutput?.usage || output.llmOutput?.tokenUsage;
		if (!usage) return;

		const inputTokens =
			usage.input_tokens ?? usage.promptTokens ?? 0;
		const outputTokens =
			usage.output_tokens ?? usage.completionTokens ?? 0;
		const totalTokens = inputTokens + outputTokens;

		if (!this.nodeUsage[nodeName]) {
			this.nodeUsage[nodeName] = {
				input_tokens: 0,
				output_tokens: 0,
				total_tokens: 0,
			};
		}

		this.nodeUsage[nodeName].input_tokens += inputTokens;
		this.nodeUsage[nodeName].output_tokens += outputTokens;
		this.nodeUsage[nodeName].total_tokens += totalTokens;
	}

	getResult(): TokenUsageResult {
		let totalInput = 0;
		let totalOutput = 0;
		let totalAll = 0;
		for (const usage of Object.values(this.nodeUsage)) {
			totalInput += usage.input_tokens;
			totalOutput += usage.output_tokens;
			totalAll += usage.total_tokens;
		}
		return {
			input_tokens: totalInput,
			output_tokens: totalOutput,
			total_tokens: totalAll,
			by_node: { ...this.nodeUsage },
		};
	}

	merge(other: TokenUsageResult): void {
		for (const [node, usage] of Object.entries(other.by_node)) {
			if (!this.nodeUsage[node]) {
				this.nodeUsage[node] = {
					input_tokens: 0,
					output_tokens: 0,
					total_tokens: 0,
				};
			}
			this.nodeUsage[node].input_tokens += usage.input_tokens;
			this.nodeUsage[node].output_tokens += usage.output_tokens;
			this.nodeUsage[node].total_tokens += usage.total_tokens;
		}
	}
}
