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
 */
export class CreateTemplateTaskDto {
    @ApiProperty({
        description: 'Task name',
        example: 'Post an update on Xiaohongshu',
        maxLength: 255,
    })
    @IsString()
    @MaxLength(255)
    taskName: string

    @ApiProperty({
        description: 'Task description',
        example: 'Post a short weather update on Xiaohongshu',
        required: false,
    })
    @IsOptional()
    @IsString()
    taskDescription?: string

    @ApiProperty({
        description: 'Related platforms',
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
        description: 'Task category',
        enum: TaskCategory,
        required: false,
        default: TaskCategory.CUSTOM,
    })
    @IsOptional()
    @IsEnum(TaskCategory)
    category?: TaskCategory
}

/**
 */
export class UpdateTemplateTaskDto {
    @ApiProperty({
        description: 'Task name',
        example: 'Post an update on Xiaohongshu',
        maxLength: 255,
        required: false,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    taskName?: string

    @ApiProperty({
        description: 'Task description',
        example: 'Post a short weather update on Xiaohongshu',
        required: false,
    })
    @IsOptional()
    @IsString()
    taskDescription?: string

    @ApiProperty({
        description: 'Related platforms',
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
        description: 'Task category',
        enum: TaskCategory,
        required: false,
    })
    @IsOptional()
    @IsEnum(TaskCategory)
    category?: TaskCategory
}

/**
 */
export class TemplateTaskQueryDto {
    @ApiProperty({ description: 'Page number', required: false, default: 1 })
    @IsOptional()
    page?: number

    @ApiProperty({ description: 'Items per page', required: false, default: 20 })
    @IsOptional()
    pageSize?: number

    @ApiProperty({
	        description: 'Task category filter',
        enum: TaskCategory,
        required: false,
    })
    @IsOptional()
    @IsEnum(TaskCategory)
    category?: TaskCategory

    @ApiProperty({
        description: 'Platform filter',
        enum: PlatformType,
        required: false,
    })
    @IsOptional()
    @IsEnum(PlatformType)
    platform?: PlatformType

    @ApiProperty({ description: 'Search keyword', required: false })
    @IsOptional()
    @IsString()
    keyword?: string
}
