import { ApiProperty } from '@nestjs/swagger'

export class AppConfigItemDto {
    @ApiProperty({ description: '配置 Key' })
    key: string

    @ApiProperty({ description: '配置值 (JSON)' })
    value: unknown
}

export class AppConfigResponseDto {
    @ApiProperty({ type: Boolean })
    success: boolean

    @ApiProperty({ type: AppConfigItemDto })
    data: AppConfigItemDto
}

export class AppConfigListResponseDto {
    @ApiProperty({ type: Boolean })
    success: boolean

    @ApiProperty({ description: '所有 active 配置的扁平 map', type: Object })
    data: Record<string, unknown>
}
