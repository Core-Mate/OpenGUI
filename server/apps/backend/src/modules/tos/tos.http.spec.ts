import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

jest.mock("@repo/db", () => ({ prisma: {} }));
jest.mock("uuid", () => ({
	v4: () => jest.requireActual("node:crypto").randomUUID(),
}));

describe("TosController path containment", () => {
	let app: INestApplication;
	let fixture: string;
	let previousRoot: string | undefined;

	beforeAll(async () => {
		fixture = fs.mkdtempSync(path.join(os.tmpdir(), "opengui-http-path-"));
		previousRoot = process.env.LOCAL_UPLOADS_DIR;
		process.env.LOCAL_UPLOADS_DIR = path.join(fixture, "uploads");
		fs.writeFileSync(path.join(fixture, "sentinel.txt"), "outside sentinel");
		const { TosController } =
			jest.requireActual<typeof import("./tos.controller")>("./tos.controller");
		const { TosService } =
			jest.requireActual<typeof import("./tos.service")>("./tos.service");
		const module = await Test.createTestingModule({
			controllers: [TosController],
			providers: [TosService],
		}).compile();
		app = module.createNestApplication();
		app.setGlobalPrefix("api");
		await app.init();
	});

	afterAll(async () => {
		await app?.close();
		if (previousRoot === undefined) delete process.env.LOCAL_UPLOADS_DIR;
		else process.env.LOCAL_UPLOADS_DIR = previousRoot;
		if (
			path.dirname(fixture) !== path.resolve(os.tmpdir()) ||
			!path.basename(fixture).startsWith("opengui-http-path-")
		)
			throw new Error("Unsafe fixture cleanup");
		fs.rmSync(fixture, { recursive: true, force: true });
	});

	it("rejects traversal through multipart and Base64 uploads", async () => {
		for (const route of ["upload", "upload-chat-image"]) {
			const result = await request(app.getHttpServer())
				.post(`/api/tos/${route}`)
				.field("fileName", "../sentinel.txt")
				.attach("file", Buffer.from("replacement"), "image.png")
				.expect(201);
			expect(result.body.success).toBe(false);
		}
		const result = await request(app.getHttpServer())
			.post("/api/tos/upload-base64")
			.send({ base64: "cmVwbGFjZW1lbnQ=", fileName: "../sentinel.txt" })
			.expect(201);
		expect(result.body.success).toBe(false);
		expect(fs.readFileSync(path.join(fixture, "sentinel.txt"), "utf8")).toBe(
			"outside sentinel",
		);
	});

	it.each([
		"../sentinel.txt",
		"%2e%2e/sentinel.txt",
		"%252e%252e/sentinel.txt",
	])("rejects query traversal: %s", async (key) => {
		const result = await request(app.getHttpServer())
			.get("/api/tos/image-base64-by-url")
			.query({ url: key })
			.expect(200);
		expect(result.body.success).toBe(false);
	});

	it.each([
		"legacy/image.png",
		"progress-100%.png",
	])("keeps %s readable and deletable through HTTP", async (fileName) => {
		const uploaded = await request(app.getHttpServer())
			.post("/api/tos/upload")
			.field("fileName", fileName)
			.attach("file", Buffer.from("image bytes"), "image.png")
			.expect(201);
		expect(uploaded.body).toEqual({
			success: true,
			key: fileName,
			url: `/uploads/${fileName}`,
		});
		const read = await request(app.getHttpServer())
			.get("/api/tos/image-base64-by-url")
			.query({ url: uploaded.body.url })
			.expect(200);
		expect(read.body).toEqual({ success: true, base64: "aW1hZ2UgYnl0ZXM=" });
		const key = encodeURIComponent(uploaded.body.key);
		await request(app.getHttpServer()).get(`/api/tos/image/${key}`).expect(200);
		const deleted = await request(app.getHttpServer())
			.delete(`/api/tos/image/${key}`)
			.expect(200);
		expect(deleted.body).toEqual({ success: true });
		await request(app.getHttpServer()).get(`/api/tos/image/${key}`).expect(404);
	});
});
