import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { ContentPlatform } from "../types";

/**
 * Platform Formatter Tool
 * 平台格式化工具 - 根据目标平台调整内容格式
 */
@Injectable()
export class PlatformFormatterToolService {
	private readonly logger = new Logger(PlatformFormatterToolService.name);

	/**
	 * 平台限制配置
	 */
	private readonly platformLimits: Record<
		ContentPlatform,
		{
			maxLength: number;
			allowImages: boolean;
			allowLinks: boolean;
			allowHashtags: boolean;
			allowMentions: boolean;
			formatNotes: string;
		}
	> = {
		[ContentPlatform.WECHAT_ARTICLE]: {
			maxLength: 20000,
			allowImages: true,
			allowLinks: false, // 公众号外链有限制
			allowHashtags: false,
			allowMentions: false,
			formatNotes: "支持富文本，建议使用分段、小标题、引用等格式",
		},
		[ContentPlatform.WECHAT_COMMENT]: {
			maxLength: 600,
			allowImages: false,
			allowLinks: false,
			allowHashtags: false,
			allowMentions: true,
			formatNotes: "纯文本，简洁明了",
		},
		[ContentPlatform.TWITTER_POST]: {
			maxLength: 280,
			allowImages: true,
			allowLinks: true,
			allowHashtags: true,
			allowMentions: true,
			formatNotes: "简短有力，善用 hashtags 和 @mentions",
		},
		[ContentPlatform.TWITTER_REPLY]: {
			maxLength: 280,
			allowImages: true,
			allowLinks: true,
			allowHashtags: true,
			allowMentions: true,
			formatNotes: "回复要有针对性，保持对话感",
		},
		[ContentPlatform.REDDIT_POST]: {
			maxLength: 40000,
			allowImages: true,
			allowLinks: true,
			allowHashtags: false,
			allowMentions: true,
			formatNotes: "支持 Markdown，标题要吸引人",
		},
		[ContentPlatform.REDDIT_COMMENT]: {
			maxLength: 10000,
			allowImages: false,
			allowLinks: true,
			allowHashtags: false,
			allowMentions: true,
			formatNotes: "支持 Markdown，建议有理有据",
		},
		[ContentPlatform.DIRECT_MESSAGE]: {
			maxLength: 2000,
			allowImages: true,
			allowLinks: true,
			allowHashtags: false,
			allowMentions: false,
			formatNotes: "私密对话，语气友好自然",
		},
		[ContentPlatform.SOCIAL_COMMENT]: {
			maxLength: 500,
			allowImages: false,
			allowLinks: false,
			allowHashtags: true,
			allowMentions: true,
			formatNotes: "通用社媒评论格式",
		},
	};

	/**
	 * 获取工具定义 (用于 MCP Server)
	 */
	getToolDefinition() {
		return {
			name: "format_for_platform",
			description:
				"根据目标平台格式化内容。自动调整长度、格式和风格以适应平台要求。",
			inputSchema: z.object({
				content: z.string().describe("要格式化的内容"),
				platform: z
					.enum([
						"wechat_article",
						"wechat_comment",
						"twitter_post",
						"twitter_reply",
						"reddit_post",
						"reddit_comment",
						"direct_message",
						"social_comment",
					])
					.describe("目标平台"),
				preserveLinks: z
					.boolean()
					.optional()
					.default(true)
					.describe("是否保留链接"),
				addHashtags: z
					.array(z.string())
					.optional()
					.describe("要添加的 hashtags"),
			}),
			handler: this.format.bind(this),
		};
	}

	/**
	 * 格式化内容
	 */
	async format(args: {
		content: string;
		platform: string;
		preserveLinks?: boolean;
		addHashtags?: string[];
	}): Promise<{
		content: Array<{ type: "text"; text: string }>;
		isError?: boolean;
	}> {
		const {
			content,
			platform,
			preserveLinks = true,
			addHashtags,
		} = args;

		const platformKey = platform as ContentPlatform;
		const limits = this.platformLimits[platformKey];

		if (!limits) {
			return {
				content: [
					{
						type: "text",
						text: `不支持的平台: ${platform}`,
					},
				],
				isError: true,
			};
		}

		this.logger.log(`Formatting content for platform: ${platform}`);

		try {
			let formatted = content;

			// 处理链接
			if (!limits.allowLinks && !preserveLinks) {
				formatted = this.removeLinks(formatted);
			}

			// 处理 hashtags
			if (!limits.allowHashtags) {
				formatted = this.removeHashtags(formatted);
			} else if (addHashtags && addHashtags.length > 0) {
				formatted = this.addHashtags(formatted, addHashtags);
			}

			// 处理长度
			if (formatted.length > limits.maxLength) {
				formatted = this.truncateContent(formatted, limits.maxLength);
			}

			// 生成格式化报告
			const report = this.generateReport(
				formatted,
				platformKey,
				limits,
				content.length,
			);

			return {
				content: [
					{
						type: "text",
						text: report,
					},
				],
			};
		} catch (error) {
			this.logger.error(`Format failed: ${error}`);
			return {
				content: [
					{
						type: "text",
						text: `格式化失败: ${error instanceof Error ? error.message : "未知错误"}`,
					},
				],
				isError: true,
			};
		}
	}

	/**
	 * 获取平台限制信息
	 */
	getPlatformLimits(platform: ContentPlatform) {
		return this.platformLimits[platform];
	}

	/**
	 * 移除链接
	 */
	private removeLinks(content: string): string {
		return content.replace(/https?:\/\/[^\s]+/g, "[链接]");
	}

	/**
	 * 移除 hashtags
	 */
	private removeHashtags(content: string): string {
		return content.replace(/#\w+/g, "").replace(/\s+/g, " ").trim();
	}

	/**
	 * 添加 hashtags
	 */
	private addHashtags(content: string, hashtags: string[]): string {
		const tags = hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`));
		return `${content}\n\n${tags.join(" ")}`;
	}

	/**
	 * 截断内容
	 */
	private truncateContent(content: string, maxLength: number): string {
		if (content.length <= maxLength) {
			return content;
		}

		// 尝试在句子边界截断
		const truncated = content.substring(0, maxLength - 3);
		const lastPeriod = Math.max(
			truncated.lastIndexOf("。"),
			truncated.lastIndexOf("."),
			truncated.lastIndexOf("！"),
			truncated.lastIndexOf("!"),
		);

		if (lastPeriod > maxLength * 0.8) {
			return truncated.substring(0, lastPeriod + 1);
		}

		return truncated + "...";
	}

	/**
	 * 生成格式化报告
	 */
	private generateReport(
		formatted: string,
		platform: ContentPlatform,
		limits: (typeof this.platformLimits)[ContentPlatform],
		originalLength: number,
	): string {
		const stats = {
			originalLength,
			formattedLength: formatted.length,
			maxAllowed: limits.maxLength,
			withinLimit: formatted.length <= limits.maxLength,
		};

		let report = `## 格式化结果\n\n`;
		report += `**目标平台**: ${platform}\n`;
		report += `**原始长度**: ${stats.originalLength} 字符\n`;
		report += `**格式化后**: ${stats.formattedLength} 字符\n`;
		report += `**平台限制**: ${stats.maxAllowed} 字符\n`;
		report += `**状态**: ${stats.withinLimit ? "✅ 符合要求" : "⚠️ 超出限制"}\n\n`;
		report += `**格式说明**: ${limits.formatNotes}\n\n`;
		report += `---\n\n`;
		report += `### 格式化内容\n\n${formatted}`;

		return report;
	}
}
