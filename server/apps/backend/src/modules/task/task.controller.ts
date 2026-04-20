import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Query,
    ValidationPipe,
} from '@nestjs/common'

import {
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger'
import { AppLogger } from '../../common/log'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { ExecuteTaskDto } from './dto/execute-task.dto'
import { ResumeExecutionDto } from './dto/resume-execution.dto'
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
    BatchHeartbeatDto,
    BatchHeartbeatResponseDto,
    CancelAllExecutionsResponseDto,
    CreateFeedbackDto,
    ExecuteTaskResponseDto,
    ExecutionActionResponseDto,
    ExecutionHistoryQueryDto,
    FeedbackResponseDto,
    ForkExecutionResponseDto,
    HeartbeatResponseDto,
    PaginatedExecutionHistoryDto,
    TaskExecutionResponseDto,
} from './dto/task-execution-response.dto'
import { ForkExecutionDto } from './dto/fork-execution.dto'
import { TaskService } from './task.service'
import { TaskExecutionService } from './task-execution.service'

const DEFAULT_USER_ID = 1

@ApiTags('任务管理 V2')
@Controller('tasks')
export class TaskController {
    constructor(
        private readonly logger: AppLogger,
        private readonly taskService: TaskService,
        private readonly taskExecutionService: TaskExecutionService,
    ) {
        this.logger.setContext(TaskController.name)
    }

    // ============= 任务管理 API =============

    @Post()
    @ApiOperation({ summary: '创建任务' })
    @ApiResponse({
        status: 201,
        description: '任务创建成功',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 400, description: '请求参数错误' })
    async createTask(
        @Body(ValidationPipe) dto: CreateTaskDto,
    ): Promise<TaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} creating task: ${dto.taskName}`)
        return await this.taskService.createTask(userId, dto)
    }

    @Get()
    @ApiOperation({ summary: '获取任务列表' })
    @ApiResponse({
        status: 200,
        description: '获取成功',
        type: PaginatedTaskListDto,
    })
    async getTaskList(
        @Query() query: TaskQueryDto,
    ): Promise<PaginatedTaskListDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} getting task list`)
        return await this.taskService.getTaskList(userId, query)
    }

    @Get('templates')
    @ApiOperation({ summary: '获取模板任务列表' })
    @ApiResponse({
        status: 200,
        description: '获取成功',
        type: [TaskResponseDto],
    })
    async getTemplateTasks(): Promise<TaskResponseDto[]> {
        this.logger.log('Getting template tasks')
        return await this.taskService.getTemplateTasks()
    }

    @Get(':id')
    @ApiOperation({ summary: '获取任务详情' })
    @ApiParam({ name: 'id', description: '任务ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '获取成功',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 404, description: '任务不存在' })
    async getTaskById(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<TaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} getting task ${taskId}`)
        return await this.taskService.getTaskById(taskId, userId)
    }

    @Put(':id')
    @ApiOperation({ summary: '更新任务' })
    @ApiParam({ name: 'id', description: '任务ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '更新成功',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 404, description: '任务不存在' })
    async updateTask(
        @Param('id', ParseIntPipe) taskId: number,
        @Body(ValidationPipe) dto: UpdateTaskDto,
    ): Promise<TaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} updating task ${taskId}`)
        return await this.taskService.updateTask(taskId, userId, dto)
    }

    @Delete(':id')
    @ApiOperation({ summary: '删除任务' })
    @ApiParam({ name: 'id', description: '任务ID', type: Number })
    @ApiResponse({ status: 200, description: '删除成功' })
    @ApiResponse({ status: 404, description: '任务不存在' })
    async deleteTask(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<{ success: boolean; message: string }> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} deleting task ${taskId}`)
        await this.taskService.deleteTask(taskId, userId)
        return { success: true, message: '任务删除成功' }
    }

    @Put(':id/pin')
    @ApiOperation({ summary: '置顶/取消置顶任务' })
    @ApiParam({ name: 'id', description: '任务ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '操作成功',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 404, description: '任务不存在' })
    async pinTask(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<TaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} toggling pin for task ${taskId}`)
        return await this.taskService.pinTask(taskId, userId)
    }

    // ============= 任务执行 API =============

    @Post(':id/execute')
    @ApiOperation({ summary: '执行任务' })
    @ApiParam({ name: 'id', description: '任务ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '任务执行已启动',
        type: ExecuteTaskResponseDto,
    })
    @ApiResponse({ status: 404, description: '任务不存在' })
    async executeTask(
        @Param('id', ParseIntPipe) taskId: number,
        @Body(ValidationPipe) dto: ExecuteTaskDto,
    ): Promise<ExecuteTaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} executing task ${taskId}`)
        return await this.taskExecutionService.executeTask(taskId, userId, dto)
    }

    @Get(':id/executions')
    @ApiOperation({ summary: '获取任务执行历史' })
    @ApiParam({ name: 'id', description: '任务ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '获取成功',
        type: PaginatedExecutionHistoryDto,
    })
    @ApiResponse({ status: 404, description: '任务不存在' })
    async getExecutionHistory(
        @Param('id', ParseIntPipe) taskId: number,
        @Query() query: ExecutionHistoryQueryDto,
    ): Promise<PaginatedExecutionHistoryDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} getting execution history for task ${taskId}`)
        return await this.taskExecutionService.getExecutionHistory(
            taskId,
            userId,
            query,
        )
    }

    @Post(':id/sync-stats')
    @ApiOperation({
        summary: '同步任务统计',
        description: '根据 task_execution 表重新计算任务统计数据',
    })
    @ApiParam({ name: 'id', description: '任务ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '同步成功',
    })
    @ApiResponse({ status: 404, description: '任务不存在' })
    async syncTaskStats(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<{ success: boolean; message: string }> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} syncing stats for task ${taskId}`)
        // 先验证任务存在且属于用户
        await this.taskService.getTaskById(taskId, userId)
        await this.taskService.syncTaskStats(taskId)
        return { success: true, message: '任务统计同步成功' }
    }

    @Post('sync-all-stats')
    @ApiOperation({
        summary: '同步所有任务统计',
        description: '批量同步所有任务的统计数据（管理员功能）',
    })
    @ApiResponse({
        status: 200,
        description: '同步成功',
    })
    async syncAllTaskStats(): Promise<{ success: boolean; synced: number }> {
        this.logger.log('Syncing stats for all tasks')
        const result = await this.taskService.syncAllTaskStats()
        return { success: true, synced: result.synced }
    }
}

@ApiTags('任务执行管理 V2')
@Controller('executions')
export class ExecutionController {
    constructor(
        private readonly logger: AppLogger,
        private readonly taskExecutionService: TaskExecutionService,
    ) {
        this.logger.setContext(ExecutionController.name)
    }

    @Put('cancel-all')
    @ApiOperation({ summary: '取消当前用户的所有执行' })
    @ApiResponse({
        status: 200,
        description: '批量取消执行成功',
        type: CancelAllExecutionsResponseDto,
    })
    @ApiResponse({ status: 400, description: '请求参数错误' })
    async cancelAllExecutions(): Promise<CancelAllExecutionsResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} cancelling all executions`)
        return await this.taskExecutionService.cancelAllExecutions(userId)
    }

    @Get(':id')
    @ApiOperation({ summary: '获取执行详情' })
    @ApiParam({ name: 'id', description: '执行记录ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '获取成功',
        type: TaskExecutionResponseDto,
    })
    @ApiResponse({ status: 404, description: '执行记录不存在' })
    async getExecutionById(
        @Param('id', ParseIntPipe) executionId: number,
    ): Promise<TaskExecutionResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} getting execution ${executionId}`)
        return await this.taskExecutionService.getExecutionById(
            executionId,
            userId,
        )
    }

    @Put(':id/cancel')
    @ApiOperation({ summary: '取消执行' })
    @ApiParam({ name: 'id', description: '执行记录ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '取消成功',
        type: ExecutionActionResponseDto,
    })
    @ApiResponse({ status: 404, description: '执行记录不存在' })
    @ApiResponse({ status: 400, description: '无法取消当前状态的执行' })
    async cancelExecution(
        @Param('id', ParseIntPipe) executionId: number,
    ): Promise<ExecutionActionResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} cancelling execution ${executionId}`)
        return await this.taskExecutionService.cancelExecution(
            executionId,
            userId,
        )
    }

    @Put(':id/pause')
    @ApiOperation({ summary: '暂停执行' })
    @ApiParam({ name: 'id', description: '执行记录ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '暂停成功',
        type: ExecutionActionResponseDto,
    })
    @ApiResponse({ status: 404, description: '执行记录不存在' })
    @ApiResponse({ status: 400, description: '无法暂停当前状态的执行' })
    async pauseExecution(
        @Param('id', ParseIntPipe) executionId: number,
    ): Promise<ExecutionActionResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} pausing execution ${executionId}`)
        return await this.taskExecutionService.pauseExecution(
            executionId,
            userId,
        )
    }

    @Put(':id/resume')
    @ApiOperation({ summary: '恢复执行' })
    @ApiParam({ name: 'id', description: '执行记录ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '恢复成功',
        type: ExecutionActionResponseDto,
    })
    @ApiResponse({ status: 404, description: '执行记录不存在' })
    @ApiResponse({ status: 400, description: '无法恢复当前状态的执行' })
    async resumeExecution(
        @Param('id', ParseIntPipe) executionId: number,
        @Body(new ValidationPipe({ transform: true })) dto: ResumeExecutionDto,
    ): Promise<ExecutionActionResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} resuming execution ${executionId}`)
        return await this.taskExecutionService.resumeExecution(
            executionId,
            userId,
            dto,
        )
    }

    @Post(':id/feedback')
    @ApiOperation({
        summary: '提交执行反馈',
        description: '对已完成的任务执行提交反馈（每次执行只能反馈一次）',
    })
    @ApiParam({ name: 'id', description: '执行记录ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '反馈提交成功',
        type: FeedbackResponseDto,
    })
    @ApiResponse({ status: 404, description: '执行记录不存在' })
    @ApiResponse({ status: 400, description: '执行未完成或已有反馈' })
    @ApiResponse({ status: 403, description: '无权限提交反馈' })
    async submitFeedback(
        @Param('id', ParseIntPipe) executionId: number,
        @Body(ValidationPipe) dto: CreateFeedbackDto,
    ): Promise<FeedbackResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} submitting feedback for execution ${executionId}`)
        return await this.taskExecutionService.submitFeedback(
            executionId,
            userId,
            dto,
        )
    }

    @Post(':id/fork')
    @ApiOperation({
        summary: 'Fork 已完成的执行',
        description: '基于已完成的执行创建新执行，复制原有对话历史，从 plan_supervisor 节点继续执行',
    })
    @ApiParam({ name: 'id', description: '原执行记录ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Fork 成功',
        type: ForkExecutionResponseDto,
    })
    @ApiResponse({ status: 404, description: '执行记录不存在' })
    @ApiResponse({ status: 400, description: '只能 fork 已完成的执行' })
    @ApiResponse({ status: 403, description: '无权限 fork 此执行' })
    async forkExecution(
        @Param('id', ParseIntPipe) originExecutionId: number,
        @Body(ValidationPipe) dto: ForkExecutionDto,
    ): Promise<ForkExecutionResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} forking execution ${originExecutionId}`)
        return await this.taskExecutionService.forkExecution(
            originExecutionId,
            userId,
            dto,
        )
    }

    // ============= 心跳租约 API =============

    @Post(':id/heartbeat')
    @ApiOperation({
        summary: '发送心跳',
        description: '客户端定期发送心跳续租，保持任务执行。如果心跳停止，租约过期后任务会被终止。建议心跳间隔为返回的 heartbeatInterval 值。',
    })
    @ApiParam({ name: 'id', description: '执行记录ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '心跳成功',
        type: HeartbeatResponseDto,
    })
    @ApiResponse({ status: 404, description: '执行记录不存在' })
    @ApiResponse({ status: 403, description: '无权限发送心跳' })
    async heartbeat(
        @Param('id', ParseIntPipe) executionId: number,
    ): Promise<HeartbeatResponseDto> {
        const userId = DEFAULT_USER_ID
        return await this.taskExecutionService.heartbeat(executionId, userId)
    }

    @Post('heartbeat/batch')
    @ApiOperation({
        summary: '批量发送心跳',
        description: '批量续租多个执行任务的租约，减少网络请求次数',
    })
    @ApiResponse({
        status: 200,
        description: '批量心跳成功',
        type: BatchHeartbeatResponseDto,
    })
    async batchHeartbeat(
        @Body(ValidationPipe) dto: BatchHeartbeatDto,
    ): Promise<BatchHeartbeatResponseDto> {
        const userId = DEFAULT_USER_ID
        return await this.taskExecutionService.batchHeartbeat(
            dto.executionIds,
            userId,
        )
    }
}

@ApiTags('任务模板管理')
@Controller('task-templates')
export class TaskTemplateController {
    constructor(
        private readonly logger: AppLogger,
        private readonly taskService: TaskService,
    ) {
        this.logger.setContext(TaskTemplateController.name)
    }

    @Post()
    @ApiOperation({ summary: '创建模板任务' })
    @ApiResponse({
        status: 201,
        description: '模板任务创建成功',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 400, description: '请求参数错误' })
    async createTemplateTask(
        @Body(ValidationPipe) dto: CreateTemplateTaskDto,
    ): Promise<TaskResponseDto> {
        this.logger.log(`Creating template task: ${dto.taskName}`)
        return await this.taskService.createTemplateTask(dto)
    }

    @Get()
    @ApiOperation({ summary: '获取模板任务列表' })
    @ApiResponse({
        status: 200,
        description: '获取成功',
        type: PaginatedTaskListDto,
    })
    async getTemplateTaskList(
        @Query() query: TemplateTaskQueryDto,
    ): Promise<PaginatedTaskListDto> {
        this.logger.log('Getting template task list')
        return await this.taskService.getTemplateTaskList(query)
    }

    @Get(':id')
    @ApiOperation({ summary: '获取模板任务详情' })
    @ApiParam({ name: 'id', description: '模板任务ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '获取成功',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 404, description: '模板任务不存在' })
    async getTemplateTaskById(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<TaskResponseDto> {
        this.logger.log(`Getting template task ${taskId}`)
        return await this.taskService.getTemplateTaskById(taskId)
    }

    @Put(':id')
    @ApiOperation({ summary: '更新模板任务' })
    @ApiParam({ name: 'id', description: '模板任务ID', type: Number })
    @ApiResponse({
        status: 200,
        description: '更新成功',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 404, description: '模板任务不存在' })
    async updateTemplateTask(
        @Param('id', ParseIntPipe) taskId: number,
        @Body(ValidationPipe) dto: UpdateTemplateTaskDto,
    ): Promise<TaskResponseDto> {
        this.logger.log(`Updating template task ${taskId}`)
        return await this.taskService.updateTemplateTask(taskId, dto)
    }

    @Delete(':id')
    @ApiOperation({ summary: '删除模板任务' })
    @ApiParam({ name: 'id', description: '模板任务ID', type: Number })
    @ApiResponse({ status: 200, description: '删除成功' })
    @ApiResponse({ status: 404, description: '模板任务不存在' })
    async deleteTemplateTask(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<{ success: boolean; message: string }> {
        this.logger.log(`Deleting template task ${taskId}`)
        await this.taskService.deleteTemplateTask(taskId)
        return { success: true, message: '模板任务删除成功' }
    }
}
