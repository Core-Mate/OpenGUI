import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

// Service
import { CreatorAgentService } from "./creator-agent.service";
import { SkillSyncService } from "./skill-sync.service";

// Controller
import { CreatorAgentController } from "./creator-agent.controller";


import { PlatformFormatterToolService } from "./tools";

// Agent Config
import { AgentConfigProvider } from "../graph-agent/config/agent-config.provider";

/**
 * Creator Agent Module
 *
 *
 * - POST /creator-agent/generate - Generate content
 * - POST /creator-agent/generate/stream - Generate content (streaming)
 * - POST /creator-agent/polish - Polish content
 * - POST /creator-agent/polish/stream - Polish content (streaming)
 * - POST /creator-agent/research - Research topic
 * - POST /creator-agent/research/stream - Research topic (streaming)
 *
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


		PlatformFormatterToolService,
	],
	exports: [CreatorAgentService, SkillSyncService],
})
export class CreatorAgentModule {}
