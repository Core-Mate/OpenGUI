import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	Sse,
} from "@nestjs/common";
import {
	ApiOperation,
	ApiProperty,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";

import { Observable, Subject } from "rxjs";
import { finalize, map } from "rxjs/operators";

import { CreatorAgentService } from "./creator-agent.service";
import { SkillSyncService } from "./skill-sync.service";
import {
	ContentOutputDto,
	CreateContentDto,
	OptimizeSkillDto,
	PolishContentDto,
	ResearchContentDto,
	ResearchResponseDto,
	StreamMessageDto,
} from "./dto";

/**
 * 测试接口 DTO
 */
class GenerateFromDescriptionDto {
	@ApiProperty({
		description: "自然语言描述的创作需求",
		example:
			"在小红书上对一篇关于露营装备清单的笔记发表评论，帖子推荐了帐篷、睡袋和炊具，评论区在讨论性价比。目的是分享露营经验并推荐便携炉具，大约50字",
	})
	description: string;

	@ApiProperty({
		description: "自定义 System Prompt（可选，不传则使用默认）",
		required: false,
	})
	systemPrompt?: string;

	@ApiProperty({
		description: "选中的 Skill ID 列表（可选），对应 Skill 内容会拼入 System Prompt",
		required: false,
		type: [Number],
	})
	skillIds?: number[];
}

/**
 * Creator Agent Controller
 * 内容创作 Agent API 接口
 */
@ApiTags("Creator Agent")
@Controller("creator-agent")
export class CreatorAgentController {
	private readonly logger = new Logger(CreatorAgentController.name);

	constructor(
		private readonly creatorAgentService: CreatorAgentService,
		private readonly skillSyncService: SkillSyncService,
	) {}

	/**
	 * 生成内容 (流式 SSE)
	 */
	@Post("generate/stream")
	@HttpCode(HttpStatus.OK)
	@Sse()
	@ApiOperation({
		summary: "生成内容 (流式)",
		description: "使用 SSE 流式返回内容生成过程",
	})
	@ApiResponse({
		status: 200,
		description: "流式返回生成内容",
		type: StreamMessageDto,
	})
	generateContentStream(
		@Body() dto: CreateContentDto,
	): Observable<MessageEvent<StreamMessageDto>> {
		this.logger.log(`Stream generate request: ${dto.topic}`);

		const subject = new Subject<MessageEvent<StreamMessageDto>>();

		// 异步处理生成流
		(async () => {
			try {
				for await (const message of this.creatorAgentService.generateContent(
					dto,
				)) {
					subject.next({
						data: message,
					} as MessageEvent<StreamMessageDto>);
				}
				subject.complete();
			} catch (error) {
				this.logger.error("Stream generation error:", error);
				subject.next({
					data: {
						type: "error",
						content: error instanceof Error ? error.message : "未知错误",
					},
				} as MessageEvent<StreamMessageDto>);
				subject.complete();
			}
		})();

		return subject.asObservable();
	}

	/**
	 * 生成内容 (同步)
	 */
	@Post("generate")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "生成内容",
		description: "同步返回完整的生成内容",
	})
	@ApiResponse({
		status: 200,
		description: "生成的内容",
		type: ContentOutputDto,
	})
	async generateContent(
		@Body() dto: CreateContentDto,
	): Promise<ContentOutputDto> {
		this.logger.log(`Generate request: ${dto.topic}`);

		const result = await this.creatorAgentService.generateContentSync(dto);

		return result as ContentOutputDto;
	}

	/**
	 * 润色内容 (流式 SSE)
	 */
	@Post("polish/stream")
	@HttpCode(HttpStatus.OK)
	@Sse()
	@ApiOperation({
		summary: "润色内容 (流式)",
		description: "使用 SSE 流式返回润色过程",
	})
	@ApiResponse({
		status: 200,
		description: "流式返回润色内容",
		type: StreamMessageDto,
	})
	polishContentStream(
		@Body() dto: PolishContentDto,
	): Observable<MessageEvent<StreamMessageDto>> {
		this.logger.log(`Stream polish request for platform: ${dto.platform}`);

		const subject = new Subject<MessageEvent<StreamMessageDto>>();

		(async () => {
			try {
				for await (const message of this.creatorAgentService.polishContent(
					dto,
				)) {
					subject.next({
						data: message,
					} as MessageEvent<StreamMessageDto>);
				}
				subject.complete();
			} catch (error) {
				this.logger.error("Stream polish error:", error);
				subject.next({
					data: {
						type: "error",
						content: error instanceof Error ? error.message : "未知错误",
					},
				} as MessageEvent<StreamMessageDto>);
				subject.complete();
			}
		})();

		return subject.asObservable();
	}

	/**
	 * 润色内容 (同步)
	 */
	@Post("polish")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "润色内容",
		description: "同步返回润色后的内容",
	})
	@ApiResponse({
		status: 200,
		description: "润色后的内容",
		type: ContentOutputDto,
	})
	async polishContent(
		@Body() dto: PolishContentDto,
	): Promise<{ content: string }> {
		this.logger.log(`Polish request for platform: ${dto.platform}`);

		let finalContent = "";

		for await (const message of this.creatorAgentService.polishContent(dto)) {
			if (message.type === "final") {
				finalContent = message.content;
			} else if (message.type === "error") {
				throw new Error(message.content);
			}
		}

		return { content: finalContent };
	}

	/**
	 * 研究主题 (流式 SSE)
	 */
	@Post("research/stream")
	@HttpCode(HttpStatus.OK)
	@Sse()
	@ApiOperation({
		summary: "研究主题 (流式)",
		description: "使用 SSE 流式返回研究过程",
	})
	@ApiResponse({
		status: 200,
		description: "流式返回研究结果",
		type: StreamMessageDto,
	})
	researchTopicStream(
		@Body() dto: ResearchContentDto,
	): Observable<MessageEvent<StreamMessageDto>> {
		this.logger.log(`Stream research request: ${dto.topic}`);

		const subject = new Subject<MessageEvent<StreamMessageDto>>();

		(async () => {
			try {
				for await (const message of this.creatorAgentService.researchTopic(
					dto,
				)) {
					subject.next({
						data: message,
					} as MessageEvent<StreamMessageDto>);
				}
				subject.complete();
			} catch (error) {
				this.logger.error("Stream research error:", error);
				subject.next({
					data: {
						type: "error",
						content: error instanceof Error ? error.message : "未知错误",
					},
				} as MessageEvent<StreamMessageDto>);
				subject.complete();
			}
		})();

		return subject.asObservable();
	}

	/**
	 * 研究主题 (同步)
	 */
	@Post("research")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "研究主题",
		description: "同步返回完整的研究报告",
	})
	@ApiResponse({
		status: 200,
		description: "研究报告",
		type: ResearchResponseDto,
	})
	async researchTopic(
		@Body() dto: ResearchContentDto,
	): Promise<ResearchResponseDto> {
		this.logger.log(`Research request: ${dto.topic}`);

		let finalContent = "";

		for await (const message of this.creatorAgentService.researchTopic(dto)) {
			if (message.type === "final") {
				finalContent = message.content;
			} else if (message.type === "error") {
				throw new Error(message.content);
			}
		}

		return {
			topic: dto.topic,
			results: [], // TODO: 解析研究结果
			summary: finalContent,
			generatedAt: new Date(),
		};
	}

	/**
	 * 优化 Skill 内容 (流式 SSE)
	 */
	@Post("optimize-skill")
	@HttpCode(HttpStatus.OK)
	@Sse()
	@ApiOperation({
		summary: "优化 Skill 内容 (流式)",
		description: "使用 SSE 流式返回 Skill 优化结果",
	})
	@ApiResponse({
		status: 200,
		description: "流式返回优化后的 Skill 内容",
		type: StreamMessageDto,
	})
	optimizeSkillStream(
		@Body() dto: OptimizeSkillDto,
	): Observable<MessageEvent<StreamMessageDto>> {
		this.logger.log("Optimize skill request");

		const subject = new Subject<MessageEvent<StreamMessageDto>>();

		(async () => {
			try {
				for await (const message of this.creatorAgentService.optimizeSkill(
					dto,
				)) {
					subject.next({
						data: message,
					} as MessageEvent<StreamMessageDto>);
				}
				subject.complete();
			} catch (error) {
				this.logger.error("Stream optimize skill error:", error);
				subject.next({
					data: {
						type: "error",
						content: error instanceof Error ? error.message : "未知错误",
					},
				} as MessageEvent<StreamMessageDto>);
				subject.complete();
			}
		})();

		return subject.asObservable();
	}

	/**
	 * 触发 Skill 文件系统同步
	 * Admin 修改 Skill 后调用此接口通知 Backend 重建 .claude/skills/ 目录
	 */
	@Post("sync-skills")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "同步 Skill 到文件系统",
		description: "从 DB 重建 .claude/skills/ 目录，供 Claude Agent SDK 加载",
	})
	@ApiResponse({ status: 200, description: "同步完成" })
	async syncSkills(): Promise<{ success: boolean; message: string }> {
		this.logger.log("Sync skills request received");
		await this.skillSyncService.syncAllSkills();
		return { success: true, message: "Skills synced" };
	}

	/**
	 * 测试 generateFromDescription 方法（无鉴权）
	 */
	@Post("test/generate-from-description")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "[测试] 从自然语言描述生成内容",
		description:
			"测试接口：直接调用 generateFromDescription，输入自然语言描述，返回生成的内容文本",
	})
	@ApiResponse({ status: 200, description: "生成的内容文本" })
	async testGenerateFromDescription(
		@Body() body: GenerateFromDescriptionDto,
	): Promise<{ content: string }> {
		this.logger.log(
			`[TEST] generateFromDescription: "${body.description.substring(0, 100)}..."`,
		);

		const content = await this.creatorAgentService.generateFromDescription(
			body.description,
			body.systemPrompt,
			body.skillIds,
		);

		return { content };
	}
}
