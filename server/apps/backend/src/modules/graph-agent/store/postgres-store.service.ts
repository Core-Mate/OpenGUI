import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * PostgresStore 服务封装
 * 提供跨线程的长期记忆存储能力
 *
 * 基于 LangGraph 的 Store API，使用 PostgreSQL 作为持久化存储后端
 * 与 Checkpointer 不同，Store 用于存储跨线程（thread-id）的长期记忆
 */
@Injectable()
export class PostgresStoreService implements OnModuleInit {
	private readonly logger = new Logger(PostgresStoreService.name);
	private store: PostgresStore | null = null;

	constructor(private readonly configService: ConfigService) {}

	async onModuleInit(): Promise<void> {
		await this.initialize();
	}

	/**
	 * 初始化 PostgresStore
	 */
	private async initialize(): Promise<void> {
		const databaseUrl = this.configService.get<string>("DATABASE_URL");

		if (!databaseUrl) {
			this.logger.error("DATABASE_URL environment variable is not set");
			throw new Error("DATABASE_URL is required for PostgresStore");
		}

		try {
			this.logger.log("Initializing PostgresStore...");

			// 创建 PostgresStore 实例
			// todo: 不配置 index 参数 = 不使用向量搜索（符合"简单全量召回"需求）
			this.store = PostgresStore.fromConnString(databaseUrl);

			// 设置数据库表（如果不存在则创建）
			await this.store.setup();

			this.logger.log("PostgresStore initialized successfully");
		} catch (error) {
			this.logger.error(
				`Failed to initialize PostgresStore: ${(error as Error).message}`,
				(error as Error).stack,
			);
			throw error;
		}
	}

	/**
	 * 获取 Store 实例
	 */
	getStore(): PostgresStore {
		if (!this.store) {
			throw new Error("PostgresStore not initialized");
		}
		return this.store;
	}
}
