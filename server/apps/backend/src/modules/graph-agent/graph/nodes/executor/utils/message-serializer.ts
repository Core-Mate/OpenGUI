import { BaseMessage } from "@langchain/core/messages";

/**
 * 将消息内容提取为文本
 */
export function extractMessageContent(message: BaseMessage): string {
	const content = message.content;
	if (typeof content === "string" && content.trim() !== "") {
		return content;
	}
	if (Array.isArray(content)) {
		// 检查是否包含图片
		const hasImage = content.some(
			(item) =>
				typeof item === "object" && "type" in item && item.type === "image_url",
		);
		if (hasImage) {
			return "[screenshot]";
		}
		// 提取文本内容
		return content
			.filter(
				(item): item is { type: "text"; text: string } =>
					typeof item === "object" &&
					item !== null &&
					"type" in item &&
					item.type === "text" &&
					"text" in item &&
					typeof item.text === "string",
			)
			.map((item) => item.text)
			.join("");
	}
	return "";
}

/**
 * 序列化消息历史为文本格式
 *
 * @param messages 消息列表
 * @param limit 最大消息数量
 * @returns 格式化的消息历史文本
 */
export function serializeMessages(
	messages: BaseMessage[],
	limit: number,
): string {
	const recentMessages = messages.slice(-limit);
	return recentMessages
		.filter((msg) => msg.type !== "system")
		.map((msg) => {
			const type = msg.type;
			const typeLabel =
				type === "system"
					? "[System]"
					: type === "human"
						? "[Human]"
						: type === "ai"
							? "[AI]"
							: `[${type}]`;
			const content = extractMessageContent(msg);
			// 截断过长的内容
			const truncated =
				content.length > 500 ? `${content.substring(0, 500)}...` : content;
			return `${typeLabel} ${truncated}`;
		})
		.join("\n");
}
