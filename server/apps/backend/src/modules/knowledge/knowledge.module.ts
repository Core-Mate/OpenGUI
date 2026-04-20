import { Module } from "@nestjs/common";
import { KnowledgeService } from "./knowledge.service";

@Module({
	providers: [KnowledgeService],
	exports: [KnowledgeService],
})
export class KnowledgeModule {}
