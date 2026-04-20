import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import type { SupervisorTodo } from "../graph/state/state.types";
import type { WorkingMemoryUpdateMode } from "./working-memory.types";

/**
 * Working Memory 服务
 *
 * 提供工作记忆的 CRUD 操作，支持会话级别隔离（通过 thread_id）
 * 基于 voltagent 的 Working Memory 机制实现
 */
@Injectable()
export class WorkingMemoryService {
	private readonly logger = new Logger(WorkingMemoryService.name);

	constructor(private readonly prismaService: PrismaService) {}

	/**
	 * 获取指定 thread 的工作记忆内容
	 *
	 * @param threadId - 线程 ID（会话隔离键）
	 * @returns 工作记忆内容，如果不存在则返回 null
	 */
	async getWorkingMemory(threadId: string): Promise<string | null> {
		try {
			const record = await this.prismaService.working_memory.findUnique({
				where: { thread_id: threadId },
			});
			return record?.content ?? null;
		} catch (error) {
			this.logger.error(
				`Failed to get working memory for thread ${threadId}: ${(error as Error).message}`,
			);
			throw error;
		}
	}

	/**
	 * 更新指定 thread 的工作记忆内容
	 *
	 * 使用原子 SQL 操作确保并发安全：
	 * - replace 模式：使用 Prisma upsert（单次原子操作）
	 * - append 模式：使用 PostgreSQL 的 ON CONFLICT DO UPDATE 配合字符串拼接
	 *   在数据库层面完成追加，避免 read-modify-write 竞态条件
	 *
	 * @param threadId - 线程 ID（会话隔离键）
	 * @param content - 新的内容
	 * @param mode - 更新模式：'append' 追加内容，'replace' 替换内容
	 */
	async updateWorkingMemory(
		threadId: string,
		content: string,
		mode: WorkingMemoryUpdateMode = "append",
	): Promise<void> {
		try {
			if (mode === "replace") {
				// 替换模式：使用 Prisma upsert（原子操作，无并发问题）
				await this.prismaService.working_memory.upsert({
					where: { thread_id: threadId },
					create: {
						thread_id: threadId,
						content,
					},
					update: {
						content,
						updated_at: new Date(),
					},
				});
			} else {
				// 追加模式：使用原子 SQL，在数据库层面完成字符串拼接
				// 这样可以避免 read-modify-write 的竞态条件
				await this.prismaService.$executeRaw`
					INSERT INTO working_memory (thread_id, content, created_at, updated_at)
					VALUES (${threadId}, ${content}, NOW(), NOW())
					ON CONFLICT (thread_id)
					DO UPDATE SET
						content = working_memory.content || E'\n\n---\n\n' || ${content},
						updated_at = NOW()
				`;
			}

			this.logger.debug(
				`Updated working memory for thread ${threadId} (mode: ${mode})`,
			);
		} catch (error) {
			this.logger.error(
				`Failed to update working memory for thread ${threadId}: ${(error as Error).message}`,
			);
			throw error;
		}
	}

	/**
	 * 清除指定 thread 的工作记忆
	 *
	 * @param threadId - 线程 ID（会话隔离键）
	 */
	async clearWorkingMemory(threadId: string): Promise<void> {
		try {
			await this.prismaService.working_memory.deleteMany({
				where: { thread_id: threadId },
			});

			this.logger.debug(`Cleared working memory for thread ${threadId}`);
		} catch (error) {
			this.logger.error(
				`Failed to clear working memory for thread ${threadId}: ${(error as Error).message}`,
			);
			throw error;
		}
	}

	/**
	 * 一次性获取指定 thread 的完整工作记忆（content + todos + template）
	 *
	 * @param threadId - 线程 ID（会话隔离键）
	 */
	async getFullWorkingMemory(threadId: string): Promise<{
		content: string | null;
		todos: SupervisorTodo[] | null;
		template: string | null;
	}> {
		try {
			const record = await this.prismaService.working_memory.findUnique({
				where: { thread_id: threadId },
			});
			return {
				content: record?.content ?? null,
				todos: (record?.todos as SupervisorTodo[] | undefined) ?? null,
				template: record?.template ?? null,
			};
		} catch (error) {
			this.logger.error(
				`Failed to get full working memory for thread ${threadId}: ${(error as Error).message}`,
			);
			throw error;
		}
	}

	/**
	 * 获取指定 thread 的工作记忆模板
	 *
	 * @param threadId - 线程 ID（会话隔离键）
	 * @returns 模板内容，如果不存在则返回 null
	 */
	async getTemplate(threadId: string): Promise<string | null> {
		try {
			const record = await this.prismaService.working_memory.findUnique({
				where: { thread_id: threadId },
			});
			return record?.template ?? null;
		} catch (error) {
			this.logger.error(
				`Failed to get template for thread ${threadId}: ${(error as Error).message}`,
			);
			throw error;
		}
	}

	/**
	 * 设置指定 thread 的工作记忆模板
	 *
	 * 使用原子 SQL 操作确保并发安全
	 *
	 * @param threadId - 线程 ID（会话隔离键）
	 * @param template - 模板内容
	 */
	async setTemplate(threadId: string, template: string): Promise<void> {
		try {
			// 使用原子 SQL upsert 确保并发安全
			await this.prismaService.$executeRaw`
				INSERT INTO working_memory (thread_id, content, template, created_at, updated_at)
				VALUES (${threadId}, '', ${template}, NOW(), NOW())
				ON CONFLICT (thread_id)
				DO UPDATE SET template = ${template}, updated_at = NOW()
			`;

			this.logger.debug(`Set template for thread ${threadId}`);
		} catch (error) {
			this.logger.error(
				`Failed to set template for thread ${threadId}: ${(error as Error).message}`,
			);
			throw error;
		}
	}

	/**
	 * 获取指定 thread 的 Supervisor Todos
	 *
	 * @param threadId - 线程 ID（会话隔离键）
	 * @returns Todos 列表，如果不存在则返回 null
	 */
	async getTodos(threadId: string): Promise<SupervisorTodo[] | null> {
		try {
			const record = await this.prismaService.working_memory.findUnique({
				where: { thread_id: threadId },
			});
			return (record?.todos as SupervisorTodo[] | undefined) ?? null;
		} catch (error) {
			this.logger.error(
				`Failed to get todos for thread ${threadId}: ${(error as Error).message}`,
			);
			throw error;
		}
	}

	/**
	 * 一次性复制完整工作记忆到目标 thread（单次 upsert）
	 *
	 * 将 content、todos、template 合并为一条 SQL 写入，避免多次并发 upsert 同一行导致覆盖
	 *
	 * @param threadId - 目标线程 ID
	 * @param data - 要复制的工作记忆数据
	 */
	async copyFullWorkingMemory(
		threadId: string,
		data: {
			content?: string | null;
			todos?: SupervisorTodo[] | null;
			template?: string | null;
		},
	): Promise<void> {
		const content = data.content ?? "";
		const todos = data.todos ? JSON.stringify(data.todos) : null;
		const template = data.template ?? null;

		try {
			await this.prismaService.$executeRaw`
				INSERT INTO working_memory (thread_id, content, todos, template, created_at, updated_at)
				VALUES (${threadId}, ${content}, ${todos}::jsonb, ${template}, NOW(), NOW())
				ON CONFLICT (thread_id)
				DO UPDATE SET
					content = ${content},
					todos = ${todos}::jsonb,
					template = ${template},
					updated_at = NOW()
			`;

			this.logger.debug(`Copied full working memory to thread ${threadId}`);
		} catch (error) {
			this.logger.error(
				`Failed to copy full working memory to thread ${threadId}: ${(error as Error).message}`,
			);
			throw error;
		}
	}

	/**
	 * 更新指定 thread 的 Supervisor Todos
	 *
	 * 使用原子 SQL 操作确保并发安全（全量替换）
	 *
	 * @param threadId - 线程 ID（会话隔离键）
	 * @param todos - 完整的 todos 列表
	 */
	async updateTodos(threadId: string, todos: SupervisorTodo[]): Promise<void> {
		try {
			// 使用原子 SQL upsert 确保并发安全
			await this.prismaService.$executeRaw`
				INSERT INTO working_memory (thread_id, content, todos, created_at, updated_at)
				VALUES (${threadId}, '', ${JSON.stringify(todos)}::jsonb, NOW(), NOW())
				ON CONFLICT (thread_id)
				DO UPDATE SET todos = ${JSON.stringify(todos)}::jsonb, updated_at = NOW()
			`;

			this.logger.debug(
				`Updated todos for thread ${threadId}: ${todos.length} items`,
			);
		} catch (error) {
			this.logger.error(
				`Failed to update todos for thread ${threadId}: ${(error as Error).message}`,
			);
			throw error;
		}
	}
}
