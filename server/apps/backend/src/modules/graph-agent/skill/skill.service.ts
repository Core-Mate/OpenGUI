import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { SkillSyncService } from "../../creator-agent/skill-sync.service";
import { SkillProvider } from "./skill.provider";
import {
	CreateSkillDTO,
	fromDbSkillNodeTypes,
	SkillDTO,
	SkillListParams,
	SkillListResponse,
	SkillNodeType,
	toDbSkillNodeTypes,
	UpdateSkillDTO,
} from "./skill.types";

/**
 * Skill Service
 *
 * 提供 Skill 的 CRUD 操作
 */
@Injectable()
export class SkillService {
	private readonly logger = new Logger(SkillService.name);

	constructor(
		private readonly prismaService: PrismaService,
		private readonly skillProvider: SkillProvider,
		private readonly skillSyncService: SkillSyncService,
	) {}

	/**
	 * 创建 Skill
	 */
	async create(dto: CreateSkillDTO): Promise<SkillDTO> {
		const tenantId = dto.tenantId ?? -1;

		// 检查同租户下是否存在同名 Skill
		const existing = await this.prismaService.skill.findFirst({
			where: {
				name: dto.name,
				tenant_id: tenantId,
				is_deleted: false,
			},
		});

		if (existing) {
			throw new ConflictException(
				`Skill with name "${dto.name}" already exists for tenant ${tenantId}`,
			);
		}

		const skill = await this.prismaService.skill.create({
			data: {
				name: dto.name,
				display_name: dto.displayName,
				description: dto.description || null,
				version: dto.version || "1.0",
				tenant_id: tenantId,
				node_types: toDbSkillNodeTypes(dto.nodeTypes),
				content: dto.content,
				region: dto.region || "ALL",
				is_active: true,
				is_deleted: false,
			},
		});

		this.logger.log(`Created skill ${skill.id}: ${skill.name}`);

		// 清除相关缓存
		this.invalidateCacheForNodeTypes(dto.nodeTypes);

		// 同步到文件系统
		this.triggerSkillSync();

		return this.mapToDTO(skill);
	}

	/**
	 * 获取单个 Skill
	 */
	async findById(id: number): Promise<SkillDTO | null> {
		const skill = await this.prismaService.skill.findFirst({
			where: {
				id,
				is_deleted: false,
			},
		});

		if (!skill) {
			return null;
		}

		return this.mapToDTO(skill);
	}

	/**
	 * 获取 Skill 列表（支持分页和筛选）
	 */
	async findAll(params: SkillListParams): Promise<SkillListResponse> {
		const page = params.page || 1;
		const pageSize = params.pageSize || 20;
		const skip = (page - 1) * pageSize;

		// 构建查询条件
		const where: any = {
			is_deleted: false,
		};

		if (params.tenantId !== undefined) {
			where.tenant_id = params.tenantId;
		}

		if (params.nodeType) {
			where.node_types = {
				has: params.nodeType,
			};
		}

		if (params.region) {
			where.region = {
				in: ["ALL", params.region],
			};
		}

		if (params.isActive !== undefined) {
			where.is_active = params.isActive;
		}

		if (params.search) {
			where.OR = [
				{ name: { contains: params.search, mode: "insensitive" } },
				{ display_name: { contains: params.search, mode: "insensitive" } },
				{ description: { contains: params.search, mode: "insensitive" } },
			];
		}

		const [total, skills] = await Promise.all([
			this.prismaService.skill.count({ where }),
			this.prismaService.skill.findMany({
				where,
				orderBy: { created_at: "desc" },
				skip,
				take: pageSize,
			}),
		]);

		return {
			skills: skills.map((skill) => this.mapToDTO(skill)),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	/**
	 * 更新 Skill
	 */
	async update(id: number, dto: UpdateSkillDTO): Promise<SkillDTO> {
		const existing = await this.prismaService.skill.findFirst({
			where: {
				id,
				is_deleted: false,
			},
		});

		if (!existing) {
			throw new NotFoundException(`Skill ${id} not found`);
		}

		const updateData: any = {
			updated_at: new Date(),
		};

		if (dto.displayName !== undefined) {
			updateData.display_name = dto.displayName;
		}

		if (dto.description !== undefined) {
			updateData.description = dto.description;
		}

		if (dto.version !== undefined) {
			updateData.version = dto.version;
		}

		if (dto.nodeTypes !== undefined) {
			updateData.node_types = toDbSkillNodeTypes(dto.nodeTypes);
		}

		if (dto.content !== undefined) {
			updateData.content = dto.content;
		}

		if (dto.isActive !== undefined) {
			updateData.is_active = dto.isActive;
		}

		if (dto.region !== undefined) {
			updateData.region = dto.region;
		}

		const skill = await this.prismaService.skill.update({
			where: { id },
			data: updateData,
		});

		this.logger.log(`Updated skill ${id}: ${skill.name}`);

		// 清除相关缓存
		const nodeTypes = dto.nodeTypes
			? dto.nodeTypes
			: fromDbSkillNodeTypes(existing.node_types);
		this.invalidateCacheForNodeTypes(nodeTypes);

		// 同步到文件系统
		this.triggerSkillSync();

		return this.mapToDTO(skill);
	}

	/**
	 * 软删除 Skill
	 */
	async delete(id: number): Promise<void> {
		const existing = await this.prismaService.skill.findFirst({
			where: {
				id,
				is_deleted: false,
			},
		});

		if (!existing) {
			throw new NotFoundException(`Skill ${id} not found`);
		}

		await this.prismaService.skill.update({
			where: { id },
			data: {
				is_deleted: true,
				updated_at: new Date(),
			},
		});

		this.logger.log(`Deleted skill ${id}: ${existing.name}`);

		// 清除相关缓存
		this.invalidateCacheForNodeTypes(fromDbSkillNodeTypes(existing.node_types));

		// 同步到文件系统
		this.triggerSkillSync();
	}

	/**
	 * 切换激活状态
	 */
	async toggleActive(id: number): Promise<SkillDTO> {
		const existing = await this.prismaService.skill.findFirst({
			where: {
				id,
				is_deleted: false,
			},
		});

		if (!existing) {
			throw new NotFoundException(`Skill ${id} not found`);
		}

		const skill = await this.prismaService.skill.update({
			where: { id },
			data: {
				is_active: !existing.is_active,
				updated_at: new Date(),
			},
		});

		this.logger.log(
			`Toggled skill ${id} active status: ${existing.is_active} -> ${skill.is_active}`,
		);

		// 清除相关缓存
		this.invalidateCacheForNodeTypes(fromDbSkillNodeTypes(existing.node_types));

		// 同步到文件系统
		this.triggerSkillSync();

		return this.mapToDTO(skill);
	}

	/**
	 * 映射数据库记录到 DTO
	 */
	private mapToDTO(skill: any): SkillDTO {
		return {
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
		};
	}

	/**
	 * 清除指定 node 类型的缓存
	 */
	private invalidateCacheForNodeTypes(nodeTypes: SkillNodeType[]): void {
		for (const nodeType of nodeTypes) {
			this.skillProvider.invalidateCache(nodeType);
		}
	}

	/**
	 * 触发 Skill 文件系统同步（异步，失败只记录日志不阻塞 CRUD）
	 */
	private triggerSkillSync(): void {
		this.skillSyncService.syncAllSkills().catch((error) => {
			this.logger.error("Failed to sync skills to filesystem:", error);
		});
	}
}
