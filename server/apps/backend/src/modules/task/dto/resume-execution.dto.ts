import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString } from 'class-validator'

/**
 * Resume execution request DTO.
 * Used to resume from pause or HITL interruption.
 */
export class ResumeExecutionDto {
    @ApiProperty({
	        description: 'User feedback',
        required: false,
    })
    @IsOptional()
    @IsString()
    feedback?: string
}
