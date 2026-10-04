import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

export interface UploadImageResult {
	success: boolean;
	url?: string;
	key?: string;
	error?: string;
}

export interface GetImageResult {
	success: boolean;
	data?: Buffer;
	contentType?: string;
	error?: string;
}

const UPLOADS_DIR = process.env.LOCAL_UPLOADS_DIR || "./uploads";

/**
 * Local filesystem storage service (source-available stub for TosService).
 * Replaces Volcengine TOS + Aliyun OSS with local file storage.
 */
@Injectable()
export class TosService {
	private readonly logger = new Logger(TosService.name);
	private readonly uploadsDir = path.resolve(UPLOADS_DIR);

	constructor() {
		if (!fs.existsSync(this.uploadsDir)) {
			fs.mkdirSync(this.uploadsDir, { recursive: true });
		}
	}

	private resolveKey(uri: string): { key: string; filePath: string } {
		if (typeof uri !== "string") throw new Error("Invalid storage key");
		const key = uri.startsWith("/uploads/") ? uri.slice("/uploads/".length) : uri;
		if (
			!key ||
			path.posix.isAbsolute(key) ||
			path.win32.isAbsolute(key) ||
			/[\\:\0]/.test(key) ||
			/%(?:25)*(?:2e|2f|5c|00|3a)/i.test(key) ||
			key.split("/").some((segment) =>
				!segment || segment === "." || segment === ".." || /[. ]$/.test(segment),
			)
		)
			throw new Error("Invalid storage key");
		const filePath = path.resolve(this.uploadsDir, key);
		const relative = path.relative(this.uploadsDir, filePath);
		if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
			throw new Error("Invalid storage key");

		// Check existing components, including the root, without following links.
		let current = this.uploadsDir;
		for (const segment of ["", ...key.split("/")]) {
			if (segment) current = path.join(current, segment);
			try {
				if (fs.lstatSync(current).isSymbolicLink())
					throw new Error("Invalid storage key");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
				throw error;
			}
		}
		return { key, filePath };
	}

	async uploadImage(
		imageBuffer: Buffer,
		fileName?: string,
		contentType: string = "image/png",
	): Promise<UploadImageResult> {
		try {
			const ext = contentType.split("/")[1] || "png";
			const { key, filePath } = this.resolveKey(fileName || `screenshots/${uuidv4()}.${ext}`);
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			this.resolveKey(key);
			fs.writeFileSync(filePath, imageBuffer);
			return { success: true, key, url: `/uploads/${key}` };
		} catch (error) {
			this.logger.error(`uploadImage failed: ${(error as Error).message}`);
			return { success: false, error: (error as Error).message };
		}
	}

	async uploadBase64Image(
		base64Data: string,
		fileName?: string,
		contentType: string = "image/png",
	): Promise<UploadImageResult> {
		try {
			const base64Clean = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");
			const imageBuffer = Buffer.from(base64Clean, "base64");
			return await this.uploadImage(imageBuffer, fileName, contentType);
		} catch (error) {
			this.logger.error(`uploadBase64Image failed: ${(error as Error).message}`);
			return { success: false, error: (error as Error).message };
		}
	}

	async uploadImageToChatBucket(
		imageBuffer: Buffer,
		fileName?: string,
		contentType: string = "image/png",
	): Promise<UploadImageResult> {
		const ext = contentType.split("/")[1] || "png";
		const key = fileName || `chat-images/${uuidv4()}.${ext}`;
		return this.uploadImage(imageBuffer, key, contentType);
	}

	async getImage(uri: string, _bucket?: string): Promise<GetImageResult> {
		try {
			const { filePath } = this.resolveKey(uri);
			if (!fs.existsSync(filePath)) {
				return { success: false, error: "File not found" };
			}
			const data = fs.readFileSync(filePath);
			return { success: true, data, contentType: "image/png" };
		} catch (error) {
			this.logger.error(`getImage failed: ${(error as Error).message}`);
			return { success: false, error: (error as Error).message };
		}
	}

	async getImageAsBase64(
		uri: string,
		_bucket?: string,
	): Promise<{ success: boolean; base64?: string; error?: string }> {
		const result = await this.getImage(uri);
		if (result.success && result.data) {
			return { success: true, base64: result.data.toString("base64") };
		}
		return { success: false, error: result.error };
	}

	async deleteImage(key: string, _bucket?: string): Promise<{ success: boolean; error?: string }> {
		try {
			const { filePath } = this.resolveKey(key);
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			return { success: true };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	getPublicUrl(key: string, _bucket?: string): string {
		return `/uploads/${this.resolveKey(key).key}`;
	}

	async getSignedUrl(key: string, _expiresIn: number = 43200, _bucket?: string): Promise<string> {
		return this.getPublicUrl(key);
	}

	async uploadLogFile(
		fileBuffer: Buffer,
		fileName: string,
		contentType: string = "application/octet-stream",
		userId?: number,
	): Promise<UploadImageResult> {
		const timestamp = Date.now();
		const key = userId
			? `logs/${userId}/${timestamp}_${fileName}`
			: `logs/unknown/${timestamp}_${fileName}`;
		return this.uploadImage(fileBuffer, key, contentType);
	}

	async getOssSignedUrl(key: string, _expiresIn: number = 3600): Promise<string> {
		return this.getPublicUrl(key);
	}

	async checkConnection(_bucket?: string): Promise<{ success: boolean; error?: string }> {
		return { success: true };
	}
}
