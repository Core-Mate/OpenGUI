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
import {
	AgentName,
	type CreateAgentConfigDTO,
	type UpdateAgentConfigDTO,
} from "./types";
import { AgentConfigService } from "./agent-config.service";

@ApiTags("Agent Config")
@Controller("agent-config")
export class AgentConfigController {
	constructor(private readonly configService: AgentConfigService) {}

	@Get()
	@ApiOperation({ summary: "获取配置列表" })
	@ApiQuery({ name: "page", required: false, type: Number })
	@ApiQuery({ name: "pageSize", required: false, type: Number })
	@ApiQuery({ name: "agentName", required: false, enum: AgentName })
	@ApiQuery({ name: "search", required: false, type: String })
	@ApiResponse({ status: 200, description: "成功获取配置列表" })
	async getConfigs(
		@Query("page") page?: string,
		@Query("pageSize") pageSize?: string,
		@Query("agentName") agentName?: AgentName,
		@Query("search") search?: string,
	) {
		const result = await this.configService.getConfigs({
			page: page ? parseInt(page, 10) : undefined,
			pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
			agentName,
			search,
		});

		return {
			success: true,
			data: result.configs,
			pagination: {
				page: result.page,
				pageSize: result.pageSize,
				total: result.total,
				totalPages: result.totalPages,
			},
		};
	}

	@Get(":id")
	@ApiOperation({ summary: "获取单个配置" })
	@ApiResponse({ status: 200, description: "成功获取配置" })
	@ApiResponse({ status: 404, description: "配置不存在" })
	async getConfig(@Param("id", ParseIntPipe) id: number) {
		const config = await this.configService.getConfigById(id);

		if (!config) {
			throw new HttpException("Config not found", HttpStatus.NOT_FOUND);
		}

		return {
			success: true,
			data: config,
		};
	}

	@Post()
	@ApiOperation({ summary: "创建配置" })
	@ApiResponse({ status: 201, description: "成功创建配置" })
	@ApiResponse({ status: 400, description: "参数错误" })
	async createConfig(@Body() data: CreateAgentConfigDTO) {
		// 验证必填字段
		if (!data.agentName || !data.configName || !data.systemPrompt) {
			throw new HttpException(
				"agentName, configName, systemPrompt are required",
				HttpStatus.BAD_REQUEST,
			);
		}

		// 验证 agentName 是否有效
		if (!Object.values(AgentName).includes(data.agentName)) {
			throw new HttpException(
				`Invalid agentName: ${data.agentName}`,
				HttpStatus.BAD_REQUEST,
			);
		}

		const config = await this.configService.createConfig(data);

		return {
			success: true,
			data: config,
		};
	}

	@Patch(":id")
	@ApiOperation({ summary: "更新配置" })
	@ApiResponse({ status: 200, description: "成功更新配置" })
	@ApiResponse({ status: 404, description: "配置不存在" })
	async updateConfig(
		@Param("id", ParseIntPipe) id: number,
		@Body() data: UpdateAgentConfigDTO,
	) {
		try {
			const config = await this.configService.updateConfig(id, data);
			return {
				success: true,
				data: config,
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
	@ApiOperation({ summary: "删除配置" })
	@ApiResponse({ status: 200, description: "成功删除配置" })
	@ApiResponse({ status: 400, description: "无法删除激活的配置" })
	@ApiResponse({ status: 404, description: "配置不存在" })
	async deleteConfig(@Param("id", ParseIntPipe) id: number) {
		try {
			await this.configService.deleteConfig(id);
			return {
				success: true,
				message: "Config deleted",
			};
		} catch (error) {
			const err = error as Error;
			if (err.message.includes("not found")) {
				throw new HttpException(err.message, HttpStatus.NOT_FOUND);
			}
			if (err.message.includes("Cannot delete active")) {
				throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
			}
			throw error;
		}
	}

	@Post(":id/activate")
	@ApiOperation({ summary: "激活配置" })
	@ApiResponse({ status: 200, description: "成功激活配置" })
	@ApiResponse({ status: 404, description: "配置不存在" })
	async activateConfig(@Param("id", ParseIntPipe) id: number) {
		try {
			const config = await this.configService.activateConfig(id);
			return {
				success: true,
				data: config,
				message: "Config activated",
			};
		} catch (error) {
			const err = error as Error;
			if (err.message.includes("not found")) {
				throw new HttpException(err.message, HttpStatus.NOT_FOUND);
			}
			throw error;
		}
	}

	@Post(":id/duplicate")
	@ApiOperation({ summary: "复制配置" })
	@ApiResponse({ status: 201, description: "成功复制配置" })
	@ApiResponse({ status: 404, description: "配置不存在" })
	async duplicateConfig(@Param("id", ParseIntPipe) id: number) {
		try {
			const config = await this.configService.duplicateConfig(id);
			return {
				success: true,
				data: config,
				message: "Config duplicated",
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
