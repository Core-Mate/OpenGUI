import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import type { ResearchResult } from "../types";

/**
 * Content Research Tool
 */
@Injectable()
export class ContentResearchToolService {
	private readonly logger = new Logger(ContentResearchToolService.name);

	/**
	 */
	getToolDefinition() {
		return {
				name: "research_content",
				description:
					"Research and analyze content for a topic. Analyze multiple sources, extract key information, and generate a research summary.",
			inputSchema: z.object({
				topic: z.string().describe("Research topic"),
				sources: z
					.array(
						z.object({
								url: z.string().describe("Source URL"),
								title: z.string().describe("Source title"),
								content: z.string().describe("Source content"),
						}),
					)
						.describe("Source list to analyze"),
				focusAreas: z
					.array(z.string())
					.optional()
						.describe("Focus areas"),
			}),
			handler: this.research.bind(this),
		};
	}

	/**
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
							text: `Research analysis failed: ${error instanceof Error ? error.message : "unknown error"}`,
					},
				],
				isError: true,
			};
		}
	}

	/**
	 */
	private extractSummary(content: string): string {


		const cleanContent = content.replace(/\s+/g, " ").trim();
		if (cleanContent.length <= 200) {
			return cleanContent;
		}
		return cleanContent.substring(0, 200) + "...";
	}

	/**
	 */
	private extractKeyPoints(
		content: string,
		focusAreas?: string[],
	): string[] {


		const sentences = content
			.split(/[。！？.!?]/)
			.filter((s) => s.trim().length > 10)
			.slice(0, 5);

		if (focusAreas && focusAreas.length > 0) {

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
	 */
	private calculateRelevance(content: string, topic: string): number {


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
	 */
	private generateReport(
		topic: string,
		results: ResearchResult[],
		focusAreas?: string[],
	): string {
		let report = `# Research report: ${topic}\n\n`;

		if (focusAreas && focusAreas.length > 0) {
				report += `**Focus areas**: ${focusAreas.join(", ")}\n\n`;
		}

		report += `## Source analysis (${results.length} source(s))\n\n`;

		for (const [index, result] of results.entries()) {
			report += `### ${index + 1}. ${result.sourceTitle}\n`;
			report += `- **Source**: ${result.sourceUrl}\n`;
			report += `- **Relevance**: ${(result.relevanceScore * 100).toFixed(0)}%\n`;
			report += `- **Summary**: ${result.summary}\n`;

			if (result.keyPoints.length > 0) {
				report += "- **Key points**:\n";
				for (const point of result.keyPoints) {
					report += `  - ${point.trim()}\n`;
				}
			}
			report += "\n";
		}

		return report;
	}
}
