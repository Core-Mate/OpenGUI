import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    IsPositive,
    IsString,
    Max,
    Min,
} from 'class-validator'

/**
 * 日志任务状态枚举
 */
export enum LogTaskStatus {
    INIT = 'init',
    WAIT_UPLOAD = 'wait_upload',
    UPLOADED = 'uploaded',
    FAILED = 'failed',
}

/**
 * 查询日志列表请求 DTO
 */
export class QueryDeviceLogsDto {
    @ApiPropertyOptional({
        description: '用户 ID 过滤',
        example: 1001,
    })
    @IsOptional()
    @IsInt()
    user_id?: number

    @ApiPropertyOptional({
        description: '日志状态过滤（支持多个）',
        example: ['wait_upload', 'uploaded'],
        enum: LogTaskStatus,
        isArray: true,
    })
    @IsOptional()
    @IsArray()
    @IsEnum(LogTaskStatus, { each: true })
    log_status?: LogTaskStatus[]

    @ApiPropertyOptional({
        description: '页码（从 1 开始）',
        example: 1,
        default: 1,
    })
    @IsOptional()
    @IsInt()
    @IsPositive()
    @Min(1)
    page?: number = 1

    @ApiPropertyOptional({
        description: '每页数量',
        example: 10,
        default: 10,
    })
    @IsOptional()
    @IsInt()
    @IsPositive()
    @Min(1)
    @Max(100)
    limit?: number = 10

    @ApiPropertyOptional({
        description: '排序字段',
        example: 'created_at',
        enum: ['created_at', 'updated_at', 'log_status'],
        default: 'created_at',
    })
    @IsOptional()
    @IsString()
    sort?: 'created_at' | 'updated_at' | 'log_status' = 'created_at'

    @ApiPropertyOptional({
        description: '排序顺序',
        example: 'desc',
        enum: ['asc', 'desc'],
        default: 'desc',
    })
    @IsOptional()
    @IsEnum(['asc', 'desc'])
    order?: 'asc' | 'desc' = 'desc'
}

/**
 * 日志记录响应 DTO
 */
export class DeviceLogDto {
    @ApiProperty({
        description: '日志记录 ID',
        example: 456,
    })
    id: number

    @ApiProperty({
        description: '用户 ID',
        example: 1001,
    })
    user_id: number

    @ApiProperty({
        description: '用户手机号',
        example: '13800138000',
    })
    phone_number?: string

    @ApiPropertyOptional({
        description: '日志文件 URI',
        example: 'logs/1001/2025-01-15-142530.zip',
    })
    log_uri: string | null

    @ApiProperty({
        description: '日志起始时间',
        example: '2025-01-01T00:00:00Z',
    })
    log_start_at: Date

    @ApiProperty({
        description: '日志结束时间',
        example: '2025-01-15T23:59:59Z',
    })
    log_end_at: Date

    @ApiProperty({
        description: '日志状态',
        enum: LogTaskStatus,
        example: LogTaskStatus.UPLOADED,
    })
    log_status: LogTaskStatus

    @ApiProperty({
        description: '创建时间',
        example: '2025-01-15T14:23:00Z',
    })
    created_at: Date

    @ApiProperty({
        description: '更新时间',
        example: '2025-01-15T14:25:30Z',
    })
    updated_at: Date
}

/**
 * 分页日志列表响应 DTO
 */
export class PaginatedDeviceLogsDto {
    @ApiProperty({
        description: '总记录数',
        example: 24,
    })
    total: number

    @ApiProperty({
        description: '当前页码',
        example: 1,
    })
    page: number

    @ApiProperty({
        description: '每页数量',
        example: 10,
    })
    limit: number

    @ApiProperty({
        description: '总页数',
        example: 3,
    })
    total_pages: number

    @ApiProperty({
        description: '日志记录列表',
        type: [DeviceLogDto],
    })
    data: DeviceLogDto[]
}

/**
 * 批量删除请求 DTO
 */
export class BatchDeleteDto {
    @ApiProperty({
        description: '要删除的日志记录 ID 数组',
        example: [456, 457],
        type: [Number],
    })
    @IsArray()
    @IsInt({ each: true })
    ids: number[]
}

/**
 * 批量重试推送请求 DTO
 */
export class BatchRetryDto {
    @ApiProperty({
        description: '要重试的日志记录 ID 数组',
        example: [456, 457],
        type: [Number],
    })
    @IsArray()
    @IsInt({ each: true })
    ids: number[]
}

/**
 * 批量操作响应 DTO
 */
export class BatchOperationResultDto {
    @ApiProperty({
        description: '操作是否成功',
        example: true,
    })
    success: boolean

    @ApiProperty({
        description: '成功处理的记录数',
        example: 2,
    })
    success_count: number

    @ApiProperty({
        description: '失败的记录数',
        example: 0,
    })
    failed_count: number

    @ApiPropertyOptional({
        description: '失败详情',
        example: [],
    })
    failed_details?: Array<{
        id: number
        error: string
    }>
}

/**
 * 获取签名 URL 响应 DTO
 */
export class SignedUrlDto {
    @ApiProperty({
        description: '操作是否成功',
        example: true,
    })
    success: boolean

    @ApiPropertyOptional({
        description: '签名 URL',
        example: 'https://oss.example.com/logs/1001/xxx.zip?signature=...',
    })
    url?: string

    @ApiPropertyOptional({
        description: '错误信息',
        example: '日志文件不存在',
    })
    error?: string
}
