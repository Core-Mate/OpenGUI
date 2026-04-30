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

	// Register AppLogger as the global logger.
	const appLogger = await app.resolve(AppLogger);
	app.useLogger(appLogger);
	app.flushLogs();

	// Enable CORS.
	app.enableCors();

	// Set the global API prefix.
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
		.addServer("http://localhost:7777", "Local environment")
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
