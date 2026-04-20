import { IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 优化 Skill 请求 DTO
 */
export class OptimizeSkillDto {
	@ApiProperty({ description: "需要优化的 Skill 内容 (Markdown)" })
	@IsString()
	@MaxLength(100000)
	content: string;
}
