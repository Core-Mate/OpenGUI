import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { ExecutionMode } from '../enums/task.enums'

/**
 */
export class ExecuteTaskDto {
    @ApiProperty({
        description: 'Device ID',
        required: false,
    })
    @IsOptional()
    @IsString()
    deviceId?: string

    @ApiProperty({
        description: 'Execution mode',
        enum: ExecutionMode,
        required: false,
        default: ExecutionMode.IMMEDIATE,
    })
    @IsOptional()
    @IsEnum(ExecutionMode)
    executionMode?: ExecutionMode
}
