import { ApiProperty } from '@nestjs/swagger'
import {
    ExecutionResult,
    ExecutionStatus,
    PlatformType,
    TaskCategory,
} from '../enums/task.enums'

/**
 * 最近执行信息
 */
export class LastExecutionInfo {
    @ApiProperty({ description: '执行记录ID' })
    id: number

    @ApiProperty({ description: '执行状态', enum: ExecutionStatus })
    status: ExecutionStatus

    @ApiProperty({ description: '执行结果', enum: ExecutionResult, required: false })
    result?: ExecutionResult

    @ApiProperty({ description: '完成时间', required: false })
    finishedAt?: Date
}

/**
 * 任务响应DTO
 */
export class TaskResponseDto {
    @ApiProperty({ description: '任务ID' })
    id: number

    @ApiProperty({ description: '用户ID' })
    userId: number

    @ApiProperty({ description: '任务名称' })
    taskName: string

    @ApiProperty({ description: '任务描述', required: false })
    taskDescription?: string

    @ApiProperty({
        description: '相关平台列表',
        enum: PlatformType,
        isArray: true,
    })
    relatedPlatforms: PlatformType[]

    @ApiProperty({ description: '任务类别', enum: TaskCategory })
    category: TaskCategory

    @ApiProperty({ description: '总执行次数' })
    totalExecutions: number

    @ApiProperty({ description: '成功次数' })
    successCount: number

    @ApiProperty({ description: '失败次数' })
    failCount: number

    @ApiProperty({ description: '创建时间' })
    createdAt: Date

    @ApiProperty({ description: '更新时间' })
    updatedAt: Date

    @ApiProperty({ description: '发布时间', required: false })
    publishedAt?: Date

    @ApiProperty({ description: '最近一次执行信息', type: LastExecutionInfo, required: false })
    lastExecution?: LastExecutionInfo

    @ApiProperty({ description: '是否为模板任务' })
    isTemplate: boolean

    @ApiProperty({ description: '是否为示例任务' })
    isExample: boolean

    @ApiProperty({ description: '是否置顶' })
    isPinned: boolean
}

/**
 * 任务列表查询参数
 */
export class TaskQueryDto {
    @ApiProperty({ description: '页码', required: false, default: 1 })
    page?: number

    @ApiProperty({ description: '每页数量', required: false, default: 20 })
    pageSize?: number

    @ApiProperty({ description: '任务类别筛选', enum: TaskCategory, required: false })
    category?: TaskCategory

    @ApiProperty({
        description: '平台筛选',
        enum: PlatformType,
        required: false,
    })
    platform?: PlatformType

    @ApiProperty({ description: '搜索关键词', required: false })
    keyword?: string
}

/**
 * 分页任务列表响应
 */
export class PaginatedTaskListDto {
    @ApiProperty({ description: '任务列表', type: [TaskResponseDto] })
    items: TaskResponseDto[]

    @ApiProperty({ description: '总数' })
    total: number

    @ApiProperty({ description: '当前页码' })
    page: number

    @ApiProperty({ description: '每页数量' })
    pageSize: number

    @ApiProperty({ description: '总页数' })
    totalPages: number
}
