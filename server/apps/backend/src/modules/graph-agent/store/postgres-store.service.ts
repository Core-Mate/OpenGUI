import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 *
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
	 */
	private async initialize(): Promise<void> {
		const databaseUrl = this.configService.get<string>("DATABASE_URL");

		if (!databaseUrl) {
			this.logger.error("DATABASE_URL environment variable is not set");
			throw new Error("DATABASE_URL is required for PostgresStore");
		}

		try {
			this.logger.log("Initializing PostgresStore...");


			// todo: omit index to disable vector search and use simple full recall.
			this.store = PostgresStore.fromConnString(databaseUrl);


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
	 */
	getStore(): PostgresStore {
		if (!this.store) {
			throw new Error("PostgresStore not initialized");
		}
		return this.store;
	}
}
