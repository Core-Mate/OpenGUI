import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { prisma } from '@repo/db'
import { AppLogger } from 'src/common/log'
import type { CheckUpdateResponseDto } from './dto/apk.dto'

// APK status constants
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
     * Generate public APK download URL
     */
    private getApkPublicUrl(apkUri: string): string {
        return `https://${this.apkBucketName}.${this.tosEndpoint}/${apkUri}`
    }

    /**
     * Convert database record to DTO
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
     * Check for updates
     * @param type APK type
     * @param currentVersion Current client APK version. Optional; returns the latest version when omitted.
     */
    async checkUpdate(type: string, currentVersion?: number): Promise<CheckUpdateResponseDto> {
        this.logger.log(`Check for updates，type: ${type}, currentVersion: ${currentVersion ?? 'none'}`)

        // Get the latest published APK (max apk_version and status = 1)
        const latest = await prisma.coremate_apks.findFirst({
            where: {
                apk_type: type,
                status: APK_STATUS.PUBLISHED,
            },
            orderBy: { apk_version: 'desc' },
        })

        // No published APK found
        if (!latest) {
            this.logger.log('No published APK found')
            return { hasUpdate: false }
        }


        if (currentVersion !== undefined && latest.apk_version <= currentVersion) {
            this.logger.log(`No update required，latest version: ${latest.apk_version}, currentVersion: ${currentVersion}`)
            return { hasUpdate: false }
        }

        this.logger.log(`New version found，version: ${latest.apk_version}, id: ${latest.id}`)

        return {
            hasUpdate: true,
            ...this.toApkDto(latest),
        }
    }
}
