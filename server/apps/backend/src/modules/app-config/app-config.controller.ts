import {
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
} from '@nestjs/common'
import {
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger'
import { AppLogger } from 'src/common/log'
import { AppConfigService } from './app-config.service'
import {
    AppConfigListResponseDto,
    AppConfigResponseDto,
} from './dto/app-config.dto'

@ApiTags('Client Configuration')
@Controller('app-config')
export class AppConfigController {
    constructor(
        private readonly logger: AppLogger,
        private readonly appConfigService: AppConfigService,
    ) {
        this.logger.setContext(AppConfigController.name)
    }

    /**
     * Get all active configs as a flat map
     */
    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Get all client configuration values',
        description: 'Returns all active client configuration values as a flat key-value map.',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Success',
        type: AppConfigListResponseDto,
    })
    async getAllConfigs(): Promise<AppConfigListResponseDto> {
        this.logger.log('Getting all client configuration values')
        const configs = await this.appConfigService.getAllActiveConfigs()

        return {
            success: true,
            data: configs,
        }
    }

    /**
     * Get one active config by key
     */
    @Get(':key')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Get a client configuration value by key',
        description: 'Returns one active client configuration value by configuration key.',
    })
    @ApiParam({ name: 'key', description: 'Config key' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Success',
        type: AppConfigResponseDto,
    })
    async getConfigByKey(@Param('key') key: string): Promise<AppConfigResponseDto> {
        this.logger.log(`Getting client configuration: ${key}`)
        const config = await this.appConfigService.getConfigByKey(key)

        if (!config) {
            return {
                success: true,
                data: { key, value: null },
            }
        }

        return {
            success: true,
            data: config,
        }
    }
}
