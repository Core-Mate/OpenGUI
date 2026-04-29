import { ApiProperty } from '@nestjs/swagger'

export class AppConfigItemDto {
    @ApiProperty({ description: 'Config key' })
    key: string

    @ApiProperty({ description: 'Config value (JSON)' })
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

    @ApiProperty({ description: 'Flat map of all active configs', type: Object })
    data: Record<string, unknown>
}
