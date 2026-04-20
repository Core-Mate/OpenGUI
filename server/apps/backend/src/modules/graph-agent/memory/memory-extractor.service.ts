import { ChatAnthropic } from "@langchain/anthropic";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { AgentConfigProvider } from "../config/agent-config.provider";
import { AgentName } from "../config/types";
import type { MemorySource } from "./task-memory.service";

/**
 * 来源类型对应的提取提示
 */
const SOURCE_EXTRACTION_HINTS: Record<MemorySource, string> = {
	feedback:
		"这是用户在任务执行过程中提供的反馈。请重点提取用户的偏好、不满意的地方、期望的改进等。",
	instruction:
		"这是用户在继续执行任务时追加的指令。请重点提取用户的新需求、补充说明、调整方向等。",
	summary:
		"这是任务执行完成后的总结。请重点提取执行过程中的经验教训、成功模式、可复用的策略等。",
};

/**
 * 记忆提取服务
 *
 * 使用 ACTION_SUMMARIZER 配置的模型从原始内容中提取与任务执行相关的关键信息
 */
@Injectable()
export class MemoryExtractorService {
	private readonly logger = new Logger(MemoryExtractorService.name);

	constructor(
		private readonly configProvider: AgentConfigProvider,
		private readonly prismaService: PrismaService,
	) {}

	/**
	 * 从内容中提取关键记忆信息
	 *
	 * @param params 提取参数
	 * @returns 提取后的关键信息字符串
	 */
	async extractMemory(params: {
		userInput: string;
		content: string;
		source: MemorySource;
		userId: number;
	}): Promise<string> {
		const { userInput, content, source, userId } = params;

		if (!content || !content.trim()) {
			return "";
		}

		try {
			// 通过 userId 获取用户地区
			const user = await this.prismaService.users.findUnique({
				where: { id: userId },
				select: { region: true },
			});
			const userRegion = user?.region || "CN";

			// 复用 ACTION_SUMMARIZER 的模型配置
			const modelConfig = await this.configProvider.getModelConfig(
				AgentName.ACTION_SUMMARIZER,
				userRegion,
			);

			// 创建主模型
			const primaryModel = new ChatAnthropic({
				model: modelConfig.model,
				apiKey: modelConfig.apiKey,
				temperature: modelConfig.temperature ?? 0.1,
				clientOptions: {
					baseURL: modelConfig.baseURL,
					maxRetries: 2,
					timeout: 30000,
					authToken: null,
				},
			});

			const model = primaryModel;

			const sourceHint = SOURCE_EXTRACTION_HINTS[source];

			const systemPrompt = `你是一个专业的任务执行记忆提取助手。你的任务是从用户反馈、追加指令或执行总结中提取对未来任务执行有价值的关键信息，方便后续执行任务时可以借鉴这些经验。

提取原则：
1. 只提取与任务执行相关的信息，忽略无关内容
2. 关注用户偏好、优化建议、下一步行动提示
3. 信息要简洁精炼，便于后续快速参考
4. 使用纯文本输出同一任务后续再次执行时可以借鉴的关键记忆，不要包含任何格式标记或无关内容`;

			const userPrompt = `${sourceHint}

## 用户原始任务
${userInput}

## 待提取内容
${content}

---
请根据上述内容，提取同一任务后续再次执行时可以借鉴的关键记忆（150字左右）。直接输出纯文本内容。`;

			const response = await model.invoke([
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			]);

			// 获取纯文本响应
			const extractedMemory =
				typeof response.content === "string" ? response.content.trim() : "";

			if (extractedMemory) {
				this.logger.debug(
					`Extracted memory from ${source}: ${extractedMemory.substring(0, 100)}...`,
				);
			}

			return extractedMemory;
		} catch (error) {
			this.logger.warn(`Failed to extract memory: ${(error as Error).message}`);
			// 提取失败时返回原始内容的摘要（截取前 300 字符）
			return content.length > 300 ? `${content.substring(0, 300)}...` : content;
		}
	}
}
