import { tool } from "@langchain/core/tools";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { CreatorAgentService } from "../../creator-agent/creator-agent.service";

/**
 * 内容创作工具服务
 *
 * 将 CreatorAgentService 封装为 LangChain tool，
 * 供 VLM 在识别到内容创作场景时调用
 */
@Injectable()
export class ContentCreationToolService {
	private readonly logger = new Logger(ContentCreationToolService.name);

	constructor(private readonly creatorAgentService: CreatorAgentService) {}

	/**
	 * 创建内容创作工具
	 */
	createTool() {
		return tool(
			async (input: { request: string }): Promise<string> => {
				this.logger.log(
					`Creating content: "${input.request.substring(0, 100)}..."`,
				);

				try {
					const content =
						await this.creatorAgentService.generateFromDescription(
							input.request,
						);
					return content || "内容创作未返回结果，请重试";
				} catch (error) {
					this.logger.error(
						`Content creation failed: ${(error as Error).message}`,
					);
					return `内容创作失败: ${(error as Error).message}`;
				}
			},
			{
				name: "generate_content",
				description: `内容创作工具。当需要进行内容创作时使用（评论、回帖、发送私信、发帖、发布文章等）。
输入是一段自然语言描述，需要包含：创作场景、创作目的、当前APP/平台、相关上下文（帖子内容/评论/背景等）、大约字数。
工具返回可以直接发布的内容文本。`,
				schema: z.object({
					request: z.string().describe("自然语言描述的创作需求"),
				}),
			},
		);
	}
}
