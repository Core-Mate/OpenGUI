import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * call_user 工具名称常量
 */
export const CALL_USER_TOOL_NAME = "call_user";

/**
 * 创建 call_user 工具
 *
 * 模型通过 tool calling 机制调用此工具来请求用户手动介入。
 * 工具本身是 no-op（实际下发逻辑由下游 execute_action → call_user 节点处理），
 * 仅用于让模型以结构化方式表达 call_user 意图。
 *
 * 模型节点在 tool call 循环中检测到此工具后，会构造合成 prediction
 * 文本交给 parse_action 处理，保持下游管线不变。
 */
export function createCallUserTool() {
	return tool(
		async (input: { content: string }): Promise<string> => {
			return JSON.stringify({ success: true, message: input.content });
		},
		{
			name: CALL_USER_TOOL_NAME,
			description:
				"请求用户手动介入。仅用于：(1) 需要用户明确确认的高风险操作（删除、退订、支付、权限授权）；(2) 同一子任务尝试 >=3 次后仍无法继续的硬性阻塞。不要用于缺少关键词或一般性决策——优先从任务槽/工作记忆/屏幕信息恢复。",
			schema: z.object({
				content: z
					.string()
					.describe("向用户说明需要介入的原因和具体请求"),
			}),
		},
	);
}

/**
 * 构造合成 prediction 文本
 *
 * 当模型通过 tool call 触发 call_user 时，模型节点调用此函数
 * 生成与 parseVlmPrediction 期望格式一致的文本，
 * 使下游 parse_action → execute_action → call_user 节点无需修改。
 *
 * 对 content 做清洗：
 * - 去除单引号（parseAction 的正则不支持转义引号）
 * - 换行替换为空格（parseVlmPrediction 按行分割）
 * - 脱敏 "Action:" 字面量（避免干扰 Thought 行解析）
 */
export function buildCallUserPrediction(content: string): string {
	const sanitized = content
		.replace(/'/g, "")
		.replace(/\n/g, " ")
		.replace(/Action[:：]/g, "Action -");
	return `Summary: 请求用户介入\nThought: ${sanitized}\nAction: call_user(content='${sanitized}')`;
}
