import { IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 */
export class OptimizeSkillDto {
	@ApiProperty({ description: "Skill content to optimize (Markdown)" })
	@IsString()
	@MaxLength(100000)
	content: string;
}
