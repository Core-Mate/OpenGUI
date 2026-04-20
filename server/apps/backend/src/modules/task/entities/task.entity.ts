import {
    ExecutionResult,
    ExecutionStatus,
    PlatformType,
    TaskCategory,
} from '../enums/task.enums'

/**
 * 任务实体
 */
export interface TaskEntity {
    id: number
    userId: number
    taskName: string
    taskDescription?: string | null
    relatedPlatforms: PlatformType[]
    category: TaskCategory
    totalExecutions: number
    successCount: number
    failCount: number
    createdAt: Date
    updatedAt: Date
    publishedAt?: Date | null
    isDeleted: boolean
    isTemplate: boolean
    isExample: boolean
    isPinned: boolean
    pinnedAt?: Date | null
}

/**
 * 创建任务数据
 */
export interface CreateTaskData {
    userId: number
    taskName: string
    taskDescription?: string
    relatedPlatforms?: PlatformType[]
    category?: TaskCategory
}

/**
 * 更新任务数据
 */
export interface UpdateTaskData {
    taskName?: string
    taskDescription?: string
    relatedPlatforms?: PlatformType[]
    category?: TaskCategory
}

/**
 * 更新任务统计数据
 */
export interface UpdateTaskStatsData {
    totalExecutions?: number
    successCount?: number
    failCount?: number
}

/**
 * 从Prisma模型映射到实体的辅助函数
 */
export function mapPrismaToTaskEntity(prismaTask: any): TaskEntity {
    return {
        id: prismaTask.id,
        userId: prismaTask.user_id,
        taskName: prismaTask.task_name,
        taskDescription: prismaTask.task_description,
        relatedPlatforms: prismaTask.related_platforms || [],
        category: prismaTask.category,
        totalExecutions: prismaTask.total_executions,
        successCount: prismaTask.success_count,
        failCount: prismaTask.fail_count,
        createdAt: prismaTask.created_at,
        updatedAt: prismaTask.updated_at,
        publishedAt: prismaTask.published_at,
        isDeleted: prismaTask.is_deleted,
        isTemplate: prismaTask.is_template || false,
        isExample: prismaTask.is_example || false,
        isPinned: prismaTask.is_pinned || false,
        pinnedAt: prismaTask.pinned_at,
    }
}

/**
 * 最近执行信息
 */
export interface LastExecutionInfo {
    id: number
    status: ExecutionStatus
    result?: ExecutionResult
    finishedAt?: Date
}
