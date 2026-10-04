import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TosService } from "./tos.service";

jest.mock("uuid", () => ({
	v4: () => jest.requireActual("node:crypto").randomUUID(),
}));

const unsafeKeys = [
	"../sentinel.txt",
	"nested/../../sentinel.txt",
	"./old.png",
	".. /sentinel.txt",
	".../sentinel.txt",
	"old.png.",
	"old.png ",
	"/opengui-test-missing/file",
	"C:/opengui-test-missing/file",
	"C:\\opengui-test-missing\\file",
	"C:relative.txt",
	"\\\\server\\share\\file",
	"nested\\file",
	"%2e%2e/sentinel.txt",
	"%252e%252e/sentinel.txt",
	"%2E%2e/sentinel.txt",
	"%25252e%25252e/sentinel.txt",
	"%2fopengui-test-missing/file",
	"nested%255cfile",
	"/uploads/../sentinel.txt",
	"https://example.com/image.png",
	"a\0b",
];

describe("TosService path containment", () => {
	let fixture: string;
	let root: string;
	let service: TosService;
	let previousRoot: string | undefined;

	beforeEach(() => {
		fixture = fs.mkdtempSync(path.join(os.tmpdir(), "opengui-path-"));
		root = path.join(fixture, "uploads");
		previousRoot = process.env.LOCAL_UPLOADS_DIR;
		process.env.LOCAL_UPLOADS_DIR = root;
		jest.resetModules();
		const { TosService } =
			jest.requireActual<typeof import("./tos.service")>("./tos.service");
		service = new TosService();
		fs.writeFileSync(path.join(fixture, "sentinel.txt"), "outside sentinel");
	});

	afterEach(() => {
		if (previousRoot === undefined) delete process.env.LOCAL_UPLOADS_DIR;
		else process.env.LOCAL_UPLOADS_DIR = previousRoot;
		if (
			path.dirname(fixture) !== path.resolve(os.tmpdir()) ||
			!path.basename(fixture).startsWith("opengui-path-")
		)
			throw new Error("Unsafe fixture cleanup");
		fs.rmSync(fixture, { recursive: true, force: true });
	});

	it("rejects traversal without reading, writing or deleting an outside file", async () => {
		expect(await service.getImage("../sentinel.txt")).toMatchObject({
			success: false,
		});
		expect(
			await service.uploadImage(Buffer.from("replacement"), "../sentinel.txt"),
		).toMatchObject({ success: false });
		expect(await service.deleteImage("../sentinel.txt")).toMatchObject({
			success: false,
		});
		expect(fs.readFileSync(path.join(fixture, "sentinel.txt"), "utf8")).toBe(
			"outside sentinel",
		);
	});

	it.each(
		unsafeKeys,
	)("rejects unsafe keys at every storage entry: %s", async (key) => {
		for (const result of [
			await service.uploadImage(Buffer.from("image"), key),
			await service.uploadBase64Image("aW1hZ2U=", key),
			await service.uploadImageToChatBucket(Buffer.from("chat"), key),
			await service.getImage(key),
			await service.getImageAsBase64(key),
			await service.deleteImage(key),
		])
			expect(result).toMatchObject({ success: false });
		expect(() => service.getPublicUrl(key)).toThrow("Invalid storage key");
		await expect(service.getSignedUrl(key)).rejects.toThrow(
			"Invalid storage key",
		);
		await expect(service.getOssSignedUrl(key)).rejects.toThrow(
			"Invalid storage key",
		);
		expect(fs.readFileSync(path.join(fixture, "sentinel.txt"), "utf8")).toBe(
			"outside sentinel",
		);
	});

	it("preserves named uploads, nested legacy keys, overwrites and missing deletes", async () => {
		const first = await service.uploadImage(
			Buffer.from("first"),
			"legacy/nested.png",
		);
		expect(first).toEqual({
			success: true,
			key: "legacy/nested.png",
			url: "/uploads/legacy/nested.png",
		});
		const second = await service.uploadBase64Image(
			"c2Vjb25k",
			"legacy/nested.png",
		);
		expect(second.key).toBe(first.key);
		expect((await service.getImage(first.url ?? "")).data?.toString()).toBe(
			"second",
		);
		expect(await service.getImageAsBase64(first.key ?? "")).toEqual({
			success: true,
			base64: "c2Vjb25k",
		});
		expect(service.getPublicUrl(first.key ?? "")).toBe(first.url);
		expect(await service.getSignedUrl(first.key ?? "")).toBe(first.url);
		expect(await service.getOssSignedUrl(first.key ?? "")).toBe(first.url);
		expect(await service.deleteImage(first.key ?? "")).toEqual({
			success: true,
		});
		expect(await service.deleteImage(first.key ?? "")).toEqual({
			success: true,
		});
		expect(await service.getImage(first.key ?? "")).toEqual({
			success: false,
			error: "File not found",
		});
	});

	it("round-trips literal percent signs and keeps legacy percent names readable", async () => {
		const key = "progress-100%.png";
		const uploaded = await service.uploadImage(
			Buffer.from("percent image"),
			key,
		);
		expect(uploaded).toEqual({
			success: true,
			key,
			url: "/uploads/progress-100%.png",
		});
		expect((await service.getImage(key)).data?.toString()).toBe(
			"percent image",
		);
		expect(await service.getImageAsBase64(uploaded.url ?? "")).toEqual({
			success: true,
			base64: "cGVyY2VudCBpbWFnZQ==",
		});
		expect(service.getPublicUrl(key)).toBe(uploaded.url);
		expect(await service.getSignedUrl(key)).toBe(uploaded.url);
		expect(await service.getOssSignedUrl(key)).toBe(uploaded.url);
		expect(await service.deleteImage(key)).toEqual({ success: true });
		fs.writeFileSync(path.join(root, "legacy-50%.png"), "legacy percent image");
		expect((await service.getImage("legacy-50%.png")).data?.toString()).toBe(
			"legacy percent image",
		);
	});

	it("keeps generated image and log keys compatible while rejecting log traversal", async () => {
		expect((await service.uploadImage(Buffer.from("image"))).key).toMatch(
			/^screenshots\/[0-9a-f-]+\.png$/,
		);
		expect(
			(await service.uploadImageToChatBucket(Buffer.from("chat"))).key,
		).toMatch(/^chat-images\/[0-9a-f-]+\.png$/);
		const log = await service.uploadLogFile(
			Buffer.from("log"),
			"device.zip",
			"application/zip",
			1,
		);
		expect(log.key).toMatch(/^logs\/1\/\d+_device\.zip$/);
		expect((await service.getImage(log.key ?? "")).data?.toString()).toBe(
			"log",
		);
		expect(
			await service.uploadLogFile(
				Buffer.from("replacement"),
				"../../../sentinel.txt",
				"text/plain",
				1,
			),
		).toMatchObject({ success: false });
		expect(fs.readFileSync(path.join(fixture, "sentinel.txt"), "utf8")).toBe(
			"outside sentinel",
		);
	});

	it("rejects links or junctions pointing at a similar directory prefix", async () => {
		const outside = path.join(fixture, "uploads-other");
		fs.mkdirSync(outside);
		fs.writeFileSync(path.join(outside, "sentinel.png"), "linked sentinel");
		fs.symlinkSync(
			outside,
			path.join(root, "linked"),
			process.platform === "win32" ? "junction" : "dir",
		);
		for (const result of [
			await service.getImage("linked/sentinel.png"),
			await service.deleteImage("linked/sentinel.png"),
			await service.uploadImage(
				Buffer.from("replacement"),
				"linked/sentinel.png",
			),
		])
			expect(result).toMatchObject({ success: false });
		expect(() => service.getPublicUrl("linked/sentinel.png")).toThrow(
			"Invalid storage key",
		);
		expect(fs.readFileSync(path.join(outside, "sentinel.png"), "utf8")).toBe(
			"linked sentinel",
		);
	});
});
