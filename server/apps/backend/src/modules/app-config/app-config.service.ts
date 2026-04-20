import { Injectable } from '@nestjs/common'
import { prisma } from '@repo/db'
import { AppLogger } from 'src/common/log'

@Injectable()
export class AppConfigService {
    constructor(private readonly logger: AppLogger) {
        this.logger.setContext(AppConfigService.name)
    }

    /**
     * 按 key 查询单个 active 配置
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
     * 获取所有 active 配置，返回 { key: value } 扁平 map
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
