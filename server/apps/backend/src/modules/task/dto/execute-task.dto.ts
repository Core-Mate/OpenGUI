import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { ExecutionMode } from '../enums/task.enums'

/**
 * 执行任务请求DTO
 */
export class ExecuteTaskDto {
    @ApiProperty({
        description: '设备ID',
        required: false,
    })
    @IsOptional()
    @IsString()
    deviceId?: string

    @ApiProperty({
        description: '执行模式',
        enum: ExecutionMode,
        required: false,
        default: ExecutionMode.IMMEDIATE,
    })
    @IsOptional()
    @IsEnum(ExecutionMode)
    executionMode?: ExecutionMode
}
