import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

/**
 * Web Search Tool
 * 网络搜索工具 - 用于搜索网络资料获取创作素材
 */
@Injectable()
export class WebSearchToolService {
	private readonly logger = new Logger(WebSearchToolService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * 获取工具定义 (用于 MCP Server)
	 */
	getToolDefinition() {
		return {
			name: "web_search",
			description:
				"搜索网络获取相关资料。用于研究主题、获取最新信息、查找参考素材。",
			inputSchema: z.object({
				query: z.string().describe("搜索关键词"),
				maxResults: z
					.number()
					.min(1)
					.max(10)
					.optional()
					.default(5)
					.describe("最大结果数量"),
				language: z
					.enum(["zh", "en"])
					.optional()
					.default("zh")
					.describe("搜索语言偏好"),
			}),
			handler: this.search.bind(this),
		};
	}

	/**
	 * 执行搜索
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
			// TODO: 集成实际的搜索 API (如 Serper, Tavily, Bing 等)
			// 这里提供一个模拟实现框架
			const results = await this.performSearch(query, maxResults, language);

			const formattedResults = results
				.map(
					(r, i) =>
						`[${i + 1}] ${r.title}\n   URL: ${r.url}\n   摘要: ${r.snippet}`,
				)
				.join("\n\n");

			return {
				content: [
					{
						type: "text",
						text: `搜索 "${query}" 的结果:\n\n${formattedResults}`,
					},
				],
			};
		} catch (error) {
			this.logger.error(`Search failed: ${error}`);
			return {
				content: [
					{
						type: "text",
						text: `搜索失败: ${error instanceof Error ? error.message : "未知错误"}`,
					},
				],
				isError: true,
			};
		}
	}

	/**
	 * 执行实际搜索 (需要集成搜索 API)
	 */
	private async performSearch(
		query: string,
		maxResults: number,
		language: string,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		// TODO: 实现实际的搜索逻辑
		// 可以集成:
		// - Serper API (Google Search)
		// - Tavily API
		// - Bing Search API
		// - 自建搜索服务

		// 模拟返回 - 实际使用时替换
		this.logger.warn("Using mock search results - integrate real search API");

		return [
			{
				title: `关于 "${query}" 的搜索结果`,
				url: "https://example.com/result1",
				snippet: `这是关于 ${query} 的相关内容摘要...`,
			},
		];
	}
}
