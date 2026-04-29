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
 * Test endpoint DTO.
 */
class GenerateFromDescriptionDto {
	@ApiProperty({
		description: "Natural-language content creation request",
		example:
			"Comment on a Xiaohongshu post about a camping gear checklist. The post recommends tents, sleeping bags, and cookware, while the comment section discusses value for money. Share camping experience and recommend a portable stove in about 50 words.",
	})
	description: string;

	@ApiProperty({
		description: "Custom system prompt (optional; defaults are used when omitted)",
		required: false,
	})
	systemPrompt?: string;

	@ApiProperty({
		description: "Selected Skill ID list (optional; matching Skill content is appended to the system prompt)",
		required: false,
		type: [Number],
	})
	skillIds?: number[];
}

/**
 * Creator Agent Controller
 * Content-creation Agent API endpoints.
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
	 * Generate content (streaming SSE).
	 */
	@Post("generate/stream")
	@HttpCode(HttpStatus.OK)
	@Sse()
	@ApiOperation({
		summary: "Generate content (streaming)",
		description: "Return the content generation process through SSE streaming",
	})
	@ApiResponse({
		status: 200,
		description: "Stream generated content",
		type: StreamMessageDto,
	})
	generateContentStream(
		@Body() dto: CreateContentDto,
	): Observable<MessageEvent<StreamMessageDto>> {
		this.logger.log(`Stream generate request: ${dto.topic}`);

		const subject = new Subject<MessageEvent<StreamMessageDto>>();

		// Process the generation stream asynchronously.
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
						content: error instanceof Error ? error.message : "unknown error",
					},
				} as MessageEvent<StreamMessageDto>);
				subject.complete();
			}
		})();

		return subject.asObservable();
	}

	/**
	 * Generate content (synchronous).
	 */
	@Post("generate")
	@HttpCode(HttpStatus.OK)
		@ApiOperation({
			summary: "Generate content",
			description: "Synchronously return the full generated content",
	})
	@ApiResponse({
		status: 200,
		description: "Generated content",
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
	 * Polish content (streaming SSE).
	 */
	@Post("polish/stream")
	@HttpCode(HttpStatus.OK)
	@Sse()
	@ApiOperation({
		summary: "Polish content (streaming)",
		description: "Return the polishing process through SSE streaming",
	})
	@ApiResponse({
		status: 200,
		description: "Stream polished content",
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
						content: error instanceof Error ? error.message : "unknown error",
					},
				} as MessageEvent<StreamMessageDto>);
				subject.complete();
			}
		})();

		return subject.asObservable();
	}

	/**
	 * Polish content (synchronous).
	 */
	@Post("polish")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Polish content",
		description: "Synchronously return polished content",
	})
	@ApiResponse({
		status: 200,
		description: "Polished content",
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
	 * Research topic (streaming SSE).
	 */
	@Post("research/stream")
	@HttpCode(HttpStatus.OK)
	@Sse()
	@ApiOperation({
		summary: "Research topic (streaming)",
		description: "Return the research process through SSE streaming",
	})
	@ApiResponse({
		status: 200,
		description: "Stream research results",
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
						content: error instanceof Error ? error.message : "unknown error",
					},
				} as MessageEvent<StreamMessageDto>);
				subject.complete();
			}
		})();

		return subject.asObservable();
	}

	/**
	 * Research topic (synchronous).
	 */
	@Post("research")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Research topic",
		description: "Synchronously return the complete research report",
	})
	@ApiResponse({
		status: 200,
		description: "Research report",
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
			results: [], // TODO: parse research results.
			summary: finalContent,
			generatedAt: new Date(),
		};
	}

	/**
	 * Optimize Skill content (streaming SSE).
	 */
	@Post("optimize-skill")
	@HttpCode(HttpStatus.OK)
	@Sse()
	@ApiOperation({
		summary: "Optimize Skill content (streaming)",
		description: "Return Skill optimization results through SSE streaming",
	})
	@ApiResponse({
		status: 200,
		description: "Stream optimized Skill content",
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
						content: error instanceof Error ? error.message : "unknown error",
					},
				} as MessageEvent<StreamMessageDto>);
				subject.complete();
			}
		})();

		return subject.asObservable();
	}

	/**
	 * Trigger Skill file-system sync.
	 * Admin calls this after editing Skills so the backend can rebuild .claude/skills/.
	 */
	@Post("sync-skills")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Sync Skills to the file system",
		description: "Rebuild the .claude/skills/ directory from the DB for Claude Agent SDK loading",
	})
	@ApiResponse({ status: 200, description: "Sync completed" })
	async syncSkills(): Promise<{ success: boolean; message: string }> {
		this.logger.log("Sync skills request received");
		await this.skillSyncService.syncAllSkills();
		return { success: true, message: "Skills synced" };
	}

		/**
		 * Test generateFromDescription without authentication.
		 */
	@Post("test/generate-from-description")
	@HttpCode(HttpStatus.OK)
		@ApiOperation({
			summary: "[Test] Generate content from a natural-language description",
			description:
				"Test endpoint: call generateFromDescription directly with a natural-language description and return generated content text",
		})
		@ApiResponse({ status: 200, description: "Generated content text" })
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
