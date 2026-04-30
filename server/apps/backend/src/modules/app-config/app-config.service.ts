import { Injectable } from '@nestjs/common'
import { prisma } from '@repo/db'
import { AppLogger } from 'src/common/log'

@Injectable()
export class AppConfigService {
    constructor(private readonly logger: AppLogger) {
        this.logger.setContext(AppConfigService.name)
    }

    /**
     */
    async getConfigByKey(key: string) {
        const config = await prisma.app_config.findFirst({
            where: {
                config_key: key,
                is_active: true,
                is_deleted: false,
            },
        })

        if (!config) return null

        return {
            key: config.config_key,
            value: config.config_value,
        }
    }

    /**
     */
    async getAllActiveConfigs(): Promise<Record<string, unknown>> {
        const configs = await prisma.app_config.findMany({
            where: {
                is_active: true,
                is_deleted: false,
            },
        })

        const result: Record<string, unknown> = {}
        for (const config of configs) {
            result[config.config_key] = config.config_value
        }

        return result
    }
}
