import { ChatOpenAI } from "@langchain/openai";
import type { ModelConfig } from "./types";

/**
 * Creates the single OpenAI-compatible chat model used by OpenGUI graph agents.
 *
 * Provider credentials and model selection come from AgentConfigProvider, which
 * is backed by VLM_API_KEY, VLM_BASE_URL, and VLM_MODEL.
 */
export function createConfiguredChatModel(
	config: ModelConfig,
	options: {
		model?: string;
		temperature?: number;
		maxTokens?: number;
		maxRetries?: number;
		timeout?: number;
		topP?: number;
	} = {},
) {
	return new ChatOpenAI({
		model: options.model ?? config.model,
		apiKey: config.apiKey,
		temperature: options.temperature ?? config.temperature,
		maxTokens: options.maxTokens ?? config.maxTokens,
		maxRetries: options.maxRetries,
		timeout: options.timeout,
		topP: options.topP ?? config.topP,
		...(config.baseURL && {
			configuration: { baseURL: config.baseURL },
		}),
	});
}
