import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import {
    CreateTemplateTaskDto,
    UpdateTemplateTaskDto,
    TemplateTaskQueryDto,
} from './dto/template-task.dto'
import {
    PaginatedTaskListDto,
    TaskQueryDto,
    TaskResponseDto,
} from './dto/task-response.dto'
import {
    ExecutionResult,
    ExecutionStatus,
    PlatformType,
    TaskCategory,
} from './enums/task.enums'
import {
    LastExecutionInfo,
    mapPrismaToTaskEntity,
    TaskEntity,
} from './entities/task.entity'

@Injectable()
export class TaskService {
    private readonly logger = new Logger(TaskService.name)

    constructor(private readonly prismaService: PrismaService) {}

    /**
     * Create task
     */
    async createTask(
        userId: number,
        dto: CreateTaskDto,
    ): Promise<TaskResponseDto> {
        this.logger.log(`Creating task for user ${userId}: ${dto.taskName}`)

        const task = await this.prismaService.user_task.create({
            data: {
                user_id: userId,
                task_name: dto.taskName,
                task_description: dto.taskDescription,
                // related_platforms: dto.relatedPlatforms || [],
                category: dto.category || TaskCategory.CUSTOM,
            },
        })

        this.logger.log(`Created task ${task.id} for user ${userId}`)

        return this.mapEntityToResponse(mapPrismaToTaskEntity(task))
    }

    /**
     */
    async getTaskList(
        userId: number,
        query: TaskQueryDto,
    ): Promise<PaginatedTaskListDto> {
        const page = query.page || 1
        const pageSize = query.pageSize || 20
        const skip = (page - 1) * pageSize


        const where: any = {
            user_id: userId,
            is_deleted: false,
        }

        if (query.category) {
            where.category = query.category
        }

        if (query.platform) {
            where.related_platforms = {
                has: query.platform,
            }
        }

        if (query.keyword) {
            where.OR = [
                { task_name: { contains: query.keyword, mode: 'insensitive' } },
                {
                    task_description: {
                        contains: query.keyword,
                        mode: 'insensitive',
                    },
                },
            ]
        }


        const [total, tasks] = await Promise.all([
            this.prismaService.user_task.count({ where }),
            this.prismaService.user_task.findMany({
                where,
                orderBy: [
                    { is_pinned: 'desc' },
                    { pinned_at: 'desc' },
                    { updated_at: 'desc' },
                ],
                skip,
                take: pageSize,
            }),
        ])


        const taskIds = tasks.map((t) => t.id)
        const lastExecutions = await this.getLastExecutionsForTasks(taskIds)

        const items = tasks.map((task) => {
            const entity = mapPrismaToTaskEntity(task)
            const lastExecution = lastExecutions.get(task.id)
            return this.mapEntityToResponse(entity, lastExecution)
        })

        return {
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        }
    }

    /**
     * Get task details
     */
    async getTaskById(
        taskId: number,
        userId: number,
    ): Promise<TaskResponseDto> {
        const task = await this.prismaService.user_task.findFirst({
            where: {
                id: taskId,
                is_deleted: false,
            },
        })

        if (!task) {
            throw new NotFoundException(`Task ${taskId} not found`)
        }

        if (task.user_id !== userId) {
            throw new ForbiddenException('No permission to access this task')
        }


        const lastExecutionRecord =
            await this.prismaService.task_execution.findFirst({
                where: {
                    task_id: taskId,
                    is_deleted: false,
                },
                orderBy: { created_at: 'desc' },
            })

        const entity = mapPrismaToTaskEntity(task)
        const lastExecution = lastExecutionRecord
            ? this.mapToLastExecutionInfo(lastExecutionRecord)
            : undefined

        return this.mapEntityToResponse(entity, lastExecution)
    }

    /**
     * Get template task list
     */
    async getTemplateTasks(): Promise<TaskResponseDto[]> {
        const tasks = await this.prismaService.user_task.findMany({
            where: {
                is_template: true,
                is_deleted: false,
            },
            orderBy: { created_at: 'asc' },
        })

        return tasks.map((task) =>
            this.mapEntityToResponse(mapPrismaToTaskEntity(task)),
        )
    }

    /**
     * Update task
     */
    async updateTask(
        taskId: number,
        userId: number,
        dto: UpdateTaskDto,
    ): Promise<TaskResponseDto> {

        const existingTask = await this.prismaService.user_task.findFirst({
            where: {
                id: taskId,
                is_deleted: false,
            },
        })

        if (!existingTask) {
            throw new NotFoundException(`Task ${taskId} not found`)
        }

        if (existingTask.user_id !== userId) {
            throw new ForbiddenException('No permission to update this task')
        }

        const updateData: any = {
            updated_at: new Date(),
        }

        if (dto.taskName !== undefined) {
            updateData.task_name = dto.taskName
        }
        if (dto.taskDescription !== undefined) {
            updateData.task_description = dto.taskDescription
        }
        if (dto.relatedPlatforms !== undefined) {
            updateData.related_platforms = dto.relatedPlatforms
        }
        if (dto.category !== undefined) {
            updateData.category = dto.category
        }

        const updatedTask = await this.prismaService.user_task.update({
            where: { id: taskId },
            data: updateData,
        })

        this.logger.log(`Updated task ${taskId}`)

        return this.mapEntityToResponse(mapPrismaToTaskEntity(updatedTask))
    }

    /**
     */
    async deleteTask(taskId: number, userId: number): Promise<void> {
        const existingTask = await this.prismaService.user_task.findFirst({
            where: {
                id: taskId,
                is_deleted: false,
            },
        })

        if (!existingTask) {
            throw new NotFoundException(`Task ${taskId} not found`)
        }

        if (existingTask.user_id !== userId) {
            throw new ForbiddenException('No permission to delete this task')
        }

        await this.prismaService.user_task.update({
            where: { id: taskId },
            data: {
                is_deleted: true,
                updated_at: new Date(),
            },
        })

        this.logger.log(`Deleted task ${taskId}`)
    }

    /**
     */
    async updateTaskStats(taskId: number, success: boolean): Promise<void> {
        const updateData: any = {
            total_executions: { increment: 1 },
            updated_at: new Date(),
        }

        if (success) {
            updateData.success_count = { increment: 1 }
        } else {
            updateData.fail_count = { increment: 1 }
        }

        await this.prismaService.user_task.update({
            where: { id: taskId },
            data: updateData,
        })

        this.logger.log(
            `Updated stats for task ${taskId}: success=${success}`,
        )
    }

    /**
     */
    async syncTaskStats(taskId: number): Promise<void> {


        const stats = await this.prismaService.task_execution.groupBy({
            by: ['execution_result'],
            where: {
                task_id: taskId,
                execution_status: ExecutionStatus.FINISHED,
                is_deleted: false,
            },
            _count: true,
        })

        let totalExecutions = 0
        let successCount = 0
        let failCount = 0

        for (const stat of stats) {
            const count = stat._count
            totalExecutions += count


            if (
                stat.execution_result === ExecutionResult.SUCCEED ||
                stat.execution_result === ExecutionResult.CANCELLED
            ) {
                successCount += count
            } else if (stat.execution_result === ExecutionResult.FAILED) {
                failCount += count
            }
        }

        await this.prismaService.user_task.update({
            where: { id: taskId },
            data: {
                total_executions: totalExecutions,
                success_count: successCount,
                fail_count: failCount,
                updated_at: new Date(),
            },
        })

        this.logger.log(
            `Synced stats for task ${taskId}: total=${totalExecutions}, success=${successCount}, fail=${failCount}`,
        )
    }

    /**
     */
    async syncAllTaskStats(): Promise<{ synced: number }> {
        const tasks = await this.prismaService.user_task.findMany({
            where: { is_deleted: false },
            select: { id: true },
        })

        for (const task of tasks) {
            await this.syncTaskStats(task.id)
        }

        this.logger.log(`Synced stats for ${tasks.length} tasks`)
        return { synced: tasks.length }
    }

    /**
     * Pin or unpin task
     */
    async pinTask(taskId: number, userId: number): Promise<TaskResponseDto> {
        const existingTask = await this.prismaService.user_task.findFirst({
            where: {
                id: taskId,
                is_deleted: false,
            },
        })

        if (!existingTask) {
            throw new NotFoundException(`Task ${taskId} not found`)
        }

        if (existingTask.user_id !== userId) {
            throw new ForbiddenException('No permission to pin this task')
        }

        const newPinned = !existingTask.is_pinned

        const updatedTask = await this.prismaService.user_task.update({
            where: { id: taskId },
            data: {
                is_pinned: newPinned,
                pinned_at: newPinned ? new Date() : null,
            },
        })

        this.logger.log(
            `Task ${taskId} ${newPinned ? 'pinned' : 'unpinned'} by user ${userId}`,
        )

        return this.mapEntityToResponse(mapPrismaToTaskEntity(updatedTask))
    }

    /**
     */
    async getTaskEntity(taskId: number): Promise<TaskEntity | null> {
        const task = await this.prismaService.user_task.findFirst({
            where: {
                id: taskId,
                is_deleted: false,
            },
        })

        if (!task) {
            return null
        }

        return mapPrismaToTaskEntity(task)
    }

    /**
     */
    private mapEntityToResponse(
        entity: TaskEntity,
        lastExecution?: LastExecutionInfo,
    ): TaskResponseDto {
        return {
            id: entity.id,
            userId: entity.userId,
            taskName: entity.taskName,
            taskDescription: entity.taskDescription || undefined,
            relatedPlatforms: entity.relatedPlatforms,
            category: entity.category,
            totalExecutions: entity.totalExecutions,
            successCount: entity.successCount,
            failCount: entity.failCount,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
            publishedAt: entity.publishedAt || undefined,
            lastExecution,
            isTemplate: entity.isTemplate,
            isExample: entity.isExample,
            isPinned: entity.isPinned,
        }
    }

    /**
     */
    private mapToLastExecutionInfo(execution: any): LastExecutionInfo {
        return {
            id: execution.id,
            status: execution.execution_status as ExecutionStatus,
            result: execution.execution_result as ExecutionResult | undefined,
            finishedAt: execution.finished_at || undefined,
        }
    }

    /**
     */
    private async getLastExecutionsForTasks(
        taskIds: number[],
    ): Promise<Map<number, LastExecutionInfo>> {
        if (taskIds.length === 0) {
            return new Map()
        }


        const executions = await this.prismaService.$queryRaw<
            Array<{
                id: number
                task_id: number
                execution_status: string
                execution_result: string | null
                finished_at: Date | null
            }>
        >`
            SELECT DISTINCT ON (task_id)
                id, task_id, execution_status, execution_result, finished_at
            FROM task_execution
            WHERE task_id = ANY(${taskIds}::int[]) AND is_deleted = false
            ORDER BY task_id, created_at DESC
        `

        const result = new Map<number, LastExecutionInfo>()
        for (const exec of executions) {
            result.set(exec.task_id, {
                id: exec.id,
                status: exec.execution_status as ExecutionStatus,
                result: exec.execution_result as ExecutionResult | undefined,
                finishedAt: exec.finished_at || undefined,
            })
        }

        return result
    }



    /**
     */
    private readonly SYSTEM_USER_ID = 0

    /**
     */
    async createTemplateTask(
        dto: CreateTemplateTaskDto,
    ): Promise<TaskResponseDto> {
        this.logger.log(`Creating template task: ${dto.taskName}`)

        const task = await this.prismaService.user_task.create({
            data: {
                user_id: this.SYSTEM_USER_ID,
                task_name: dto.taskName,
                task_description: dto.taskDescription,
                // related_platforms: dto.relatedPlatforms || [],
                category: dto.category || TaskCategory.CUSTOM,
                is_template: true,
            },
        })

        this.logger.log(`Created template task ${task.id}`)

        return this.mapEntityToResponse(mapPrismaToTaskEntity(task))
    }

    /**
     */
    async getTemplateTaskList(
        query: TemplateTaskQueryDto,
    ): Promise<PaginatedTaskListDto> {
        const page = query.page || 1
        const pageSize = query.pageSize || 20
        const skip = (page - 1) * pageSize


        const where: any = {
            is_template: true,
            is_deleted: false,
        }

        if (query.category) {
            where.category = query.category
        }

        if (query.platform) {
            where.related_platforms = {
                has: query.platform,
            }
        }

        if (query.keyword) {
            where.OR = [
                { task_name: { contains: query.keyword, mode: 'insensitive' } },
                {
                    task_description: {
                        contains: query.keyword,
                        mode: 'insensitive',
                    },
                },
            ]
        }


        const [total, tasks] = await Promise.all([
            this.prismaService.user_task.count({ where }),
            this.prismaService.user_task.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take: pageSize,
            }),
        ])

        const items = tasks.map((task) =>
            this.mapEntityToResponse(mapPrismaToTaskEntity(task)),
        )

        return {
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        }
    }

    /**
     */
    async getTemplateTaskById(taskId: number): Promise<TaskResponseDto> {
        const task = await this.prismaService.user_task.findFirst({
            where: {
                id: taskId,
                is_template: true,
                is_deleted: false,
            },
        })

        if (!task) {
            throw new NotFoundException(`Template task ${taskId} not found`)
        }

        return this.mapEntityToResponse(mapPrismaToTaskEntity(task))
    }

    /**
     */
    async updateTemplateTask(
        taskId: number,
        dto: UpdateTemplateTaskDto,
    ): Promise<TaskResponseDto> {

        const existingTask = await this.prismaService.user_task.findFirst({
            where: {
                id: taskId,
                is_template: true,
                is_deleted: false,
            },
        })

        if (!existingTask) {
            throw new NotFoundException(`Template task ${taskId} not found`)
        }

        const updateData: any = {
            updated_at: new Date(),
        }

        if (dto.taskName !== undefined) {
            updateData.task_name = dto.taskName
        }
        if (dto.taskDescription !== undefined) {
            updateData.task_description = dto.taskDescription
        }
        // if (dto.relatedPlatforms !== undefined) {
        //     updateData.related_platforms = dto.relatedPlatforms
        // }
        if (dto.category !== undefined) {
            updateData.category = dto.category
        }

        const updatedTask = await this.prismaService.user_task.update({
            where: { id: taskId },
            data: updateData,
        })

        this.logger.log(`Updated template task ${taskId}`)

        return this.mapEntityToResponse(mapPrismaToTaskEntity(updatedTask))
    }

    /**
     */
    async deleteTemplateTask(taskId: number): Promise<void> {
        const existingTask = await this.prismaService.user_task.findFirst({
            where: {
                id: taskId,
                is_template: true,
                is_deleted: false,
            },
        })

        if (!existingTask) {
            throw new NotFoundException(`Template task ${taskId} not found`)
        }

        await this.prismaService.user_task.update({
            where: { id: taskId },
            data: {
                is_deleted: true,
                updated_at: new Date(),
            },
        })

        this.logger.log(`Deleted template task ${taskId}`)
    }
}
