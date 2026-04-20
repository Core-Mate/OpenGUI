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
 * Agent 配置提供者服务
 *
 * 负责从数据库获取 Agent 配置
 */
@Injectable()
export class AgentConfigProvider {
	private readonly logger = new Logger(AgentConfigProvider.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * 获取指定 Agent 的 active 配置
	 * 直接从数据库读取
	 *
	 * @param agentName Agent 名称
	 * @param region 用户地区 (默认为 CN)
	 * @returns Agent 配置 DTO
	 * @throws Error 如果没有找到 active 配置
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
	 * 获取完整模型配置（模型配置 + System Prompt）
	 *
	 * API key、base URL、model name 从环境变量获取：
	 * - executor-vlm: VLM_API_KEY, VLM_BASE_URL, VLM_MODEL
	 * - action-summarizer: CLAUDE_API_KEY, CLAUDE_BASE_URL, CLAUDE_SMALL_MODEL
	 * - 其他 Agent: CLAUDE_API_KEY, CLAUDE_BASE_URL, CLAUDE_MODEL
	 *
	 * system prompt、temperature 等从数据库读取。
	 */
	async getModelConfig(agentName: AgentName, region = "CN"): Promise<ModelConfig> {
		const config = await this.getConfig(agentName, region);

		const isVLM = agentName === AgentName.EXECUTOR_VLM;
		const isSmall = agentName === AgentName.ACTION_SUMMARIZER;

		const apiKey = isVLM
			? this.configService.get<string>("VLM_API_KEY")
			: this.configService.get<string>("CLAUDE_API_KEY");
		const baseURL = isVLM
			? this.configService.get<string>("VLM_BASE_URL")
			: this.configService.get<string>("CLAUDE_BASE_URL");
		const envModel = isVLM
			? this.configService.get<string>("VLM_MODEL")
			: isSmall
				? this.configService.get<string>("CLAUDE_SMALL_MODEL")
				: this.configService.get<string>("CLAUDE_MODEL");

		const model = envModel;

		if (!apiKey) {
			throw new Error(
				`API key not configured for agent: ${agentName}. ` +
					`Set ${isVLM ? "VLM_API_KEY" : "CLAUDE_API_KEY"} in .env`,
			);
		}

		if (!model) {
			throw new Error(
				`Model not configured for agent: ${agentName}. ` +
					`Set ${isVLM ? "VLM_MODEL" : "CLAUDE_MODEL"} in .env`,
			);
		}

		return {
			model,
			apiKey,
			baseURL: baseURL || undefined,
			fallbackModel: config.fallbackModel ?? undefined,
			temperature: config.temperature ?? undefined,
			maxTokens: config.maxTokens ?? undefined,
			topP: config.topP ?? undefined,
			systemPrompt: config.systemPrompt,
		};
	}

	/**
	 * 转换数据库记录为 DTO
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
