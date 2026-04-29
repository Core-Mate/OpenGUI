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
 */
export enum LogTaskStatus {
    INIT = 'init',
    WAIT_UPLOAD = 'wait_upload',
    UPLOADED = 'uploaded',
    FAILED = 'failed',
}

/**
 */
export class QueryDeviceLogsDto {
    @ApiPropertyOptional({
        description: 'User ID filter',
        example: 1001,
    })
    @IsOptional()
    @IsInt()
    user_id?: number

    @ApiPropertyOptional({
        description: 'Log status filter (multiple values supported)',
        example: ['wait_upload', 'uploaded'],
        enum: LogTaskStatus,
        isArray: true,
    })
    @IsOptional()
    @IsArray()
    @IsEnum(LogTaskStatus, { each: true })
    log_status?: LogTaskStatus[]

    @ApiPropertyOptional({
        description: 'Page number (starts from 1)',
        example: 1,
        default: 1,
    })
    @IsOptional()
    @IsInt()
    @IsPositive()
    @Min(1)
    page?: number = 1

    @ApiPropertyOptional({
        description: 'Items per page',
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
        description: 'Sort field',
        example: 'created_at',
        enum: ['created_at', 'updated_at', 'log_status'],
        default: 'created_at',
    })
    @IsOptional()
    @IsString()
    sort?: 'created_at' | 'updated_at' | 'log_status' = 'created_at'

    @ApiPropertyOptional({
        description: 'Sort order',
        example: 'desc',
        enum: ['asc', 'desc'],
        default: 'desc',
    })
    @IsOptional()
    @IsEnum(['asc', 'desc'])
    order?: 'asc' | 'desc' = 'desc'
}

/**
 */
export class DeviceLogDto {
    @ApiProperty({
        description: 'Log record ID',
        example: 456,
    })
    id: number

    @ApiProperty({
        description: 'User ID',
        example: 1001,
    })
    user_id: number

    @ApiProperty({
        description: 'User phone number',
        example: '13800138000',
    })
    phone_number?: string

    @ApiPropertyOptional({
        description: 'Log file URI',
        example: 'logs/1001/2025-01-15-142530.zip',
    })
    log_uri: string | null

    @ApiProperty({
        description: 'Log start time',
        example: '2025-01-01T00:00:00Z',
    })
    log_start_at: Date

    @ApiProperty({
        description: 'Log end time',
        example: '2025-01-15T23:59:59Z',
    })
    log_end_at: Date

    @ApiProperty({
        description: 'Log status',
        enum: LogTaskStatus,
        example: LogTaskStatus.UPLOADED,
    })
    log_status: LogTaskStatus

    @ApiProperty({
        description: 'Created at',
        example: '2025-01-15T14:23:00Z',
    })
    created_at: Date

    @ApiProperty({
        description: 'Updated at',
        example: '2025-01-15T14:25:30Z',
    })
    updated_at: Date
}

/**
 */
export class PaginatedDeviceLogsDto {
    @ApiProperty({
        description: 'Total records',
        example: 24,
    })
    total: number

    @ApiProperty({
        description: 'Current page number',
        example: 1,
    })
    page: number

    @ApiProperty({
        description: 'Items per page',
        example: 10,
    })
    limit: number

    @ApiProperty({
        description: 'Total pages',
        example: 3,
    })
    total_pages: number

    @ApiProperty({
        description: 'Log record list',
        type: [DeviceLogDto],
    })
    data: DeviceLogDto[]
}

/**
 */
export class BatchDeleteDto {
    @ApiProperty({
        description: 'Array of log record IDs to delete',
        example: [456, 457],
        type: [Number],
    })
    @IsArray()
    @IsInt({ each: true })
    ids: number[]
}

/**
 */
export class BatchRetryDto {
    @ApiProperty({
        description: 'Array of log record IDs to retry',
        example: [456, 457],
        type: [Number],
    })
    @IsArray()
    @IsInt({ each: true })
    ids: number[]
}

/**
 */
export class BatchOperationResultDto {
    @ApiProperty({
        description: 'Operation success flag',
        example: true,
    })
    success: boolean

    @ApiProperty({
        description: 'Successfully processed record count',
        example: 2,
    })
    success_count: number

    @ApiProperty({
        description: 'Failed record count',
        example: 0,
    })
    failed_count: number

    @ApiPropertyOptional({
        description: 'Failure details',
        example: [],
    })
    failed_details?: Array<{
        id: number
        error: string
    }>
}

/**
 */
export class SignedUrlDto {
    @ApiProperty({
        description: 'Operation success flag',
        example: true,
    })
    success: boolean

    @ApiPropertyOptional({
        description: 'Signed URL',
        example: 'https://oss.example.com/logs/1001/xxx.zip?signature=...',
    })
    url?: string

    @ApiPropertyOptional({
        description: 'Error message',
        example: 'Log file does not exist',
    })
    error?: string
}
