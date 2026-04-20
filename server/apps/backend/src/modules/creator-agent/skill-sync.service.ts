import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaService } from "../../prisma/prisma.service";

/** 项目根目录，SDK 通过 cwd 指向此处 */
const PROJECT_ROOT = "/tmp/coremate-skills";
/** SDK 从 cwd/.claude/skills/ 自动发现技能 */
const SKILLS_DIR = path.join(PROJECT_ROOT, ".claude", "skills");

/**
 * Skill Sync Service
 *
 * 将 DB 中的 skill 数据同步到文件系统，供 Claude Agent SDK 通过
 * settingSources: ["project"] 从 .claude/skills/ 目录自动发现和加载。
 * DB 是唯一真实来源，文件系统只是运行时缓存。
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
	 * 返回项目根目录路径，用作 SDK query() 的 cwd
	 */
	getCwd(): string {
		return PROJECT_ROOT;
	}

	/**
	 * 全量同步：清空 skills 目录后重建所有活跃 skill
	 */
	async syncAllSkills(): Promise<void> {
		// 清空 skills 目录后重建
		if (fs.existsSync(SKILLS_DIR)) {
			fs.rmSync(SKILLS_DIR, { recursive: true, force: true });
		}
		fs.mkdirSync(SKILLS_DIR, { recursive: true });

		// 查询所有活跃的 skill
		const skills = await this.prismaService.skill.findMany({
			where: {
				is_active: true,
				is_deleted: false,
			},
		});

		// 逐个写入文件
		for (const skill of skills) {
			this.writeSkillFile(skill);
		}

		this.logger.log(
			`SkillSyncService initialized, synced ${skills.length} skills`,
		);
	}

	/**
	 * 将单个 skill 写入文件系统
	 */
	private writeSkillFile(skill: {
		name: string;
		display_name: string;
		description: string | null;
		content: string;
	}): void {
		const skillDir = path.join(SKILLS_DIR, skill.name);
		fs.mkdirSync(skillDir, { recursive: true });

		// content 已包含 frontmatter 则直接使用，否则自动拼接
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
