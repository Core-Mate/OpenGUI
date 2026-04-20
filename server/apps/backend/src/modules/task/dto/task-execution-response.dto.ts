import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import {
    ExecutionMode,
    ExecutionResult,
    ExecutionStatus,
} from '../enums/task.enums'

/**
 * 任务执行记录响应DTO
 */
export class TaskExecutionResponseDto {
    @ApiProperty({ description: '执行记录ID' })
    id: number

    @ApiProperty({ description: '任务ID' })
    taskId: number

    @ApiProperty({ description: '用户ID' })
    userId: number

    @ApiProperty({ description: '设备ID', required: false })
    deviceId?: string

    @ApiProperty({ description: '执行模式', enum: ExecutionMode })
    executionMode: ExecutionMode

    @ApiProperty({ description: '执行状态', enum: ExecutionStatus })
    executionStatus: ExecutionStatus

    @ApiProperty({ description: '状态说明', required: false })
    statusMessage?: string

    @ApiProperty({ description: '执行结果', enum: ExecutionResult, required: false })
    executionResult?: ExecutionResult

    @ApiProperty({ description: '执行结果摘要', required: false })
    executionResultSummary?: string

    @ApiProperty({ description: '错误信息', required: false })
    errorMessage?: string

    @ApiProperty({ description: '当前步骤', required: false })
    currentStep?: string

    @ApiProperty({ description: '计划执行时间', required: false })
    scheduledAt?: Date

    @ApiProperty({ description: '实际开始时间', required: false })
    startedAt?: Date

    @ApiProperty({ description: '完成时间', required: false })
    finishedAt?: Date

    @ApiProperty({ description: 'Token使用统计', required: false })
    tokenUsage?: Record<string, any>

    @ApiProperty({ description: '创建时间' })
    createdAt: Date

    @ApiProperty({ description: '更新时间' })
    updatedAt: Date
}

/**
 * 执行任务响应（包含执行ID）
 */
export class ExecuteTaskResponseDto {
    @ApiProperty({ description: '是否成功' })
    success: boolean

    @ApiProperty({ description: '执行记录ID' })
    executionId: number

    @ApiProperty({ description: '任务ID' })
    taskId: number

    @ApiProperty({ description: '消息', required: false })
    message?: string
}

/**
 * 取消/暂停/恢复执行响应
 */
export class ExecutionActionResponseDto {
    @ApiProperty({ description: '是否成功' })
    success: boolean

    @ApiProperty({ description: '消息' })
    message: string
}

/**
 * 执行历史查询参数
 */
export class ExecutionHistoryQueryDto {
    @ApiProperty({ description: '页码', required: false, default: 1 })
    page?: number

    @ApiProperty({ description: '每页数量', required: false, default: 20 })
    pageSize?: number

    @ApiProperty({
        description: '执行状态筛选',
        enum: ExecutionStatus,
        required: false,
    })
    status?: ExecutionStatus

    @ApiProperty({
        description: '执行结果筛选',
        enum: ExecutionResult,
        required: false,
    })
    result?: ExecutionResult
}

/**
 * 分页执行历史列表响应
 */
export class PaginatedExecutionHistoryDto {
    @ApiProperty({ description: '执行记录列表', type: [TaskExecutionResponseDto] })
    items: TaskExecutionResponseDto[]

    @ApiProperty({ description: '总数' })
    total: number

    @ApiProperty({ description: '当前页码' })
    page: number

    @ApiProperty({ description: '每页数量' })
    pageSize: number

    @ApiProperty({ description: '总页数' })
    totalPages: number
}

/**
 * 批量取消执行详情
 */
export class CancelExecutionDetailDto {
    @ApiProperty({ description: '执行记录ID' })
    executionId: number

    @ApiProperty({ description: '是否成功' })
    success: boolean

    @ApiProperty({ description: '消息', required: false })
    message?: string
}

/**
 * 批量取消执行响应
 */
export class CancelAllExecutionsResponseDto {
    @ApiProperty({ description: '是否成功' })
    success: boolean

    @ApiProperty({ description: '消息' })
    message: string

    @ApiProperty({ description: '总执行数' })
    totalExecutions: number

    @ApiProperty({ description: '已取消执行数' })
    cancelledExecutions: number

    @ApiProperty({ description: '失败执行数' })
    failedExecutions: number

    @ApiProperty({
        description: '取消详情',
        type: [CancelExecutionDetailDto],
        required: false,
    })
    details?: CancelExecutionDetailDto[]
}

/**
 * 创建执行反馈请求 DTO
 */
export class CreateFeedbackDto {
    @ApiPropertyOptional({
        description: '评分 1-5',
        minimum: 1,
        maximum: 5,
        example: 4,
    })
    @IsInt()
    @Min(1)
    @Max(5)
    @IsOptional()
    rating?: number

    @ApiPropertyOptional({
        description: '反馈文本',
        example: '任务执行顺利，结果符合预期',
    })
    @IsString()
    @IsOptional()
    feedbackText?: string
}

/**
 * 反馈响应 DTO
 */
export class FeedbackResponseDto {
    @ApiProperty({ description: '操作是否成功' })
    success: boolean

    @ApiProperty({ description: '提示信息' })
    message: string

    @ApiPropertyOptional({ description: '反馈ID' })
    feedbackId?: number
}

/**
 * 心跳响应 DTO
 */
export class HeartbeatResponseDto {
    @ApiProperty({ description: '是否成功' })
    success: boolean

    @ApiProperty({ description: '租约剩余时间（秒）' })
    ttl: number

    @ApiProperty({ description: '建议的心跳间隔（秒）' })
    heartbeatInterval: number

    @ApiPropertyOptional({ description: '执行状态', enum: ExecutionStatus })
    executionStatus?: ExecutionStatus

    @ApiPropertyOptional({ description: '消息' })
    message?: string
}

/**
 * 批量心跳请求 DTO
 */
export class BatchHeartbeatDto {
    @ApiProperty({
        description: '执行 ID 列表',
        type: [Number],
        example: [1, 2, 3],
    })
    executionIds: number[]
}

/**
 * 批量心跳响应 DTO
 */
export class BatchHeartbeatResponseDto {
    @ApiProperty({ description: '是否成功' })
    success: boolean

    @ApiProperty({
        description: '成功续租的执行 ID 列表',
        type: [Number],
    })
    renewedExecutionIds: number[]

    @ApiProperty({
        description: '续租失败的执行 ID 列表',
        type: [Number],
    })
    failedExecutionIds: number[]

    @ApiProperty({ description: '建议的心跳间隔（秒）' })
    heartbeatInterval: number
}

/**
 * Fork 执行响应 DTO
 */
export class ForkExecutionResponseDto {
    @ApiProperty({ description: '是否成功' })
    success: boolean

    @ApiProperty({ description: '新执行记录ID' })
    executionId: number

    @ApiProperty({ description: '任务ID' })
    taskId: number

    @ApiProperty({ description: '原执行记录ID' })
    originExecutionId: number

    @ApiProperty({ description: '消息' })
    message: string
}
