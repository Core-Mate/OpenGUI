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
 */
@Injectable()
export class SkillProvider {
	private readonly logger = new Logger(SkillProvider.name);
	private cache = new Map<string, CacheEntry>();
	private readonly TTL = 5 * 60 * 1000;

	constructor(private readonly prismaService: PrismaService) {}

	/**
	 *
	 * - (tenant_id = -1 OR tenant_id = userTenantId)
	 * - region IN (ALL, userRegion)
	 * - is_active = true
	 * - is_deleted = false
	 *
	 */
	async getSkillsForNode(
		nodeType: SkillNodeType,
		tenantId: number,
		region: string = "CN",
	): Promise<SkillDTO[]> {
		const cacheKey = this.buildCacheKey(nodeType, tenantId, region);


		const cached = this.cache.get(cacheKey);
		if (cached && cached.expireAt > Date.now()) {
			this.logger.debug(`Cache hit for key: ${cacheKey}`);
			return cached.data;
		}

		this.logger.debug(
			`Cache miss for key: ${cacheKey}, fetching from database`,
		);


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
	 *
	 *
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
	 *
	 */
	invalidateCache(nodeType?: SkillNodeType): void {
		if (nodeType) {

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

			const count = this.cache.size;
			this.cache.clear();
			this.logger.debug(`Invalidated all ${count} cache entries`);
		}
	}

	/**
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
	 */
	private buildCacheKey(
		nodeType: SkillNodeType,
		tenantId: number,
		region: string,
	): string {
		return `${nodeType}:${tenantId}:${region}`;
	}
}
