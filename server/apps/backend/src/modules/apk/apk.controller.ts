import {
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Query,
} from '@nestjs/common'
import {
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger'
import { AppLogger } from 'src/common/log'
import { ApkService } from './apk.service'
import {
    CheckUpdateApiResponseDto,
    CheckUpdateDto,
} from './dto/apk.dto'

@ApiTags('APK 管理')
@Controller('apks')
export class ApkController {
    constructor(
        private readonly logger: AppLogger,
        private readonly apkService: ApkService,
    ) {
        this.logger.setContext(ApkController.name)
    }

    /**
     * 检查更新
     * 客户端调用此接口检查是否有新版本 APK
     */
    @Get('check-update')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: '检查更新',
        description: '客户端传入当前 APK 版本号，返回是否有新版本及下载地址',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: '检查成功',
        type: CheckUpdateApiResponseDto,
    })
    async checkUpdate(
        @Query() dto: CheckUpdateDto,
    ): Promise<CheckUpdateApiResponseDto> {
        this.logger.log('检查 APK 更新', { dto })

        const result = await this.apkService.checkUpdate(
            dto.type ?? 'production',
            dto.currentVersion,
        )

        return {
            success: true,
            data: result,
        }
    }
}
