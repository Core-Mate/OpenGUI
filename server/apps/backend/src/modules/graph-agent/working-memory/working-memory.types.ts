/**
 * Working Memory 类型定义
 *
 * 基于 voltagent 的 Working Memory 机制实现
 * 支持 Markdown 格式，会话级别隔离（通过 thread_id）
 */

/**
 * 工作记忆更新模式
 * - replace: 完全替换现有内容
 * - append: 在现有内容后追加新内容
 */
export type WorkingMemoryUpdateMode = "replace" | "append";

/**
 * 获取工作记忆的输出
 */
export interface GetWorkingMemoryOutput {
	success: boolean;
	content?: string | null;
	error?: string;
}

/**
 * 更新工作记忆的输出
 */
export interface UpdateWorkingMemoryOutput {
	success: boolean;
	error?: string;
}

/**
 * 清除工作记忆的输出
 */
export interface ClearWorkingMemoryOutput {
	success: boolean;
	error?: string;
}
