/**
 * Skill 模块类型定义
 */

/**
 * Skill 关联的 Node 类型枚举
 * 与数据库 skillnodetype 枚举对应（统一使用下划线格式）
 */
export enum SkillNodeType {
	PLAN_SUPERVISOR = "plan_supervisor",
	EXECUTOR_VLM = "executor_vlm",
	SUMMARIZER = "summarizer",
	ACTION_SUMMARIZER = "action_summarizer",
	CREATOR_AGENT = "creator_agent",
}

/**
 * 数据库 skillnodetype 枚举类型
 * 与 SkillNodeType 值完全一致（统一使用下划线格式）
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
 * 创建 Skill DTO
 */
export interface CreateSkillDTO {
	name: string;
	displayName: string;
	description?: string;
	version?: string;
	tenantId?: number; // 默认 -1（全局）
	nodeTypes: SkillNodeType[];
	content: string;
	region?: string;
}

/**
 * 更新 Skill DTO
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
 * Skill 列表查询参数
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
 * Skill 列表响应
 */
export interface SkillListResponse {
	skills: SkillDTO[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

/**
 * SkillNodeType 枚举转数据库枚举值
 * 现在格式完全一致，直接返回
 */
export function toDbSkillNodeType(nodeType: SkillNodeType): DbSkillNodeType {
	return nodeType;
}

/**
 * 数据库枚举值转 SkillNodeType 枚举
 * 现在格式完全一致，直接转换类型
 */
export function fromDbSkillNodeType(dbNodeType: string): SkillNodeType {
	return dbNodeType as SkillNodeType;
}

/**
 * 批量转换数据库枚举值数组
 */
export function fromDbSkillNodeTypes(dbNodeTypes: string[]): SkillNodeType[] {
	return dbNodeTypes.map(fromDbSkillNodeType);
}

/**
 * 批量转换 SkillNodeType 枚举数组
 */
export function toDbSkillNodeTypes(nodeTypes: SkillNodeType[]): DbSkillNodeType[] {
	return nodeTypes.map(toDbSkillNodeType);
}
