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

@ApiTags('设备日志管理')
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
        summary: '查询设备日志列表',
        description: '分页查询设备日志列表，支持按用户 ID 和状态过滤',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: '查询成功',
        type: PaginatedDeviceLogsDto,
    })
    async queryDeviceLogs(
        @Query() dto: QueryDeviceLogsDto,
    ): Promise<PaginatedDeviceLogsDto> {
        this.logger.log('查询设备日志列表', { dto })
        return this.deviceLogService.queryDeviceLogs(dto)
    }

    @Get(':id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: '获取单条日志详情',
        description: '根据日志 ID 获取详细信息',
    })
    @ApiParam({
        name: 'id',
        description: '日志记录 ID',
        example: 456,
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: '查询成功',
        type: DeviceLogDto,
    })
    @ApiResponse({
        status: 404,
        description: '日志记录不存在',
    })
    async getDeviceLogDetail(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<DeviceLogDto> {
        this.logger.log(`获取日志详情，ID: ${id}`)
        return this.deviceLogService.getDeviceLogDetail(id)
    }

    @Get(':id/signed-url')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: '获取日志文件下载链接',
        description: '生成日志文件的临时下载链接（有效期 1 小时）',
    })
    @ApiParam({
        name: 'id',
        description: '日志记录 ID',
        example: 456,
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: '生成成功',
        type: SignedUrlDto,
    })
    async getSignedUrl(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<SignedUrlDto> {
        this.logger.log(`获取签名 URL，日志 ID: ${id}`)
        return this.deviceLogService.getSignedUrl(id)
    }

    @Delete('batch')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: '批量删除日志记录',
        description: '软删除指定的日志记录',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: '删除完成',
        type: BatchOperationResultDto,
    })
    async batchDelete(
        @Body() dto: BatchDeleteDto,
    ): Promise<BatchOperationResultDto> {
        this.logger.log(`批量删除日志记录，IDs: ${dto.ids.join(', ')}`)
        return this.deviceLogService.batchDelete(dto)
    }

    @Post('batch/retry')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: '批量重试推送',
        description: '重新发送推送通知给指定日志记录对应的用户',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: '重试完成',
        type: BatchOperationResultDto,
    })
    async batchRetry(
        @Body() dto: BatchRetryDto,
    ): Promise<BatchOperationResultDto> {
        this.logger.log(`批量重试推送，IDs: ${dto.ids.join(', ')}`)
        return this.deviceLogService.batchRetry(dto)
    }
}
