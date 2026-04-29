import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

/**
 * Web Search Tool
 */
@Injectable()
export class WebSearchToolService {
	private readonly logger = new Logger(WebSearchToolService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 */
	getToolDefinition() {
		return {
			name: "web_search",
			description:
				"Search the web for relevant material. Use this for topic research, latest information, and reference material.",
			inputSchema: z.object({
				query: z.string().describe("Search keyword"),
				maxResults: z
					.number()
					.min(1)
					.max(10)
					.optional()
					.default(5)
					.describe("Maximum number of results"),
				language: z
					.enum(["zh", "en"])
					.optional()
					.default("zh")
					.describe("Search language preference"),
			}),
			handler: this.search.bind(this),
		};
	}

	/**
	 */
	async search(args: {
		query: string;
		maxResults?: number;
		language?: "zh" | "en";
	}): Promise<{
		content: Array<{ type: "text"; text: string }>;
		isError?: boolean;
	}> {
		const { query, maxResults = 5, language = "zh" } = args;

		this.logger.log(`Web search: "${query}" (max: ${maxResults}, lang: ${language})`);

		try {


			const results = await this.performSearch(query, maxResults, language);

			const formattedResults = results
				.map(
					(r, i) =>
						`[${i + 1}] ${r.title}\n   URL: ${r.url}\n   Summary: ${r.snippet}`,
				)
				.join("\n\n");

			return {
				content: [
					{
						type: "text",
						text: `Search results for "${query}":\n\n${formattedResults}`,
					},
				],
			};
		} catch (error) {
			this.logger.error(`Search failed: ${error}`);
			return {
				content: [
					{
						type: "text",
						text: `Search failed: ${error instanceof Error ? error.message : "unknown error"}`,
					},
				],
				isError: true,
			};
		}
	}

	/**
	 */
	private async performSearch(
		query: string,
		maxResults: number,
		language: string,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {


		// - Serper API (Google Search)
		// - Tavily API
		// - Bing Search API



		this.logger.warn("Using mock search results - integrate real search API");

		return [
			{
				title: `Search result for "${query}"`,
				url: "https://example.com/result1",
				snippet: `Relevant summary about ${query}...`,
			},
		];
	}
}
