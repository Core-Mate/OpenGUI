import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

// Config
import { AgentConfigProvider } from "./config/agent-config.provider";
import { AgentConfigService } from "./config/agent-config.service";
import { AgentConfigController } from "./config/agent-config.controller";

// Checkpointer
import { PostgresCheckpointerService } from "./checkpointer/postgres-checkpointer";

// Store (Long-term Memory)
import { PostgresStoreService } from "./store/postgres-store.service";

// Memory
import { MemoryExtractorService } from "./memory/memory-extractor.service";
import { TaskMemoryService } from "./memory/task-memory.service";

// Skill
import { SkillProvider } from "./skill/skill.provider";
import { SkillService } from "./skill/skill.service";
import { SkillController } from "./skill/skill.controller";

// Tools
import { ContentCreationToolService } from "./tools/content-creation.tool";
import { KnowledgeToolService } from "./tools/knowledge.tool";
import { SupervisorTodosToolService } from "./tools/supervisor-todos.tool";
import { WorkingMemoryToolService } from "./tools/working-memory.tool";

// Working Memory
import { WorkingMemoryService } from "./working-memory/working-memory.service";

// Graph
import { MobileAgentGraphService } from "./graph/mobile-agent.graph";

// Runner
import { GraphRunnerService } from "./graph-runner.service";

// Subgraphs
import { ExecutorGraphService } from "./graph/executor.graph";

// External dependencies
import { CreatorAgentModule } from "../creator-agent/creator-agent.module";
import { CreditsModule } from "../credits/credits.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { RedisModule } from "../../common/redis";
import { WsModule } from "../../common/ws";
import { TosModule } from "../tos/tos.module";

@Module({
	imports: [
		ConfigModule,
		RedisModule,
		forwardRef(() => WsModule),
		TosModule,
		KnowledgeModule,
		CreatorAgentModule,
		CreditsModule,
	],
	controllers: [AgentConfigController, SkillController],
	providers: [
		// Config
		AgentConfigProvider,
		AgentConfigService,

		// Checkpointer
		PostgresCheckpointerService,

		// Store (Long-term Memory)
		PostgresStoreService,

		// Memory
		MemoryExtractorService,
		TaskMemoryService,

		// Skill
		SkillProvider,
		SkillService,

		// Working Memory
		WorkingMemoryService,

		// Tools
		ContentCreationToolService,
		KnowledgeToolService,
		SupervisorTodosToolService,
		WorkingMemoryToolService,

		// Graph
		MobileAgentGraphService,

		// Runner
		GraphRunnerService,

		// Subgraphs
		ExecutorGraphService,
	],
	exports: [
		AgentConfigProvider,
		AgentConfigService,
		PostgresCheckpointerService,
		PostgresStoreService,
		TaskMemoryService,
		SkillProvider,
		SkillService,
		WorkingMemoryService,
		KnowledgeToolService,
		SupervisorTodosToolService,
		WorkingMemoryToolService,
		MobileAgentGraphService,
		GraphRunnerService,
		ExecutorGraphService,
	],
})
export class GraphAgentModule {}
