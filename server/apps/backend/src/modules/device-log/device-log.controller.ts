import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Post,
    Query,
} from '@nestjs/common'
import {
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger'
import { AppLogger } from 'src/common/log'
import { DeviceLogService } from './device-log.service'
import {
    BatchDeleteDto,
    BatchOperationResultDto,
    BatchRetryDto,
    DeviceLogDto,
    PaginatedDeviceLogsDto,
    QueryDeviceLogsDto,
    SignedUrlDto,
} from './dto/device-log.dto'

@ApiTags('Device Log Management')
@Controller('device-logs')
export class DeviceLogController {
    constructor(
        private readonly logger: AppLogger,
        private readonly deviceLogService: DeviceLogService,
    ) {
        this.logger.setContext(DeviceLogController.name)
    }

    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'List device logs',
        description: 'Paginated device log query with optional user ID and status filters',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Query succeeded',
        type: PaginatedDeviceLogsDto,
    })
    async queryDeviceLogs(
        @Query() dto: QueryDeviceLogsDto,
    ): Promise<PaginatedDeviceLogsDto> {
        this.logger.log('List device logs', { dto })
        return this.deviceLogService.queryDeviceLogs(dto)
    }

    @Get(':id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Get device log details',
        description: 'Get detailed information by log ID',
    })
    @ApiParam({
        name: 'id',
        description: 'Log record ID',
        example: 456,
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Query succeeded',
        type: DeviceLogDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Log record not found',
    })
    async getDeviceLogDetail(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<DeviceLogDto> {
        this.logger.log(`Getting log details, ID: ${id}`)
        return this.deviceLogService.getDeviceLogDetail(id)
    }

    @Get(':id/signed-url')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Get log file download URL',
        description: 'Generate a temporary log file download URL that is valid for 1 hour',
    })
    @ApiParam({
        name: 'id',
        description: 'Log record ID',
        example: 456,
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Generated successfully',
        type: SignedUrlDto,
    })
    async getSignedUrl(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<SignedUrlDto> {
        this.logger.log(`Getting signed URL, log ID: ${id}`)
        return this.deviceLogService.getSignedUrl(id)
    }

    @Delete('batch')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Batch delete log records',
        description: 'Soft delete the specified log records',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Deletion completed',
        type: BatchOperationResultDto,
    })
    async batchDelete(
        @Body() dto: BatchDeleteDto,
    ): Promise<BatchOperationResultDto> {
        this.logger.log(`Batch delete log records，IDs: ${dto.ids.join(', ')}`)
        return this.deviceLogService.batchDelete(dto)
    }

    @Post('batch/retry')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Batch retry push notifications',
        description: 'Resend push notifications to users associated with the selected log records',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Retry completed',
        type: BatchOperationResultDto,
    })
    async batchRetry(
        @Body() dto: BatchRetryDto,
    ): Promise<BatchOperationResultDto> {
        this.logger.log(`Batch retry push notifications，IDs: ${dto.ids.join(', ')}`)
        return this.deviceLogService.batchRetry(dto)
    }
}
