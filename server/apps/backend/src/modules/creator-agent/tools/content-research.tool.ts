import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import type { ResearchResult } from "../types";

/**
 * Content Research Tool
 * 内容研究工具 - 聚合和分析研究资料
 */
@Injectable()
export class ContentResearchToolService {
	private readonly logger = new Logger(ContentResearchToolService.name);

	/**
	 * 获取工具定义 (用于 MCP Server)
	 */
	getToolDefinition() {
		return {
			name: "research_content",
			description:
				"研究和分析指定主题的内容。分析多个来源，提取关键信息，生成研究摘要。",
			inputSchema: z.object({
				topic: z.string().describe("研究主题"),
				sources: z
					.array(
						z.object({
							url: z.string().describe("来源URL"),
							title: z.string().describe("来源标题"),
							content: z.string().describe("来源内容"),
						}),
					)
					.describe("要分析的来源列表"),
				focusAreas: z
					.array(z.string())
					.optional()
					.describe("重点关注的方面"),
			}),
			handler: this.research.bind(this),
		};
	}

	/**
	 * 执行研究分析
	 */
	async research(args: {
		topic: string;
		sources: Array<{ url: string; title: string; content: string }>;
		focusAreas?: string[];
	}): Promise<{
		content: Array<{ type: "text"; text: string }>;
		isError?: boolean;
	}> {
		const { topic, sources, focusAreas } = args;

		this.logger.log(
			`Researching topic: "${topic}" with ${sources.length} sources`,
		);

		try {
			const results: ResearchResult[] = sources.map((source) => ({
				sourceUrl: source.url,
				sourceTitle: source.title,
				summary: this.extractSummary(source.content),
				keyPoints: this.extractKeyPoints(source.content, focusAreas),
				relevanceScore: this.calculateRelevance(source.content, topic),
			}));

			// 按相关性排序
			results.sort((a, b) => b.relevanceScore - a.relevanceScore);

			const report = this.generateReport(topic, results, focusAreas);

			return {
				content: [
					{
						type: "text",
						text: report,
					},
				],
			};
		} catch (error) {
			this.logger.error(`Research failed: ${error}`);
			return {
				content: [
					{
						type: "text",
						text: `研究分析失败: ${error instanceof Error ? error.message : "未知错误"}`,
					},
				],
				isError: true,
			};
		}
	}

	/**
	 * 提取内容摘要
	 */
	private extractSummary(content: string): string {
		// 简单的摘要提取 - 取前 200 字符
		// 实际可以使用更复杂的算法或 AI 摘要
		const cleanContent = content.replace(/\s+/g, " ").trim();
		if (cleanContent.length <= 200) {
			return cleanContent;
		}
		return cleanContent.substring(0, 200) + "...";
	}

	/**
	 * 提取关键要点
	 */
	private extractKeyPoints(
		content: string,
		focusAreas?: string[],
	): string[] {
		// 简单的关键点提取 - 基于句子分割
		// 实际可以使用 NLP 或 AI 提取
		const sentences = content
			.split(/[。！？.!?]/)
			.filter((s) => s.trim().length > 10)
			.slice(0, 5);

		if (focusAreas && focusAreas.length > 0) {
			// 优先返回包含重点关注词的句子
			const focused = sentences.filter((s) =>
				focusAreas.some((area) =>
					s.toLowerCase().includes(area.toLowerCase()),
				),
			);
			if (focused.length > 0) {
				return focused.slice(0, 3);
			}
		}

		return sentences.slice(0, 3);
	}

	/**
	 * 计算相关性评分
	 */
	private calculateRelevance(content: string, topic: string): number {
		// 简单的关键词匹配相关性计算
		// 实际可以使用语义相似度等更高级方法
		const topicWords = topic.toLowerCase().split(/\s+/);
		const contentLower = content.toLowerCase();

		let matchCount = 0;
		for (const word of topicWords) {
			if (word.length > 1 && contentLower.includes(word)) {
				matchCount++;
			}
		}

		return Math.min(matchCount / topicWords.length, 1);
	}

	/**
	 * 生成研究报告
	 */
	private generateReport(
		topic: string,
		results: ResearchResult[],
		focusAreas?: string[],
	): string {
		let report = `# 研究报告: ${topic}\n\n`;

		if (focusAreas && focusAreas.length > 0) {
			report += `**重点关注**: ${focusAreas.join(", ")}\n\n`;
		}

		report += `## 来源分析 (共 ${results.length} 个来源)\n\n`;

		for (const [index, result] of results.entries()) {
			report += `### ${index + 1}. ${result.sourceTitle}\n`;
			report += `- **来源**: ${result.sourceUrl}\n`;
			report += `- **相关性**: ${(result.relevanceScore * 100).toFixed(0)}%\n`;
			report += `- **摘要**: ${result.summary}\n`;

			if (result.keyPoints.length > 0) {
				report += "- **关键要点**:\n";
				for (const point of result.keyPoints) {
					report += `  - ${point.trim()}\n`;
				}
			}
			report += "\n";
		}

		return report;
	}
}
