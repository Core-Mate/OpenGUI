import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@repo/db";
import {
	AgentName,
	type AgentConfigDTO,
	type CreateAgentConfigDTO,
	type UpdateAgentConfigDTO,
	type AgentConfigListParams,
	type AgentConfigListResponse,
	toDbAgentName,
	fromDbAgentName,
} from "./types";

/**
 *
 */
@Injectable()
export class AgentConfigService {
	private readonly logger = new Logger(AgentConfigService.name);

	/**
	 */
	async getConfigs(
		params: AgentConfigListParams,
	): Promise<AgentConfigListResponse> {
		const page = params.page || 1;
		const pageSize = params.pageSize || 20;
		const skip = (page - 1) * pageSize;

		const where = {
			is_deleted: false,
			...(params.agentName && {
				agent_name: toDbAgentName(params.agentName),
			}),
			...(params.region && {
				region: params.region,
			}),
			...(params.search && {
				OR: [
					{
						config_name: {
							contains: params.search,
							mode: "insensitive" as const,
						},
					},
					{
						description: {
							contains: params.search,
							mode: "insensitive" as const,
						},
					},
				],
			}),
		};

		const [configs, total] = await Promise.all([
			prisma.system_prompt_config.findMany({
				where,
				skip,
				take: pageSize,
				orderBy: [
					{ agent_name: "asc" },
					{ is_active: "desc" },
					{ updated_at: "desc" },
				],
			}),
			prisma.system_prompt_config.count({ where }),
		]);

		return {
			configs: configs.map((c) => this.toDTO(c)),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	/**
	 */
	async getConfigById(id: number): Promise<AgentConfigDTO | null> {
		const config = await prisma.system_prompt_config.findFirst({
			where: { id, is_deleted: false },
		});

		if (!config) return null;
		return this.toDTO(config);
	}

	/**
	 */
	async createConfig(data: CreateAgentConfigDTO): Promise<AgentConfigDTO> {
		const config = await prisma.system_prompt_config.create({
			data: {
				agent_name: toDbAgentName(data.agentName),
				config_name: data.configName,
				description: data.description,
				base_url: data.baseUrl,
				api_key: data.apiKey,
				model_name: data.modelName,
				temperature: data.temperature,
				max_tokens: data.maxTokens,
				top_p: data.topP,
				system_prompt: data.systemPrompt,
				extra: data.extra || undefined,
				region: data.region || "CN",
				is_active: false,
			},
		});

		this.logger.log(
			`Created config: ${config.id} for agent: ${data.agentName}, region: ${data.region || "CN"}`,
		);
		return this.toDTO(config);
	}

	/**
	 */
	async updateConfig(
		id: number,
		data: UpdateAgentConfigDTO,
	): Promise<AgentConfigDTO> {

		const current = await prisma.system_prompt_config.findFirst({
			where: { id, is_deleted: false },
		});

		if (!current) {
			throw new Error(`Config not found: ${id}`);
		}

		const updateData: Record<string, unknown> = {
			updated_at: new Date(),
		};

		if (data.configName !== undefined) updateData.config_name = data.configName;
		if (data.description !== undefined) updateData.description = data.description;
		if (data.baseUrl !== undefined) updateData.base_url = data.baseUrl;
		if (data.apiKey !== undefined) updateData.api_key = data.apiKey;
		if (data.modelName !== undefined) updateData.model_name = data.modelName;
		if (data.temperature !== undefined) updateData.temperature = data.temperature;
		if (data.maxTokens !== undefined) updateData.max_tokens = data.maxTokens;
		if (data.topP !== undefined) updateData.top_p = data.topP;
		if (data.systemPrompt !== undefined)
			updateData.system_prompt = data.systemPrompt;
		if (data.extra !== undefined) updateData.extra = data.extra;

		const config = await prisma.system_prompt_config.update({
			where: { id },
			data: updateData,
		});

		this.logger.log(`Updated config: ${id}`);
		return this.toDTO(config);
	}

	/**
	 */
	async deleteConfig(id: number): Promise<void> {
		const config = await prisma.system_prompt_config.findFirst({
			where: { id, is_deleted: false },
		});

		if (!config) {
			throw new Error(`Config not found: ${id}`);
		}

		if (config.is_active) {
			throw new Error("Cannot delete active config");
		}

		await prisma.system_prompt_config.update({
			where: { id },
			data: {
				is_deleted: true,
				is_active: false,
				updated_at: new Date(),
			},
		});

		this.logger.log(`Deleted config: ${id}`);
	}

	/**
	 */
	async activateConfig(id: number): Promise<AgentConfigDTO> {
		const config = await prisma.system_prompt_config.findFirst({
			where: { id, is_deleted: false },
		});

		if (!config) {
			throw new Error(`Config not found: ${id}`);
		}


		const [, updatedConfig] = await prisma.$transaction([

			prisma.system_prompt_config.updateMany({
				where: {
					agent_name: config.agent_name,
					region: config.region,
					is_active: true,
					is_deleted: false,
					id: { not: id },
				},
				data: {
					is_active: false,
					updated_at: new Date(),
				},
			}),

			prisma.system_prompt_config.update({
				where: { id },
				data: {
					is_active: true,
					updated_at: new Date(),
				},
			}),
		]);

		this.logger.log(`Activated config: ${id} for agent: ${config.agent_name}, region: ${config.region}`);
		return this.toDTO(updatedConfig);
	}

	/**
	 */
	async duplicateConfig(id: number): Promise<AgentConfigDTO> {
		const source = await prisma.system_prompt_config.findFirst({
			where: { id, is_deleted: false },
		});

		if (!source) {
			throw new Error(`Config not found: ${id}`);
		}

		const config = await prisma.system_prompt_config.create({
			data: {
				agent_name: source.agent_name,
				config_name: `${source.config_name} (Copy)`,
				description: source.description,
				base_url: source.base_url,
				api_key: source.api_key,
				model_name: source.model_name,
				temperature: source.temperature,
				max_tokens: source.max_tokens,
				top_p: source.top_p,
				system_prompt: source.system_prompt,
				extra: source.extra || undefined,
				region: source.region,
				is_active: false,
			},
		});

		this.logger.log(`Duplicated config: ${id} -> ${config.id}`);
		return this.toDTO(config);
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
