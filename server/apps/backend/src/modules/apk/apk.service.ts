import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { prisma } from '@repo/db'
import { AppLogger } from 'src/common/log'
import type { CheckUpdateResponseDto } from './dto/apk.dto'

// APK 状态常量
const APK_STATUS = {
    DELETED: -1,
    UNPUBLISHED: 0,
    PUBLISHED: 1,
} as const

@Injectable()
export class ApkService {
    private readonly apkBucketName: string
    private readonly tosEndpoint: string

    constructor(
        private readonly logger: AppLogger,
        private readonly configService: ConfigService,
    ) {
        this.logger.setContext(ApkService.name)
        this.apkBucketName = this.configService.get<string>('APK_BUCKET_NAME', 'mobile-apk')
        this.tosEndpoint = this.configService.get<string>('TOS_ENDPOINT', 'tos-cn-beijing.volces.com')
    }

    /**
     * 生成 APK 公共下载 URL
     */
    private getApkPublicUrl(apkUri: string): string {
        return `https://${this.apkBucketName}.${this.tosEndpoint}/${apkUri}`
    }

    /**
     * 将数据库记录转换为 DTO
     */
    private toApkDto(apk: {
        id: number
        apk_type: string
        apk_uri: string
        apk_version: bigint
        apk_name: string | null
        apk_size: bigint | null
        creator: string
        status: number
        created_at: Date
        updated_at: Date
    }) {
        return {
            id: apk.id,
            apkType: apk.apk_type,
            apkUri: apk.apk_uri,
            apkVersion: Number(apk.apk_version),
            apkName: apk.apk_name,
            apkSize: apk.apk_size ? Number(apk.apk_size) : null,
            creator: apk.creator,
            status: apk.status,
            createdAt: apk.created_at.toISOString(),
            updatedAt: apk.updated_at.toISOString(),
            downloadUrl: this.getApkPublicUrl(apk.apk_uri),
        }
    }

    /**
     * 检查更新
     * @param type APK 类型
     * @param currentVersion 当前客户端的 APK 版本号（可选，不传则返回最新版本）
     * @returns 检查更新结果
     */
    async checkUpdate(type: string, currentVersion?: number): Promise<CheckUpdateResponseDto> {
        this.logger.log(`检查更新，type: ${type}, currentVersion: ${currentVersion ?? 'none'}`)

        // 获取最新已发布的 APK（apk_version 最大 + status = 1）
        const latest = await prisma.coremate_apks.findFirst({
            where: {
                apk_type: type,
                status: APK_STATUS.PUBLISHED,
            },
            orderBy: { apk_version: 'desc' },
        })

        // 没有找到已发布的 APK
        if (!latest) {
            this.logger.log('没有找到已发布的 APK')
            return { hasUpdate: false }
        }

        // 如果传了 currentVersion 且已是最新版本，返回无更新
        if (currentVersion !== undefined && latest.apk_version <= currentVersion) {
            this.logger.log(`无需更新，latest version: ${latest.apk_version}, currentVersion: ${currentVersion}`)
            return { hasUpdate: false }
        }

        this.logger.log(`发现新版本，version: ${latest.apk_version}, id: ${latest.id}`)

        return {
            hasUpdate: true,
            ...this.toApkDto(latest),
        }
    }
}
