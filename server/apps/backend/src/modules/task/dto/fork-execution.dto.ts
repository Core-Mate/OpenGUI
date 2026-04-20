import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

/**
 * Fork 执行请求 DTO
 */
export class ForkExecutionDto {
    @ApiPropertyOptional({
        description: '用户的追加指令（可选，不传则直接继续执行）',
        example: '继续完成之前未完成的部分，特别关注...',
    })
    @IsOptional()
    @IsString()
    instruction?: string

    @ApiPropertyOptional({
        description: '设备ID（可选，默认使用原执行的设备ID）',
        example: 'device-123',
    })
    @IsOptional()
    @IsString()
    deviceId?: string
}
