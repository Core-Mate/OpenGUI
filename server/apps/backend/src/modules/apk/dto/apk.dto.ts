import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator'

/**
 */
export class CheckUpdateDto {
    @ApiPropertyOptional({
        description: 'APK type',
        example: 'production',
        default: 'production',
    })
    @IsOptional()
    @IsString()
    type?: string = 'production'

    @ApiPropertyOptional({
        description: 'Current client APK version (apkVersion). If omitted, returns the latest version.',
        example: 8,
    })
    @IsOptional()
    @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
    @IsInt()
    @Min(0)
    currentVersion?: number
}

/**
 */
export class ApkDto {
    @ApiProperty({
        description: 'APK ID',
        example: 9,
    })
    id: number

    @ApiProperty({
        description: 'APK type',
        example: 'production',
    })
    apkType: string

    @ApiProperty({
        description: 'APK storage path',
        example: 'apks/production/1.2.0_1736505407662_app.bin',
    })
    apkUri: string

    @ApiProperty({
        description: 'APK version code',
        example: 10,
    })
    apkVersion: number

    @ApiPropertyOptional({
        description: 'APK file name',
        example: 'app-release.apk',
    })
    apkName: string | null

    @ApiPropertyOptional({
        description: 'APK file size in bytes',
        example: 52428800,
    })
    apkSize: number | null

    @ApiProperty({
        description: 'Uploader',
        example: 'admin@example.com',
    })
    creator: string

    @ApiProperty({
        description: 'Status (1 = published)',
        example: 1,
    })
    status: number

    @ApiProperty({
        description: 'Created at',
        example: '2025-01-10T10:00:00Z',
    })
    createdAt: string

    @ApiProperty({
        description: 'Updated at',
        example: '2025-01-10T10:00:00Z',
    })
    updatedAt: string

    @ApiProperty({
        description: 'Download URL',
        example: 'https://mobile-apk.tos-cn-beijing.volces.com/apks/production/1.2.0_1736505407662_app.bin',
    })
    downloadUrl: string
}

/**
 */
export class CheckUpdateResponseDto {
    @ApiProperty({
        description: 'Whether an update is available',
        example: true,
    })
    hasUpdate: boolean

    @ApiPropertyOptional({
        description: 'APK ID (returned when an update is available)',
        example: 9,
    })
    id?: number

    @ApiPropertyOptional({
        description: 'APK type (returned when an update is available)',
        example: 'production',
    })
    apkType?: string

    @ApiPropertyOptional({
        description: 'APK storage path (returned when an update is available)',
        example: 'apks/production/1.2.0_1736505407662_app.bin',
    })
    apkUri?: string

    @ApiPropertyOptional({
        description: 'APK version code (returned when an update is available)',
        example: 10,
    })
    apkVersion?: number

    @ApiPropertyOptional({
        description: 'APK file name (returned when an update is available)',
        example: 'app-release.apk',
    })
    apkName?: string | null

    @ApiPropertyOptional({
        description: 'APK file size (returned when an update is available)',
        example: 52428800,
    })
    apkSize?: number | null

    @ApiPropertyOptional({
        description: 'Uploader (returned when an update is available)',
        example: 'admin@example.com',
    })
    creator?: string

    @ApiPropertyOptional({
        description: 'Status (returned when an update is available)',
        example: 1,
    })
    status?: number

    @ApiPropertyOptional({
        description: 'Created at (returned when an update is available)',
        example: '2025-01-10T10:00:00Z',
    })
    createdAt?: string

    @ApiPropertyOptional({
        description: 'Updated at (returned when an update is available)',
        example: '2025-01-10T10:00:00Z',
    })
    updatedAt?: string

    @ApiPropertyOptional({
        description: 'Download URL (returned when an update is available)',
        example: 'https://mobile-apk.tos-cn-beijing.volces.com/apks/production/1.2.0_1736505407662_app.bin',
    })
    downloadUrl?: string
}

/**
 */
export class CheckUpdateApiResponseDto {
    @ApiProperty({
        description: 'Request success flag',
        example: true,
    })
    success: boolean

    @ApiProperty({
        description: 'Response data',
        type: CheckUpdateResponseDto,
    })
    data: CheckUpdateResponseDto
}
