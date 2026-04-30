import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { ContentPlatform } from "../types";

/**
 * Platform Formatter Tool
 */
@Injectable()
export class PlatformFormatterToolService {
	private readonly logger = new Logger(PlatformFormatterToolService.name);

	/**
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
			allowLinks: false,
			allowHashtags: false,
			allowMentions: false,
				formatNotes: "Supports rich text; use sections, subheadings, and quotes when helpful",
		},
		[ContentPlatform.WECHAT_COMMENT]: {
			maxLength: 600,
			allowImages: false,
			allowLinks: false,
			allowHashtags: false,
			allowMentions: true,
				formatNotes: "Plain text; keep it concise and clear",
		},
		[ContentPlatform.TWITTER_POST]: {
			maxLength: 280,
			allowImages: true,
			allowLinks: true,
			allowHashtags: true,
			allowMentions: true,
				formatNotes: "Short and punchy; use hashtags and @mentions well",
		},
		[ContentPlatform.TWITTER_REPLY]: {
			maxLength: 280,
			allowImages: true,
			allowLinks: true,
			allowHashtags: true,
			allowMentions: true,
				formatNotes: "Targeted reply with a conversational tone",
		},
		[ContentPlatform.REDDIT_POST]: {
			maxLength: 40000,
			allowImages: true,
			allowLinks: true,
			allowHashtags: false,
			allowMentions: true,
				formatNotes: "Supports Markdown; use an engaging title",
		},
		[ContentPlatform.REDDIT_COMMENT]: {
			maxLength: 10000,
			allowImages: false,
			allowLinks: true,
			allowHashtags: false,
			allowMentions: true,
				formatNotes: "Supports Markdown; keep it well-reasoned",
		},
		[ContentPlatform.DIRECT_MESSAGE]: {
			maxLength: 2000,
			allowImages: true,
			allowLinks: true,
			allowHashtags: false,
			allowMentions: false,
				formatNotes: "Private conversation; keep the tone friendly and natural",
		},
		[ContentPlatform.SOCIAL_COMMENT]: {
			maxLength: 500,
			allowImages: false,
			allowLinks: false,
			allowHashtags: true,
			allowMentions: true,
				formatNotes: "General social-media comment format",
		},
	};

	/**
	 */
	getToolDefinition() {
		return {
				name: "format_for_platform",
				description:
					"Format content for the target platform. Automatically adjust length, format, and style for platform requirements.",
				inputSchema: z.object({
					content: z.string().describe("Content to format"),
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
						.describe("Target platform"),
				preserveLinks: z
					.boolean()
					.optional()
					.default(true)
					.describe("Whether to keep links"),
				addHashtags: z
					.array(z.string())
					.optional()
						.describe("Hashtags to add"),
			}),
			handler: this.format.bind(this),
		};
	}

	/**
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
							text: `Unsupported platform: ${platform}`,
					},
				],
				isError: true,
			};
		}

		this.logger.log(`Formatting content for platform: ${platform}`);

		try {
			let formatted = content;


			if (!limits.allowLinks && !preserveLinks) {
				formatted = this.removeLinks(formatted);
			}


			if (!limits.allowHashtags) {
				formatted = this.removeHashtags(formatted);
			} else if (addHashtags && addHashtags.length > 0) {
				formatted = this.addHashtags(formatted, addHashtags);
			}


			if (formatted.length > limits.maxLength) {
				formatted = this.truncateContent(formatted, limits.maxLength);
			}


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
							text: `Formatting failed: ${error instanceof Error ? error.message : "unknown error"}`,
					},
				],
				isError: true,
			};
		}
	}

	/**
	 */
	getPlatformLimits(platform: ContentPlatform) {
		return this.platformLimits[platform];
	}

	/**
	 */
	private removeLinks(content: string): string {
			return content.replace(/https?:\/\/[^\s]+/g, "[link]");
	}

	/**
	 */
	private removeHashtags(content: string): string {
		return content.replace(/#\w+/g, "").replace(/\s+/g, " ").trim();
	}

	/**
	 */
	private addHashtags(content: string, hashtags: string[]): string {
		const tags = hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`));
		return `${content}\n\n${tags.join(" ")}`;
	}

	/**
	 */
	private truncateContent(content: string, maxLength: number): string {
		if (content.length <= maxLength) {
			return content;
		}


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

			let report = `## Formatting Result\n\n`;
			report += `**Target platform**: ${platform}\n`;
			report += `**Original length**: ${stats.originalLength} characters\n`;
			report += `**Formatted length**: ${stats.formattedLength} characters\n`;
			report += `**Platform limit**: ${stats.maxAllowed} characters\n`;
			report += `**Status**: ${stats.withinLimit ? "✅ Within limit" : "⚠️ Over limit"}\n\n`;
			report += `**Format notes**: ${limits.formatNotes}\n\n`;
		report += `---\n\n`;
			report += `### Formatted Content\n\n${formatted}`;

		return report;
	}
}
