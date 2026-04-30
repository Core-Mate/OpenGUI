import {
	Controller,
	Get,
	Post,
	Patch,
	Delete,
	Body,
	Param,
	Query,
	ParseIntPipe,
	HttpStatus,
	HttpException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { SkillService } from "./skill.service";
import {
	type CreateSkillDTO,
	SkillNodeType,
	type UpdateSkillDTO,
} from "./skill.types";

@ApiTags("Skill")
@Controller("agent/skills")
export class SkillController {
	constructor(private readonly skillService: SkillService) {}

	@Get()
	@ApiOperation({ summary: "Get Skill list" })
	@ApiQuery({ name: "page", required: false, type: Number })
	@ApiQuery({ name: "pageSize", required: false, type: Number })
	@ApiQuery({ name: "nodeType", required: false, enum: SkillNodeType })
	@ApiQuery({ name: "tenantId", required: false, type: Number })
	@ApiQuery({ name: "search", required: false, type: String })
	@ApiQuery({ name: "region", required: false, type: String })
	@ApiQuery({ name: "isActive", required: false, type: Boolean })
	@ApiResponse({ status: 200, description: "Skill list retrieved successfully" })
	async getSkills(
		@Query("page") page?: string,
		@Query("pageSize") pageSize?: string,
		@Query("nodeType") nodeType?: SkillNodeType,
		@Query("tenantId") tenantId?: string,
		@Query("search") search?: string,
		@Query("region") region?: string,
		@Query("isActive") isActive?: string,
	) {
		const result = await this.skillService.findAll({
			page: page ? parseInt(page, 10) : undefined,
			pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
			nodeType,
			tenantId: tenantId ? parseInt(tenantId, 10) : undefined,
			search,
			region,
			isActive: isActive !== undefined ? isActive === "true" : undefined,
		});

		return {
			success: true,
			data: result.skills,
			pagination: {
				page: result.page,
				pageSize: result.pageSize,
				total: result.total,
				totalPages: result.totalPages,
			},
		};
	}

	@Get(":id")
	@ApiOperation({ summary: "Get one Skill" })
	@ApiResponse({ status: 200, description: "Skill retrieved successfully" })
	@ApiResponse({ status: 404, description: "Skill does not exist" })
	async getSkill(@Param("id", ParseIntPipe) id: number) {
		const skill = await this.skillService.findById(id);

		if (!skill) {
			throw new HttpException("Skill not found", HttpStatus.NOT_FOUND);
		}

		return {
			success: true,
			data: skill,
		};
	}

	@Post()
	@ApiOperation({ summary: "Create Skill" })
	@ApiResponse({ status: 201, description: "Skill created successfully" })
	@ApiResponse({ status: 400, description: "Invalid parameters" })
	@ApiResponse({ status: 409, description: "Skill name already exists" })
	async createSkill(@Body() data: CreateSkillDTO) {
		// Validate required fields.
		if (!data.name || !data.displayName || !data.content || !data.nodeTypes) {
			throw new HttpException(
				"name, displayName, content, nodeTypes are required",
				HttpStatus.BAD_REQUEST,
			);
		}

		// Validate nodeTypes.
		if (!Array.isArray(data.nodeTypes) || data.nodeTypes.length === 0) {
			throw new HttpException(
				"nodeTypes must be a non-empty array",
				HttpStatus.BAD_REQUEST,
			);
		}

		for (const nodeType of data.nodeTypes) {
			if (!Object.values(SkillNodeType).includes(nodeType)) {
				throw new HttpException(
					`Invalid nodeType: ${nodeType}`,
					HttpStatus.BAD_REQUEST,
				);
			}
		}

		try {
			const skill = await this.skillService.create(data);
			return {
				success: true,
				data: skill,
			};
		} catch (error) {
			const err = error as Error;
			if (err.message.includes("already exists")) {
				throw new HttpException(err.message, HttpStatus.CONFLICT);
			}
			throw error;
		}
	}

	@Patch(":id")
	@ApiOperation({ summary: "Update Skill" })
	@ApiResponse({ status: 200, description: "Skill updated successfully" })
	@ApiResponse({ status: 404, description: "Skill does not exist" })
	async updateSkill(
		@Param("id", ParseIntPipe) id: number,
		@Body() data: UpdateSkillDTO,
	) {
		// Validate nodeTypes if provided.
		if (data.nodeTypes) {
			if (!Array.isArray(data.nodeTypes) || data.nodeTypes.length === 0) {
				throw new HttpException(
					"nodeTypes must be a non-empty array",
					HttpStatus.BAD_REQUEST,
				);
			}

			for (const nodeType of data.nodeTypes) {
				if (!Object.values(SkillNodeType).includes(nodeType)) {
					throw new HttpException(
						`Invalid nodeType: ${nodeType}`,
						HttpStatus.BAD_REQUEST,
					);
				}
			}
		}

		try {
			const skill = await this.skillService.update(id, data);
			return {
				success: true,
				data: skill,
			};
		} catch (error) {
			const err = error as Error;
			if (err.message.includes("not found")) {
				throw new HttpException(err.message, HttpStatus.NOT_FOUND);
			}
			throw error;
		}
	}

	@Delete(":id")
	@ApiOperation({ summary: "Delete Skill" })
	@ApiResponse({ status: 200, description: "Skill deleted successfully" })
	@ApiResponse({ status: 404, description: "Skill does not exist" })
	async deleteSkill(@Param("id", ParseIntPipe) id: number) {
		try {
			await this.skillService.delete(id);
			return {
				success: true,
				message: "Skill deleted",
			};
		} catch (error) {
			const err = error as Error;
			if (err.message.includes("not found")) {
				throw new HttpException(err.message, HttpStatus.NOT_FOUND);
			}
			throw error;
		}
	}

	@Post(":id/toggle-active")
	@ApiOperation({ summary: "Toggle Skill active state" })
	@ApiResponse({ status: 200, description: "Skill active state toggled successfully" })
	@ApiResponse({ status: 404, description: "Skill does not exist" })
	async toggleActive(@Param("id", ParseIntPipe) id: number) {
		try {
			const skill = await this.skillService.toggleActive(id);
			return {
				success: true,
				data: skill,
				message: `Skill ${skill.isActive ? "activated" : "deactivated"}`,
			};
		} catch (error) {
			const err = error as Error;
			if (err.message.includes("not found")) {
				throw new HttpException(err.message, HttpStatus.NOT_FOUND);
			}
			throw error;
		}
	}
}
