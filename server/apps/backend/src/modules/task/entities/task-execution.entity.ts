import {
    ExecutionMode,
    ExecutionResult,
    ExecutionStatus,
} from '../enums/task.enums'

/**
 */
export interface TaskExecutionEntity {
    id: number
    taskId: number
    userId: number
    scheduleId?: number | null
    deviceId?: string | null
    executionMode: ExecutionMode
    executionStatus: ExecutionStatus
    statusMessage?: string | null
    executionResult?: ExecutionResult | null
    executionResultSummary?: string | null
    errorMessage?: string | null
    currentStep?: string | null
    scheduledAt?: Date | null
    startedAt?: Date | null
    finishedAt?: Date | null
    tokenUsage?: Record<string, any> | null
    createdAt: Date
    updatedAt: Date
    isDeleted: boolean
    originExecutionId?: number | null
}

/**
 */
export interface CreateExecutionData {
    taskId: number
    userId: number
    deviceId?: string
    executionMode?: ExecutionMode
    scheduledAt?: Date
}

/**
 */
export interface UpdateExecutionStatusData {
    executionStatus?: ExecutionStatus
    statusMessage?: string
    currentStep?: string
    startedAt?: Date
}

/**
 */
export interface CompleteExecutionData {
    executionResult: ExecutionResult
    executionResultSummary?: string
    errorMessage?: string
    finishedAt?: Date
    tokenUsage?: Record<string, any>
}

/**
 */
export function mapPrismaToExecutionEntity(
    prismaExecution: any,
): TaskExecutionEntity {
    return {
        id: prismaExecution.id,
        taskId: prismaExecution.task_id,
        userId: prismaExecution.user_id,
        scheduleId: prismaExecution.schedule_id,
        deviceId: prismaExecution.device_id,
        executionMode: prismaExecution.execution_mode,
        executionStatus: prismaExecution.execution_status,
        statusMessage: prismaExecution.status_message,
        executionResult: prismaExecution.execution_result,
        executionResultSummary: prismaExecution.execution_result_summary,
        errorMessage: prismaExecution.error_message,
        currentStep: prismaExecution.current_step,
        scheduledAt: prismaExecution.scheduled_at,
        startedAt: prismaExecution.started_at,
        finishedAt: prismaExecution.finished_at,
        tokenUsage: prismaExecution.token_usage,
        createdAt: prismaExecution.created_at,
        updatedAt: prismaExecution.updated_at,
        isDeleted: prismaExecution.is_deleted,
        originExecutionId: prismaExecution.origin_execution_id,
    }
}
