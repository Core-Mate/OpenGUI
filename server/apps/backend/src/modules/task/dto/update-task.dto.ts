import { ApiProperty } from '@nestjs/swagger'
import {
    IsArray,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator'
import { PlatformType, TaskCategory } from '../enums/task.enums'

export class UpdateTaskDto {
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
