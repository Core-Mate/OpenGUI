import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@repo/db";
import {
	type AgentConfigDTO,
	AgentName,
	fromDbAgentName,
	type ModelConfig,
	toDbAgentName,
} from "./types";

/**
 *
 */
@Injectable()
export class AgentConfigProvider {
	private readonly logger = new Logger(AgentConfigProvider.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 *
	 */
	private async getConfig(
		agentName: AgentName,
		region = "CN",
	): Promise<AgentConfigDTO> {
		const config = await prisma.system_prompt_config.findFirst({
			where: {
				agent_name: toDbAgentName(agentName),
				region,
				is_active: true,
				is_deleted: false,
			},
		});

		if (!config) {
			throw new Error(
				`No active config found for agent: ${agentName}, region: ${region}`,
			);
		}

		return this.toDTO(config);
	}

	/**
	 *
	 * All graph agents use the same OpenAI-compatible model config:
	 * - VLM_API_KEY
	 * - VLM_BASE_URL
	 * - VLM_MODEL
	 *
	 */
	async getModelConfig(agentName: AgentName, region = "CN"): Promise<ModelConfig> {
		const config = await this.getConfig(agentName, region);

		const apiKey = this.configService.get<string>("VLM_API_KEY");
		const baseURL = this.configService.get<string>("VLM_BASE_URL");
		const model = this.configService.get<string>("VLM_MODEL");


		if (!apiKey) {
			throw new Error(
				`API key not configured for agent: ${agentName}. ` +
					"Set VLM_API_KEY in .env",
			);
		}

		if (!model) {
			throw new Error(
				`Model not configured for agent: ${agentName}. ` +
					"Set VLM_MODEL in .env",
			);
		}

		return {
			model,
			apiKey,
			baseURL: baseURL || undefined,
			fallbackModel: model,
			temperature: config.temperature ?? undefined,
			maxTokens: config.maxTokens ?? undefined,
			topP: config.topP ?? undefined,
			systemPrompt: config.systemPrompt,
		};
	}

	/**
	 */
	private toDTO(config: {
		id: number;
		agent_name: string;
		config_name: string;
		description: string | null;
		base_url: string | null;
		api_key: string | null;
		model_name: string | null;
		fallback_model: string | null;
		temperature: number | null;
		max_tokens: number | null;
		top_p: number | null;
		system_prompt: string;
		extra: unknown;
		is_active: boolean;
		created_at: Date;
		updated_at: Date;
		region: string;
	}): AgentConfigDTO {
		return {
			id: config.id,
			agentName: fromDbAgentName(config.agent_name),
			configName: config.config_name,
			description: config.description,
			baseUrl: config.base_url,
			apiKey: config.api_key,
			modelName: config.model_name,
			fallbackModel: config.fallback_model,
			temperature: config.temperature,
			maxTokens: config.max_tokens,
			topP: config.top_p,
			systemPrompt: config.system_prompt,
			extra: config.extra as Record<string, unknown> | null,
			region: config.region,
			isActive: config.is_active,
			createdAt: config.created_at.toISOString(),
			updatedAt: config.updated_at.toISOString(),
		};
	}
}
