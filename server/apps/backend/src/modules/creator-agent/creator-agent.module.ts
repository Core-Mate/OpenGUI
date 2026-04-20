import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

// Service
import { CreatorAgentService } from "./creator-agent.service";
import { SkillSyncService } from "./skill-sync.service";

// Controller
import { CreatorAgentController } from "./creator-agent.controller";

// Tools (可选，目前简化版本未使用 MCP 工具)
import { PlatformFormatterToolService } from "./tools";

// Agent Config
import { AgentConfigProvider } from "../graph-agent/config/agent-config.provider";

/**
 * Creator Agent Module
 * 内容创作 Agent 模块 - 基于 Claude Agent SDK 的内容创作服务
 *
 * ## 功能
 * - 多平台内容创作 (微信、X/Twitter、Reddit 等)
 * - 内容润色优化
 * - 流式/同步内容生成
 *
 * ## API 端点
 * - POST /creator-agent/generate - 生成内容
 * - POST /creator-agent/generate/stream - 生成内容 (流式)
 * - POST /creator-agent/polish - 润色内容
 * - POST /creator-agent/polish/stream - 润色内容 (流式)
 * - POST /creator-agent/research - 研究主题
 * - POST /creator-agent/research/stream - 研究主题 (流式)
 *
 * ## 注意事项
 * - 需要配置 ANTHROPIC_API_KEY 环境变量
 * - MCP 工具集成需要 zod v4，当前版本使用简化的字符串 prompt 方式
 */
@Module({
	imports: [ConfigModule],
	controllers: [CreatorAgentController],
	providers: [
		// Main Service
		CreatorAgentService,

		// Skill Sync
		SkillSyncService,

		// Agent Config Provider
		AgentConfigProvider,

		// Tools (保留用于后续 MCP 集成)
		PlatformFormatterToolService,
	],
	exports: [CreatorAgentService, SkillSyncService],
})
export class CreatorAgentModule {}
