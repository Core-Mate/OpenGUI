import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString } from 'class-validator'

/**
 * 恢复执行请求 DTO
 * 用于从暂停状态恢复，或从 HITL 中断恢复
 */
export class ResumeExecutionDto {
    @ApiProperty({
        description: '用户反馈信息',
        required: false,
    })
    @IsOptional()
    @IsString()
    feedback?: string
}
