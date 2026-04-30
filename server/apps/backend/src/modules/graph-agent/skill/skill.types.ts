/**
 */

/**
 */
export enum SkillNodeType {
	PLAN_SUPERVISOR = "plan_supervisor",
	EXECUTOR_VLM = "executor_vlm",
	SUMMARIZER = "summarizer",
	ACTION_SUMMARIZER = "action_summarizer",
	CREATOR_AGENT = "creator_agent",
}

/**
 */
export type DbSkillNodeType = SkillNodeType;

/**
 * Skill DTO
 */
export interface SkillDTO {
	id: number;
	name: string;
	displayName: string;
	description: string | null;
	version: string;
	tenantId: number;
	nodeTypes: SkillNodeType[];
	content: string;
	isActive: boolean;
	region: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * Create Skill DTO
 */
export interface CreateSkillDTO {
	name: string;
	displayName: string;
	description?: string;
	version?: string;
	tenantId?: number;
	nodeTypes: SkillNodeType[];
	content: string;
	region?: string;
}

/**
 */
export interface UpdateSkillDTO {
	displayName?: string;
	description?: string;
	version?: string;
	nodeTypes?: SkillNodeType[];
	content?: string;
	isActive?: boolean;
	region?: string;
}

/**
 */
export interface SkillListParams {
	page?: number;
	pageSize?: number;
	nodeType?: SkillNodeType;
	tenantId?: number;
	search?: string;
	region?: string;
	isActive?: boolean;
}

/**
 */
export interface SkillListResponse {
	skills: SkillDTO[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

/**
 */
export function toDbSkillNodeType(nodeType: SkillNodeType): DbSkillNodeType {
	return nodeType;
}

/**
 */
export function fromDbSkillNodeType(dbNodeType: string): SkillNodeType {
	return dbNodeType as SkillNodeType;
}

/**
 */
export function fromDbSkillNodeTypes(dbNodeTypes: string[]): SkillNodeType[] {
	return dbNodeTypes.map(fromDbSkillNodeType);
}

/**
 */
export function toDbSkillNodeTypes(nodeTypes: SkillNodeType[]): DbSkillNodeType[] {
	return nodeTypes.map(toDbSkillNodeType);
}
