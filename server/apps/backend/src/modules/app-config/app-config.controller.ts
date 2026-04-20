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

@ApiTags('客户端配置')
@Controller('app-config')
export class AppConfigController {
    constructor(
        private readonly logger: AppLogger,
        private readonly appConfigService: AppConfigService,
    ) {
        this.logger.setContext(AppConfigController.name)
    }

    /**
     * 获取所有 active 配置（扁平 map）
     */
    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: '获取所有客户端配置',
        description: '返回所有激活状态的客户端配置，以 key-value 扁平 map 形式返回',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: '获取成功',
        type: AppConfigListResponseDto,
    })
    async getAllConfigs(): Promise<AppConfigListResponseDto> {
        this.logger.log('获取所有客户端配置')
        const configs = await this.appConfigService.getAllActiveConfigs()

        return {
            success: true,
            data: configs,
        }
    }

    /**
     * 按 key 获取单个 active 配置
     */
    @Get(':key')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: '按 key 获取客户端配置',
        description: '根据配置 key 获取单个激活状态的客户端配置',
    })
    @ApiParam({ name: 'key', description: '配置 Key' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: '获取成功',
        type: AppConfigResponseDto,
    })
    async getConfigByKey(@Param('key') key: string): Promise<AppConfigResponseDto> {
        this.logger.log(`获取客户端配置: ${key}`)
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
