import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import {
    ExecutionMode,
    ExecutionResult,
    ExecutionStatus,
} from '../enums/task.enums'

/**
 */
export class TaskExecutionResponseDto {
    @ApiProperty({ description: 'Execution record ID' })
    id: number

    @ApiProperty({ description: 'Task ID' })
    taskId: number

    @ApiProperty({ description: 'User ID' })
    userId: number

    @ApiProperty({ description: 'Device ID', required: false })
    deviceId?: string

    @ApiProperty({ description: 'Execution mode', enum: ExecutionMode })
    executionMode: ExecutionMode

    @ApiProperty({ description: 'Execution status', enum: ExecutionStatus })
    executionStatus: ExecutionStatus

    @ApiProperty({ description: 'Status message', required: false })
    statusMessage?: string

    @ApiProperty({ description: 'Execution result', enum: ExecutionResult, required: false })
    executionResult?: ExecutionResult

    @ApiProperty({ description: 'Execution result summary', required: false })
    executionResultSummary?: string

    @ApiProperty({ description: 'Error message', required: false })
    errorMessage?: string

    @ApiProperty({ description: 'Current step', required: false })
    currentStep?: string

    @ApiProperty({ description: 'Scheduled time', required: false })
    scheduledAt?: Date

    @ApiProperty({ description: 'Actual start time', required: false })
    startedAt?: Date

    @ApiProperty({ description: 'Completion time', required: false })
    finishedAt?: Date

    @ApiProperty({ description: 'Token usage', required: false })
    tokenUsage?: Record<string, any>

    @ApiProperty({ description: 'Created at' })
    createdAt: Date

    @ApiProperty({ description: 'Updated at' })
    updatedAt: Date
}

/**
 */
export class ExecuteTaskResponseDto {
    @ApiProperty({ description: 'Success flag' })
    success: boolean

    @ApiProperty({ description: 'Execution record ID' })
    executionId: number

    @ApiProperty({ description: 'Task ID' })
    taskId: number

    @ApiProperty({ description: 'Message', required: false })
    message?: string
}

/**
 */
export class ExecutionActionResponseDto {
    @ApiProperty({ description: 'Success flag' })
    success: boolean

    @ApiProperty({ description: 'Message' })
    message: string
}

/**
 */
export class ExecutionHistoryQueryDto {
    @ApiProperty({ description: 'Page number', required: false, default: 1 })
    page?: number

    @ApiProperty({ description: 'Items per page', required: false, default: 20 })
    pageSize?: number

    @ApiProperty({
        description: 'Execution status filter',
        enum: ExecutionStatus,
        required: false,
    })
    status?: ExecutionStatus

    @ApiProperty({
        description: 'Execution result filter',
        enum: ExecutionResult,
        required: false,
    })
    result?: ExecutionResult
}

/**
 */
export class PaginatedExecutionHistoryDto {
    @ApiProperty({ description: 'Execution records', type: [TaskExecutionResponseDto] })
    items: TaskExecutionResponseDto[]

    @ApiProperty({ description: 'Total count' })
    total: number

    @ApiProperty({ description: 'Current page number' })
    page: number

    @ApiProperty({ description: 'Items per page' })
    pageSize: number

    @ApiProperty({ description: 'Total pages' })
    totalPages: number
}

/**
 */
export class CancelExecutionDetailDto {
    @ApiProperty({ description: 'Execution record ID' })
    executionId: number

    @ApiProperty({ description: 'Success flag' })
    success: boolean

    @ApiProperty({ description: 'Message', required: false })
    message?: string
}

/**
 */
export class CancelAllExecutionsResponseDto {
    @ApiProperty({ description: 'Success flag' })
    success: boolean

    @ApiProperty({ description: 'Message' })
    message: string

    @ApiProperty({ description: 'Total executions' })
    totalExecutions: number

    @ApiProperty({ description: 'Cancelled execution count' })
    cancelledExecutions: number

    @ApiProperty({ description: 'Failed executions' })
    failedExecutions: number

    @ApiProperty({
        description: 'Cancellation details',
        type: [CancelExecutionDetailDto],
        required: false,
    })
    details?: CancelExecutionDetailDto[]
}

/**
 */
export class CreateFeedbackDto {
    @ApiPropertyOptional({
        description: 'Rating from 1 to 5',
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
        description: 'Feedback text',
        example: 'The task ran smoothly and the result met expectations.',
    })
    @IsString()
    @IsOptional()
    feedbackText?: string
}

/**
 */
export class FeedbackResponseDto {
    @ApiProperty({ description: 'Operation success flag' })
    success: boolean

    @ApiProperty({ description: 'Message' })
    message: string

    @ApiPropertyOptional({ description: 'Feedback ID' })
    feedbackId?: number
}

/**
 */
export class HeartbeatResponseDto {
    @ApiProperty({ description: 'Success flag' })
    success: boolean

    @ApiProperty({ description: 'Remaining lease time in seconds' })
    ttl: number

    @ApiProperty({ description: 'Recommended heartbeat interval in seconds' })
    heartbeatInterval: number

    @ApiPropertyOptional({ description: 'Execution status', enum: ExecutionStatus })
    executionStatus?: ExecutionStatus

    @ApiPropertyOptional({ description: 'Message' })
    message?: string
}

/**
 */
export class BatchHeartbeatDto {
    @ApiProperty({
        description: 'Execution ID list',
        type: [Number],
        example: [1, 2, 3],
    })
    executionIds: number[]
}

/**
 */
export class BatchHeartbeatResponseDto {
    @ApiProperty({ description: 'Success flag' })
    success: boolean

    @ApiProperty({
        description: 'Execution IDs renewed successfully',
        type: [Number],
    })
    renewedExecutionIds: number[]

    @ApiProperty({
        description: 'Execution IDs that failed to renew',
        type: [Number],
    })
    failedExecutionIds: number[]

    @ApiProperty({ description: 'Recommended heartbeat interval in seconds' })
    heartbeatInterval: number
}

/**
 */
export class ForkExecutionResponseDto {
    @ApiProperty({ description: 'Success flag' })
    success: boolean

    @ApiProperty({ description: 'New execution record ID' })
    executionId: number

    @ApiProperty({ description: 'Task ID' })
    taskId: number

    @ApiProperty({ description: 'Original execution record ID' })
    originExecutionId: number

    @ApiProperty({ description: 'Message' })
    message: string
}
