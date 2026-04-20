/**
 * Agent 配置类型定义
 *
 */

/**
 * Agent 名称枚举
 * 与数据库 agentname 枚举对应
 */
export enum AgentName {
	EXECUTOR_VLM = "executor-vlm",
	PLAN_SUPERVISOR = "plan-supervisor",
	SUMMARIZER = "summarizer",
	ACTION_SUMMARIZER = "action-summarizer",
	CREATOR_AGENT = "creator-agent",
}

/**
 * 数据库 agent_name 枚举类型
 * 使用 Prisma enum 名称（下划线格式），而非 @map 的数据库值
 */
export type DbAgentName =
	| "executor_vlm"
	| "plan_supervisor"
	| "summarizer"
	| "action_summarizer"
	| "creator_agent";

/**
 * Agent 配置 DTO
 */
export interface AgentConfigDTO {
	id: number;
	agentName: AgentName;
	configName: string;
	description?: string | null;

	// 模型配置
	baseUrl?: string | null;
	apiKey?: string | null;
	modelName?: string | null;
	fallbackModel?: string | null;
	temperature?: number | null;
	maxTokens?: number | null;
	topP?: number | null;

	// System Prompt
	systemPrompt: string;

	// 扩展配置
	extra?: Record<string, unknown> | null;

	// 地区配置
	region: string;

	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

/**
 * 创建 Agent 配置 DTO
 */
export interface CreateAgentConfigDTO {
	agentName: AgentName;
	configName: string;
	description?: string;
	baseUrl?: string;
	apiKey?: string;
	modelName?: string;
	fallbackModel?: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	systemPrompt: string;
	extra?: Record<string, unknown>;
	region?: string;
}

/**
 * 更新 Agent 配置 DTO
 */
export interface UpdateAgentConfigDTO {
	configName?: string;
	description?: string;
	baseUrl?: string;
	apiKey?: string;
	modelName?: string;
	fallbackModel?: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	systemPrompt?: string;
	extra?: Record<string, unknown>;
}

/**
 * 模型配置接口
 * 用于传递给 LangChain 模型
 */
export interface ModelConfig {
	model: string;
	apiKey: string;
	baseURL?: string;
	fallbackModel?: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	systemPrompt: string;
}

/**
 * Agent 配置列表查询参数
 */
export interface AgentConfigListParams {
	page?: number;
	pageSize?: number;
	agentName?: AgentName;
	search?: string;
	region?: string;
}

/**
 * Agent 配置列表响应
 */
export interface AgentConfigListResponse {
	configs: AgentConfigDTO[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

/**
 * AgentName 枚举转数据库枚举值
 * 返回 Prisma enum 名称（下划线格式）
 */
export function toDbAgentName(agentName: AgentName): DbAgentName {
	const mapping: Record<AgentName, DbAgentName> = {
		[AgentName.EXECUTOR_VLM]: "executor_vlm",
		[AgentName.PLAN_SUPERVISOR]: "plan_supervisor",
		[AgentName.SUMMARIZER]: "summarizer",
		[AgentName.ACTION_SUMMARIZER]: "action_summarizer",
		[AgentName.CREATOR_AGENT]: "creator_agent",
	};
	return mapping[agentName];
}

/**
 * 数据库枚举值转 AgentName 枚举
 */
export function fromDbAgentName(dbAgentName: string): AgentName {
	const mapping: Record<string, AgentName> = {
		executor_vlm: AgentName.EXECUTOR_VLM,
		plan_supervisor: AgentName.PLAN_SUPERVISOR,
		summarizer: AgentName.SUMMARIZER,
		action_summarizer: AgentName.ACTION_SUMMARIZER,
		creator_agent: AgentName.CREATOR_AGENT,
	};
	return mapping[dbAgentName] || (dbAgentName as AgentName);
}
