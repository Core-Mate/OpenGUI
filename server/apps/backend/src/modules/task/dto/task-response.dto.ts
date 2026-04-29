import { ApiProperty } from '@nestjs/swagger'
import {
    ExecutionResult,
    ExecutionStatus,
    PlatformType,
    TaskCategory,
} from '../enums/task.enums'

/**
 * Last execution info
 */
export class LastExecutionInfo {
    @ApiProperty({ description: 'Execution record ID' })
    id: number

    @ApiProperty({ description: 'Execution status', enum: ExecutionStatus })
    status: ExecutionStatus

    @ApiProperty({ description: 'Execution result', enum: ExecutionResult, required: false })
    result?: ExecutionResult

    @ApiProperty({ description: 'Completion time', required: false })
    finishedAt?: Date
}

/**
 * Task response DTO
 */
export class TaskResponseDto {
    @ApiProperty({ description: 'Task ID' })
    id: number

    @ApiProperty({ description: 'User ID' })
    userId: number

    @ApiProperty({ description: 'Task name' })
    taskName: string

    @ApiProperty({ description: 'Task description', required: false })
    taskDescription?: string

    @ApiProperty({
        description: 'Related platforms',
        enum: PlatformType,
        isArray: true,
    })
    relatedPlatforms: PlatformType[]

    @ApiProperty({ description: 'Task category', enum: TaskCategory })
    category: TaskCategory

    @ApiProperty({ description: 'Total executions' })
    totalExecutions: number

    @ApiProperty({ description: 'Success count' })
    successCount: number

    @ApiProperty({ description: 'Failure count' })
    failCount: number

    @ApiProperty({ description: 'Created at' })
    createdAt: Date

    @ApiProperty({ description: 'Updated at' })
    updatedAt: Date

    @ApiProperty({ description: 'Published at', required: false })
    publishedAt?: Date

    @ApiProperty({ description: 'Most recent execution info', type: LastExecutionInfo, required: false })
    lastExecution?: LastExecutionInfo

    @ApiProperty({ description: 'Whether this is a template task' })
    isTemplate: boolean

    @ApiProperty({ description: 'Whether this is an example task' })
    isExample: boolean

    @ApiProperty({ description: 'Whether pinned' })
    isPinned: boolean
}

/**
 */
export class TaskQueryDto {
    @ApiProperty({ description: 'Page number', required: false, default: 1 })
    page?: number

    @ApiProperty({ description: 'Items per page', required: false, default: 20 })
    pageSize?: number

    @ApiProperty({ description: 'Task category filter', enum: TaskCategory, required: false })
    category?: TaskCategory

    @ApiProperty({
        description: 'Platform filter',
        enum: PlatformType,
        required: false,
    })
    platform?: PlatformType

    @ApiProperty({ description: 'Search keyword', required: false })
    keyword?: string
}

/**
 */
export class PaginatedTaskListDto {
    @ApiProperty({ description: 'Task list', type: [TaskResponseDto] })
    items: TaskResponseDto[]

    @ApiProperty({ description: 'Total count' })
    total: number

    @ApiProperty({ description: 'Current page number' })
    page: number

    @ApiProperty({ description: 'Items per page' })
    pageSize: number

    @ApiProperty({ description: 'Total pages' })
    totalPages: number
}
