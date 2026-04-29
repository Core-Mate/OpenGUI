import { BaseMessage } from "@langchain/core/messages";

/**
 */
export function extractMessageContent(message: BaseMessage): string {
	const content = message.content;
	if (typeof content === "string" && content.trim() !== "") {
		return content;
	}
	if (Array.isArray(content)) {

		const hasImage = content.some(
			(item) =>
				typeof item === "object" && "type" in item && item.type === "image_url",
		);
		if (hasImage) {
			return "[screenshot]";
		}

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
 *
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

			const truncated =
				content.length > 500 ? `${content.substring(0, 500)}...` : content;
			return `${typeLabel} ${truncated}`;
		})
		.join("\n");
}
