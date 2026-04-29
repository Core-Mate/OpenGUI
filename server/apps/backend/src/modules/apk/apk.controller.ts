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

@ApiTags('APK Management')
@Controller('apks')
export class ApkController {
    constructor(
        private readonly logger: AppLogger,
        private readonly apkService: ApkService,
    ) {
        this.logger.setContext(ApkController.name)
    }

    /**
     * Check for updates
     * Client calls this endpoint to check for a new APK version
     */
    @Get('check-update')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Check for updates',
        description: 'Client sends the current APK version and receives update availability and download URL',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Check succeeded',
        type: CheckUpdateApiResponseDto,
    })
    async checkUpdate(
        @Query() dto: CheckUpdateDto,
    ): Promise<CheckUpdateApiResponseDto> {
        this.logger.log('Check APK update', { dto })

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
