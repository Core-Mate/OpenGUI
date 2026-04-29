import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { LeaseModule } from "./common/lease";
import { LogModule } from "./common/log";
import { TraceIdInterceptor } from "./common/log/trace-id.interceptor";
import { RedisModule } from "./common/redis";
import { WsModule } from "./common/ws";
import { ApkModule } from "./modules/apk/apk.module";
import { AppConfigModule } from "./modules/app-config/app-config.module";
import { CreditsModule } from "./modules/credits";
import { DeviceLogModule } from "./modules/device-log/device-log.module";
import { CreatorAgentModule } from "./modules/creator-agent";
import { ImChannelModule } from "./modules/im-channel/im-channel.module";
import { TaskModule } from "./modules/task/task.module";
import { TenantModule } from "./modules/tenant";
import { UserModule } from "./modules/user/user.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
	imports: [
		// Configuration management
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
		}),

		// Event emitter for cross-module event communication
		EventEmitterModule.forRoot(),

		// Prisma database integration (Global module)
		PrismaModule,

		// Redis integration (Global module)
		RedisModule,

		// Lease service for heartbeat mechanism (Global module)
		LeaseModule,

		// App Logger integration (Global module)
		LogModule,

		// BullMQ integration with Redis connection
		BullModule.forRoot({
			connection: {
				host: process.env.REDIS_HOST || "redis",
				port: Number(process.env.REDIS_PORT) || 6379,
				password: process.env.REDIS_PASSWORD,
			},
			defaultJobOptions: {
				removeOnComplete: 1000,
				attempts: 0,
			},
		}),
		// Unified WebSocket integration (replaces SocketModule + SseModule)
		WsModule,

		// Task management module
		TaskModule,

		// Tenant management module
		TenantModule,

		// Device log management module
		DeviceLogModule,

		// User management module
		UserModule,

		// APK management module
		ApkModule,

		// App config module (client-side configuration)
		AppConfigModule,

		// Credits management module (stub - billing disabled in source-available version)
		CreditsModule,

		// Creator Agent module (Claude Agent SDK based content creation)
		CreatorAgentModule,

		// IM Channel module (remote task dispatch via Feishu/Telegram)
		ImChannelModule,
	],
	controllers: [AppController],
	providers: [
		AppService,

		{
			provide: APP_INTERCEPTOR,
			useClass: TraceIdInterceptor,
		},
	],
})
export class AppModule {}
