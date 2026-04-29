import { tool } from "@langchain/core/tools";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { CreatorAgentService } from "../../creator-agent/creator-agent.service";

/**
 *
 */
@Injectable()
export class ContentCreationToolService {
	private readonly logger = new Logger(ContentCreationToolService.name);

	constructor(private readonly creatorAgentService: CreatorAgentService) {}

	/**
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
					return content || "Content creation returned no result. Please retry.";
				} catch (error) {
					this.logger.error(
						`Content creation failed: ${(error as Error).message}`,
					);
					return `Content creation failed: ${(error as Error).message}`;
				}
			},
			{
				name: "generate_content",
				description: `Content creation tool. Use when writing comments, replies, direct messages, posts, or articles.
Input is a natural-language description that includes the creation scenario, purpose, current app/platform, relevant context such as post/comment/background, and approximate length.
The tool returns text that can be posted directly.`,
				schema: z.object({
					request: z.string().describe("Natural-language content creation request"),
				}),
			},
		);
	}
}
