import { ApiProperty } from '@nestjs/swagger'
import {
    IsArray,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator'
import { PlatformType, TaskCategory } from '../enums/task.enums'

/**
 * 创建模板任务 DTO
 */
export class CreateTemplateTaskDto {
    @ApiProperty({
        description: '任务名称',
        example: '小红书发布动态',
        maxLength: 255,
    })
    @IsString()
    @MaxLength(255)
    taskName: string

    @ApiProperty({
        description: '任务描述',
        example: '在小红书上发布一条关于今天天气很好的动态',
        required: false,
    })
    @IsOptional()
    @IsString()
    taskDescription?: string

    @ApiProperty({
        description: '相关平台列表',
        enum: PlatformType,
        isArray: true,
        required: false,
        example: ['XIAOHONGSHU'],
    })
    @IsOptional()
    @IsArray()
    @IsEnum(PlatformType, { each: true })
    relatedPlatforms?: PlatformType[]

    @ApiProperty({
        description: '任务类别',
        enum: TaskCategory,
        required: false,
        default: TaskCategory.CUSTOM,
    })
    @IsOptional()
    @IsEnum(TaskCategory)
    category?: TaskCategory
}

/**
 * 更新模板任务 DTO
 */
export class UpdateTemplateTaskDto {
    @ApiProperty({
        description: '任务名称',
        example: '小红书发布动态',
        maxLength: 255,
        required: false,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    taskName?: string

    @ApiProperty({
        description: '任务描述',
        example: '在小红书上发布一条关于今天天气很好的动态',
        required: false,
    })
    @IsOptional()
    @IsString()
    taskDescription?: string

    @ApiProperty({
        description: '相关平台列表',
        enum: PlatformType,
        isArray: true,
        required: false,
        example: ['XIAOHONGSHU'],
    })
    @IsOptional()
    @IsArray()
    @IsEnum(PlatformType, { each: true })
    relatedPlatforms?: PlatformType[]

    @ApiProperty({
        description: '任务类别',
        enum: TaskCategory,
        required: false,
    })
    @IsOptional()
    @IsEnum(TaskCategory)
    category?: TaskCategory
}

/**
 * 模板任务查询参数 DTO
 */
export class TemplateTaskQueryDto {
    @ApiProperty({ description: '页码', required: false, default: 1 })
    @IsOptional()
    page?: number

    @ApiProperty({ description: '每页数量', required: false, default: 20 })
    @IsOptional()
    pageSize?: number

    @ApiProperty({
        description: '任务类别筛选',
        enum: TaskCategory,
        required: false,
    })
    @IsOptional()
    @IsEnum(TaskCategory)
    category?: TaskCategory

    @ApiProperty({
        description: '平台筛选',
        enum: PlatformType,
        required: false,
    })
    @IsOptional()
    @IsEnum(PlatformType)
    platform?: PlatformType

    @ApiProperty({ description: '搜索关键词', required: false })
    @IsOptional()
    @IsString()
    keyword?: string
}
