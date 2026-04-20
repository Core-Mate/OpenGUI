import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AppLogger } from "./common/log";

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		bufferLogs: true,
	});

	// 将 AppLogger 设为全局日志器
	const appLogger = await app.resolve(AppLogger);
	app.useLogger(appLogger);
	app.flushLogs();

	// 启用 CORS
	app.enableCors();

	// 设置全局 API 前缀
	app.setGlobalPrefix("api");

	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	// Swagger API documentation setup
	const config = new DocumentBuilder()
		.setTitle("OpenGUI API")
		.setDescription(
			"AI-powered mobile GUI agent for task decomposition and execution",
		)
		.setVersion("1.0")
		.addTag("tasks", "Task execution endpoints")
		.addServer("http://localhost:7777", "本地环境")
		.build();

	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup("docs", app, document);

	const port = process.env.PORT ?? 7777;
	await app.listen(port);

	console.log(
		`📚 API Documentation available at: http://localhost:${port}/docs`,
	);
}

bootstrap();
