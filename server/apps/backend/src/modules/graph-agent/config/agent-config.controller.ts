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
	@ApiOperation({ summary: "Get config list" })
	@ApiQuery({ name: "page", required: false, type: Number })
	@ApiQuery({ name: "pageSize", required: false, type: Number })
	@ApiQuery({ name: "agentName", required: false, enum: AgentName })
	@ApiQuery({ name: "search", required: false, type: String })
	@ApiResponse({ status: 200, description: "Config list retrieved successfully" })
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
	@ApiOperation({ summary: "Get one config" })
	@ApiResponse({ status: 200, description: "Config retrieved successfully" })
	@ApiResponse({ status: 404, description: "Config does not exist" })
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
	@ApiOperation({ summary: "Create config" })
	@ApiResponse({ status: 201, description: "Config created successfully" })
	@ApiResponse({ status: 400, description: "Invalid parameters" })
	async createConfig(@Body() data: CreateAgentConfigDTO) {

		if (!data.agentName || !data.configName || !data.systemPrompt) {
			throw new HttpException(
				"agentName, configName, systemPrompt are required",
				HttpStatus.BAD_REQUEST,
			);
		}


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
	@ApiOperation({ summary: "Update config" })
	@ApiResponse({ status: 200, description: "Config updated successfully" })
	@ApiResponse({ status: 404, description: "Config does not exist" })
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
	@ApiOperation({ summary: "Delete config" })
	@ApiResponse({ status: 200, description: "Config deleted successfully" })
	@ApiResponse({ status: 400, description: "Cannot delete active config" })
	@ApiResponse({ status: 404, description: "Config does not exist" })
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
	@ApiOperation({ summary: "Activate config" })
	@ApiResponse({ status: 200, description: "Config activated successfully" })
	@ApiResponse({ status: 404, description: "Config does not exist" })
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
	@ApiOperation({ summary: "Duplicate config" })
	@ApiResponse({ status: 201, description: "Config duplicated successfully" })
	@ApiResponse({ status: 404, description: "Config does not exist" })
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
