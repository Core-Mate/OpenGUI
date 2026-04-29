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

@ApiTags('Task Management V2')
@Controller('tasks')
export class TaskController {
    constructor(
        private readonly logger: AppLogger,
        private readonly taskService: TaskService,
        private readonly taskExecutionService: TaskExecutionService,
    ) {
        this.logger.setContext(TaskController.name)
    }

    // ============= Task management API =============

    @Post()
    @ApiOperation({ summary: 'Create task' })
    @ApiResponse({
        status: 201,
        description: 'Task created',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Invalid request parameters' })
    async createTask(
        @Body(ValidationPipe) dto: CreateTaskDto,
    ): Promise<TaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} creating task: ${dto.taskName}`)
        return await this.taskService.createTask(userId, dto)
    }

    @Get()
    @ApiOperation({ summary: 'Get task list' })
    @ApiResponse({
        status: 200,
        description: 'Success',
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
    @ApiOperation({ summary: 'Get template task list' })
    @ApiResponse({
        status: 200,
        description: 'Success',
        type: [TaskResponseDto],
    })
    async getTemplateTasks(): Promise<TaskResponseDto[]> {
        this.logger.log('Getting template tasks')
        return await this.taskService.getTemplateTasks()
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get task details' })
    @ApiParam({ name: 'id', description: 'Task ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Success',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Task not found' })
    async getTaskById(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<TaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} getting task ${taskId}`)
        return await this.taskService.getTaskById(taskId, userId)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update task' })
    @ApiParam({ name: 'id', description: 'Task ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Updated',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Task not found' })
    async updateTask(
        @Param('id', ParseIntPipe) taskId: number,
        @Body(ValidationPipe) dto: UpdateTaskDto,
    ): Promise<TaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} updating task ${taskId}`)
        return await this.taskService.updateTask(taskId, userId, dto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete task' })
    @ApiParam({ name: 'id', description: 'Task ID', type: Number })
    @ApiResponse({ status: 200, description: 'Deleted' })
    @ApiResponse({ status: 404, description: 'Task not found' })
    async deleteTask(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<{ success: boolean; message: string }> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} deleting task ${taskId}`)
        await this.taskService.deleteTask(taskId, userId)
        return { success: true, message: 'Task deleted' }
    }

    @Put(':id/pin')
    @ApiOperation({ summary: 'Pin or unpin task' })
    @ApiParam({ name: 'id', description: 'Task ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Operation succeeded',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Task not found' })
    async pinTask(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<TaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} toggling pin for task ${taskId}`)
        return await this.taskService.pinTask(taskId, userId)
    }

    // ============= Task execution API =============

    @Post(':id/execute')
    @ApiOperation({ summary: 'Execute task' })
    @ApiParam({ name: 'id', description: 'Task ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Task execution started',
        type: ExecuteTaskResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Task not found' })
    async executeTask(
        @Param('id', ParseIntPipe) taskId: number,
        @Body(ValidationPipe) dto: ExecuteTaskDto,
    ): Promise<ExecuteTaskResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} executing task ${taskId}`)
        return await this.taskExecutionService.executeTask(taskId, userId, dto)
    }

    @Get(':id/executions')
    @ApiOperation({ summary: 'Get task execution history' })
    @ApiParam({ name: 'id', description: 'Task ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Success',
        type: PaginatedExecutionHistoryDto,
    })
    @ApiResponse({ status: 404, description: 'Task not found' })
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
        summary: 'Sync task stats',
        description: 'Recalculate task statistics from the task_execution table',
    })
    @ApiParam({ name: 'id', description: 'Task ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Synced',
    })
    @ApiResponse({ status: 404, description: 'Task not found' })
    async syncTaskStats(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<{ success: boolean; message: string }> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} syncing stats for task ${taskId}`)

        await this.taskService.getTaskById(taskId, userId)
        await this.taskService.syncTaskStats(taskId)
        return { success: true, message: 'Task stats synced' }
    }

    @Post('sync-all-stats')
    @ApiOperation({
        summary: 'Sync all task stats',
        description: 'Batch-sync all task statistics (admin operation)',
    })
    @ApiResponse({
        status: 200,
        description: 'Synced',
    })
    async syncAllTaskStats(): Promise<{ success: boolean; synced: number }> {
        this.logger.log('Syncing stats for all tasks')
        const result = await this.taskService.syncAllTaskStats()
        return { success: true, synced: result.synced }
    }
}

@ApiTags('Execution Management V2')
@Controller('executions')
export class ExecutionController {
    constructor(
        private readonly logger: AppLogger,
        private readonly taskExecutionService: TaskExecutionService,
    ) {
        this.logger.setContext(ExecutionController.name)
    }

    @Put('cancel-all')
    @ApiOperation({ summary: 'Cancel all executions for the current user' })
    @ApiResponse({
        status: 200,
        description: 'Executions cancelled',
        type: CancelAllExecutionsResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Invalid request parameters' })
    async cancelAllExecutions(): Promise<CancelAllExecutionsResponseDto> {
        const userId = DEFAULT_USER_ID
        this.logger.log(`User ${userId} cancelling all executions`)
        return await this.taskExecutionService.cancelAllExecutions(userId)
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get execution details' })
    @ApiParam({ name: 'id', description: 'Execution record ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Success',
        type: TaskExecutionResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Execution record not found' })
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
    @ApiOperation({ summary: 'Cancel execution' })
    @ApiParam({ name: 'id', description: 'Execution record ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Cancelled',
        type: ExecutionActionResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Execution record not found' })
    @ApiResponse({ status: 400, description: 'Cannot cancel execution in the current state' })
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
    @ApiOperation({ summary: 'Pause execution' })
    @ApiParam({ name: 'id', description: 'Execution record ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Paused',
        type: ExecutionActionResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Execution record not found' })
    @ApiResponse({ status: 400, description: 'Cannot pause execution in the current state' })
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
    @ApiOperation({ summary: 'Resume execution' })
    @ApiParam({ name: 'id', description: 'Execution record ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Resumed',
        type: ExecutionActionResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Execution record not found' })
    @ApiResponse({ status: 400, description: 'Cannot resume execution in the current state' })
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
        summary: 'Submit execution feedback',
        description: 'Submit feedback for a completed execution. Each execution can only be reviewed once.',
    })
    @ApiParam({ name: 'id', description: 'Execution record ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Feedback submitted',
        type: FeedbackResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Execution record not found' })
    @ApiResponse({ status: 400, description: 'Execution is not complete or already has feedback' })
    @ApiResponse({ status: 403, description: 'No permission to submit feedback' })
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
        summary: 'Fork completed execution',
        description: 'Create a new execution from a completed one, copy its conversation history, and resume from plan_supervisor',
    })
    @ApiParam({ name: 'id', description: 'Original execution record ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Fork succeeded',
        type: ForkExecutionResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Execution record not found' })
    @ApiResponse({ status: 400, description: 'Only completed executions can be forked' })
    @ApiResponse({ status: 403, description: 'No permission to fork this execution' })
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

    // ============= Heartbeat lease API =============

    @Post(':id/heartbeat')
    @ApiOperation({
        summary: 'Send heartbeat',
        description: 'The client periodically sends heartbeats to renew the lease and keep task execution alive. If heartbeats stop, the task is terminated after the lease expires. Use the returned heartbeatInterval value as the recommended interval.',
    })
    @ApiParam({ name: 'id', description: 'Execution record ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Heartbeat accepted',
        type: HeartbeatResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Execution record not found' })
    @ApiResponse({ status: 403, description: 'No permission to send heartbeat' })
    async heartbeat(
        @Param('id', ParseIntPipe) executionId: number,
    ): Promise<HeartbeatResponseDto> {
        const userId = DEFAULT_USER_ID
        return await this.taskExecutionService.heartbeat(executionId, userId)
    }

    @Post('heartbeat/batch')
    @ApiOperation({
        summary: 'Batch send heartbeat',
        description: 'Batch renew leases for multiple task executions to reduce network requests',
    })
    @ApiResponse({
        status: 200,
        description: 'Batch heartbeat accepted',
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

@ApiTags('Task Template Management')
@Controller('task-templates')
export class TaskTemplateController {
    constructor(
        private readonly logger: AppLogger,
        private readonly taskService: TaskService,
    ) {
        this.logger.setContext(TaskTemplateController.name)
    }

    @Post()
	    @ApiOperation({ summary: 'Create template task' })
    @ApiResponse({
        status: 201,
	        description: 'Template task created',
        type: TaskResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Invalid request parameters' })
    async createTemplateTask(
        @Body(ValidationPipe) dto: CreateTemplateTaskDto,
    ): Promise<TaskResponseDto> {
        this.logger.log(`Creating template task: ${dto.taskName}`)
        return await this.taskService.createTemplateTask(dto)
    }

    @Get()
    @ApiOperation({ summary: 'Get template task list' })
    @ApiResponse({
        status: 200,
        description: 'Success',
        type: PaginatedTaskListDto,
    })
    async getTemplateTaskList(
        @Query() query: TemplateTaskQueryDto,
    ): Promise<PaginatedTaskListDto> {
        this.logger.log('Getting template task list')
        return await this.taskService.getTemplateTaskList(query)
    }

    @Get(':id')
	    @ApiOperation({ summary: 'Get template task details' })
	    @ApiParam({ name: 'id', description: 'Template task ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Success',
        type: TaskResponseDto,
    })
	    @ApiResponse({ status: 404, description: 'Template task not found' })
    async getTemplateTaskById(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<TaskResponseDto> {
        this.logger.log(`Getting template task ${taskId}`)
        return await this.taskService.getTemplateTaskById(taskId)
    }

    @Put(':id')
	    @ApiOperation({ summary: 'Update template task' })
	    @ApiParam({ name: 'id', description: 'Template task ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Updated',
        type: TaskResponseDto,
    })
	    @ApiResponse({ status: 404, description: 'Template task not found' })
    async updateTemplateTask(
        @Param('id', ParseIntPipe) taskId: number,
        @Body(ValidationPipe) dto: UpdateTemplateTaskDto,
    ): Promise<TaskResponseDto> {
        this.logger.log(`Updating template task ${taskId}`)
        return await this.taskService.updateTemplateTask(taskId, dto)
    }

    @Delete(':id')
	    @ApiOperation({ summary: 'Delete template task' })
	    @ApiParam({ name: 'id', description: 'Template task ID', type: Number })
    @ApiResponse({ status: 200, description: 'Deleted' })
	    @ApiResponse({ status: 404, description: 'Template task not found' })
    async deleteTemplateTask(
        @Param('id', ParseIntPipe) taskId: number,
    ): Promise<{ success: boolean; message: string }> {
        this.logger.log(`Deleting template task ${taskId}`)
        await this.taskService.deleteTemplateTask(taskId)
	        return { success: true, message: 'Template task deleted' }
    }
}
