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
