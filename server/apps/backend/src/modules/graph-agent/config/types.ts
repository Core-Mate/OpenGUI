/**
 *
 */

/**
 */
export enum AgentName {
	EXECUTOR_VLM = "executor-vlm",
	PLAN_SUPERVISOR = "plan-supervisor",
	SUMMARIZER = "summarizer",
	ACTION_SUMMARIZER = "action-summarizer",
	CREATOR_AGENT = "creator-agent",
}

/**
 */
export type DbAgentName =
	| "executor_vlm"
	| "plan_supervisor"
	| "summarizer"
	| "action_summarizer"
	| "creator_agent";

/**
 */
export interface AgentConfigDTO {
	id: number;
	agentName: AgentName;
	configName: string;
	description?: string | null;


	baseUrl?: string | null;
	apiKey?: string | null;
	modelName?: string | null;
	fallbackModel?: string | null;
	temperature?: number | null;
	maxTokens?: number | null;
	topP?: number | null;

	// System Prompt
	systemPrompt: string;


	extra?: Record<string, unknown> | null;


	region: string;

	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

/**
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
 */
export interface AgentConfigListParams {
	page?: number;
	pageSize?: number;
	agentName?: AgentName;
	search?: string;
	region?: string;
}

/**
 */
export interface AgentConfigListResponse {
	configs: AgentConfigDTO[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

/**
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
