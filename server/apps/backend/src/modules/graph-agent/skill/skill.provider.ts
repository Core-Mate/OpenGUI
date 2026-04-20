import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
	fromDbSkillNodeTypes,
	SkillDTO,
	SkillNodeType,
	toDbSkillNodeType,
} from "./skill.types";

interface CacheEntry {
	data: SkillDTO[];
	expireAt: number;
}

/**
 * Skill Provider
 *
 * 负责获取和缓存 Skill 数据，供 Node 使用
 */
@Injectable()
export class SkillProvider {
	private readonly logger = new Logger(SkillProvider.name);
	private cache = new Map<string, CacheEntry>();
	private readonly TTL = 5 * 60 * 1000; // 5 分钟缓存

	constructor(private readonly prismaService: PrismaService) {}

	/**
	 * 获取指定 node 类型的所有激活 Skills
	 *
	 * 查询逻辑：
	 * - (tenant_id = -1 OR tenant_id = userTenantId)
	 * - region IN (ALL, userRegion)
	 * - is_active = true
	 * - is_deleted = false
	 * - node_types 包含指定的 nodeType
	 *
	 * @param nodeType Node 类型
	 * @param tenantId 用户所属租户 ID
	 * @param region 用户地区
	 */
	async getSkillsForNode(
		nodeType: SkillNodeType,
		tenantId: number,
		region: string = "CN",
	): Promise<SkillDTO[]> {
		const cacheKey = this.buildCacheKey(nodeType, tenantId, region);

		// 检查缓存
		const cached = this.cache.get(cacheKey);
		if (cached && cached.expireAt > Date.now()) {
			this.logger.debug(`Cache hit for key: ${cacheKey}`);
			return cached.data;
		}

		this.logger.debug(
			`Cache miss for key: ${cacheKey}, fetching from database`,
		);

		// 查询数据库
		const dbNodeType = toDbSkillNodeType(nodeType);
		const skills = await this.prismaService.skill.findMany({
			where: {
				is_active: true,
				is_deleted: false,
				node_types: {
					has: dbNodeType,
				},
				OR: [{ tenant_id: -1 }, { tenant_id: tenantId }],
				region: {
					in: ["ALL", region],
				},
			},
			orderBy: { created_at: "asc" },
		});

		// 转换为 DTO
		const skillDTOs: SkillDTO[] = skills.map((skill) => ({
			id: skill.id,
			name: skill.name,
			displayName: skill.display_name,
			description: skill.description,
			version: skill.version,
			tenantId: skill.tenant_id,
			nodeTypes: fromDbSkillNodeTypes(skill.node_types),
			content: skill.content,
			isActive: skill.is_active,
			region: skill.region,
			createdAt: skill.created_at.toISOString(),
			updatedAt: skill.updated_at.toISOString(),
		}));

		// 更新缓存
		this.cache.set(cacheKey, {
			data: skillDTOs,
			expireAt: Date.now() + this.TTL,
		});

		this.logger.debug(
			`Cached ${skillDTOs.length} skills for key: ${cacheKey}`,
		);

		return skillDTOs;
	}

	/**
	 * 构建 Skill 注入文本
	 *
	 * 将多个 Skill 的 content 用分隔符拼接
	 *
	 * @param skills Skill 列表
	 */
	buildSkillPrompt(skills: SkillDTO[]): string {
		if (skills.length === 0) {
			return "";
		}

		const parts = skills.map((skill) => {
			return `## ${skill.displayName} (v${skill.version})

${skill.content}`;
		});

		return parts.join("\n\n---\n\n");
	}

	/**
	 * 清除缓存
	 *
	 * @param nodeType 可选，指定清除特定 node 类型的缓存；不指定则清除所有缓存
	 */
	invalidateCache(nodeType?: SkillNodeType): void {
		if (nodeType) {
			// 清除包含指定 nodeType 的缓存 key
			const keysToDelete: string[] = [];
			for (const key of this.cache.keys()) {
				if (key.startsWith(`${nodeType}:`)) {
					keysToDelete.push(key);
				}
			}
			for (const key of keysToDelete) {
				this.cache.delete(key);
			}
			this.logger.debug(
				`Invalidated ${keysToDelete.length} cache entries for nodeType: ${nodeType}`,
			);
		} else {
			// 清除所有缓存
			const count = this.cache.size;
			this.cache.clear();
			this.logger.debug(`Invalidated all ${count} cache entries`);
		}
	}

	/**
	 * 清除指定租户的缓存
	 */
	invalidateCacheByTenant(tenantId: number): void {
		const keysToDelete: string[] = [];
		for (const key of this.cache.keys()) {
			if (key.includes(`:${tenantId}:`)) {
				keysToDelete.push(key);
			}
		}
		for (const key of keysToDelete) {
			this.cache.delete(key);
		}
		this.logger.debug(
			`Invalidated ${keysToDelete.length} cache entries for tenantId: ${tenantId}`,
		);
	}

	/**
	 * 构建缓存 Key
	 */
	private buildCacheKey(
		nodeType: SkillNodeType,
		tenantId: number,
		region: string,
	): string {
		return `${nodeType}:${tenantId}:${region}`;
	}
}
