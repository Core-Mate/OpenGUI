import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

/**
 */
export class ForkExecutionDto {
    @ApiPropertyOptional({
        description: 'Optional additional user instruction. Omit to continue directly.',
        example: 'Continue the unfinished parts, especially focusing on...',
    })
    @IsOptional()
    @IsString()
    instruction?: string

    @ApiPropertyOptional({
        description: 'Optional device ID. Defaults to the device ID from the original execution.',
        example: 'device-123',
    })
    @IsOptional()
    @IsString()
    deviceId?: string
}
