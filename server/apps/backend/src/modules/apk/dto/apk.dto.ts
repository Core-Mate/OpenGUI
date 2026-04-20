import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator'

/**
 * 检查更新请求 DTO
 */
export class CheckUpdateDto {
    @ApiPropertyOptional({
        description: 'APK 类型',
        example: 'production',
        default: 'production',
    })
    @IsOptional()
    @IsString()
    type?: string = 'production'

    @ApiPropertyOptional({
        description: '当前客户端 APK 的版本号 (apkVersion)，不传则返回最新版本',
        example: 8,
    })
    @IsOptional()
    @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
    @IsInt()
    @Min(0)
    currentVersion?: number
}

/**
 * APK 信息 DTO
 */
export class ApkDto {
    @ApiProperty({
        description: 'APK ID',
        example: 9,
    })
    id: number

    @ApiProperty({
        description: 'APK 类型',
        example: 'production',
    })
    apkType: string

    @ApiProperty({
        description: 'APK 存储路径',
        example: 'apks/production/1.2.0_1736505407662_app.bin',
    })
    apkUri: string

    @ApiProperty({
        description: 'APK 版本号 (versionCode)',
        example: 10,
    })
    apkVersion: number

    @ApiPropertyOptional({
        description: 'APK 文件名',
        example: 'app-release.apk',
    })
    apkName: string | null

    @ApiPropertyOptional({
        description: 'APK 文件大小（字节）',
        example: 52428800,
    })
    apkSize: number | null

    @ApiProperty({
        description: '上传者',
        example: 'admin@example.com',
    })
    creator: string

    @ApiProperty({
        description: '状态（1=已发布）',
        example: 1,
    })
    status: number

    @ApiProperty({
        description: '创建时间',
        example: '2025-01-10T10:00:00Z',
    })
    createdAt: string

    @ApiProperty({
        description: '更新时间',
        example: '2025-01-10T10:00:00Z',
    })
    updatedAt: string

    @ApiProperty({
        description: '下载地址',
        example: 'https://mobile-apk.tos-cn-beijing.volces.com/apks/production/1.2.0_1736505407662_app.bin',
    })
    downloadUrl: string
}

/**
 * 检查更新响应 DTO - 有更新
 */
export class CheckUpdateResponseDto {
    @ApiProperty({
        description: '是否有更新',
        example: true,
    })
    hasUpdate: boolean

    @ApiPropertyOptional({
        description: 'APK ID（有更新时返回）',
        example: 9,
    })
    id?: number

    @ApiPropertyOptional({
        description: 'APK 类型（有更新时返回）',
        example: 'production',
    })
    apkType?: string

    @ApiPropertyOptional({
        description: 'APK 存储路径（有更新时返回）',
        example: 'apks/production/1.2.0_1736505407662_app.bin',
    })
    apkUri?: string

    @ApiPropertyOptional({
        description: 'APK 版本号 (versionCode)（有更新时返回）',
        example: 10,
    })
    apkVersion?: number

    @ApiPropertyOptional({
        description: 'APK 文件名（有更新时返回）',
        example: 'app-release.apk',
    })
    apkName?: string | null

    @ApiPropertyOptional({
        description: 'APK 文件大小（有更新时返回）',
        example: 52428800,
    })
    apkSize?: number | null

    @ApiPropertyOptional({
        description: '上传者（有更新时返回）',
        example: 'admin@example.com',
    })
    creator?: string

    @ApiPropertyOptional({
        description: '状态（有更新时返回）',
        example: 1,
    })
    status?: number

    @ApiPropertyOptional({
        description: '创建时间（有更新时返回）',
        example: '2025-01-10T10:00:00Z',
    })
    createdAt?: string

    @ApiPropertyOptional({
        description: '更新时间（有更新时返回）',
        example: '2025-01-10T10:00:00Z',
    })
    updatedAt?: string

    @ApiPropertyOptional({
        description: '下载地址（有更新时返回）',
        example: 'https://mobile-apk.tos-cn-beijing.volces.com/apks/production/1.2.0_1736505407662_app.bin',
    })
    downloadUrl?: string
}

/**
 * API 标准响应包装
 */
export class CheckUpdateApiResponseDto {
    @ApiProperty({
        description: '请求是否成功',
        example: true,
    })
    success: boolean

    @ApiProperty({
        description: '响应数据',
        type: CheckUpdateResponseDto,
    })
    data: CheckUpdateResponseDto
}
