import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import type { SupervisorTodo } from "../graph/state/state.types";
import type { WorkingMemoryUpdateMode } from "./working-memory.types";

/**
 *
 */
@Injectable()
export class WorkingMemoryService {
	private readonly logger = new Logger(WorkingMemoryService.name);

	constructor(private readonly prismaService: PrismaService) {}

	/**
	 *
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
	 *
	 *
	 */
	async updateWorkingMemory(
		threadId: string,
		content: string,
		mode: WorkingMemoryUpdateMode = "append",
	): Promise<void> {
		try {
			if (mode === "replace") {

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
	 *
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
	 *
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
	 *
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
	 *
	 *
	 */
	async setTemplate(threadId: string, template: string): Promise<void> {
		try {

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
	 *
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
	 *
	 *
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
	 *
	 *
	 */
	async updateTodos(threadId: string, todos: SupervisorTodo[]): Promise<void> {
		try {

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
