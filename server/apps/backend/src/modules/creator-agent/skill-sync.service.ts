import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaService } from "../../prisma/prisma.service";

const PROJECT_ROOT = "/tmp/coremate-skills";
const SKILLS_DIR = path.join(PROJECT_ROOT, ".claude", "skills");

/**
 * Skill Sync Service
 *
 * settingSources: ["project"] auto-discovers and loads from .claude/skills/.
 */
@Injectable()
export class SkillSyncService implements OnModuleInit {
	private readonly logger = new Logger(SkillSyncService.name);

	constructor(private readonly prismaService: PrismaService) {}

	async onModuleInit() {
		try {
			await this.syncAllSkills();
		} catch (error) {
			this.logger.error("Failed to sync skills on init:", error);
		}
	}

	/**
	 */
	getCwd(): string {
		return PROJECT_ROOT;
	}

	/**
	 */
	async syncAllSkills(): Promise<void> {

		if (fs.existsSync(SKILLS_DIR)) {
			fs.rmSync(SKILLS_DIR, { recursive: true, force: true });
		}
		fs.mkdirSync(SKILLS_DIR, { recursive: true });


		const skills = await this.prismaService.skill.findMany({
			where: {
				is_active: true,
				is_deleted: false,
			},
		});


		for (const skill of skills) {
			this.writeSkillFile(skill);
		}

		this.logger.log(
			`SkillSyncService initialized, synced ${skills.length} skills`,
		);
	}

	/**
	 */
	private writeSkillFile(skill: {
		name: string;
		display_name: string;
		description: string | null;
		content: string;
	}): void {
		const skillDir = path.join(SKILLS_DIR, skill.name);
		fs.mkdirSync(skillDir, { recursive: true });


		let skillMd: string;
		if (skill.content.trimStart().startsWith("---")) {
			skillMd = skill.content;
		} else {
			const description = skill.description || skill.display_name;
			skillMd = `---
name: ${skill.name}
description: ${description}
user-invocable: false
---

${skill.content}
`;
		}

		fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd, "utf-8");
	}
}
