import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	HttpStatus,
	NotFoundException,
	Param,
	Post,
	Query,
	Res,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { prisma } from "@repo/db";
import type { Response } from "express";
import { LogTaskStatus } from "../device-log/dto/device-log.dto";
import { type GetImageByUrlDto, type UploadBase64Dto } from "./dto/tos.dto";
import { TosService } from "./tos.service";

const DEFAULT_USER_ID = 1;

@Controller("tos")
export class TosController {
	constructor(private readonly tosService: TosService) {}

	/**
	 */
	@Post("upload")
	@UseInterceptors(FileInterceptor("file"))
	async uploadFile(
		@UploadedFile() file: Express.Multer.File,
		@Body("fileName") fileName?: string,
	) {
		if (!file) {
			return {
				success: false,
				error: "Select a file to upload",
			};
		}

		const result = await this.tosService.uploadImage(
			file.buffer,
			fileName || file.originalname,
			file.mimetype,
		);

		return result;
	}

	/**
	 */
	@Post("upload-base64")
	async uploadBase64(@Body() dto: UploadBase64Dto) {
		if (!dto.base64) {
			return {
				success: false,
				error: "Base64 data cannot be empty",
			};
		}

		const result = await this.tosService.uploadBase64Image(
			dto.base64,
			dto.fileName,
			dto.contentType,
		);

		return result;
	}

	/**
	 */
	@Post("upload-chat-image")
	@UseInterceptors(FileInterceptor("file"))
	async uploadChatImage(
		@UploadedFile() file: Express.Multer.File,
		@Body("fileName") fileName?: string,
	) {
		if (!file) {
			return {
				success: false,
				error: "Select an image file to upload",
			};
		}

		const result = await this.tosService.uploadImageToChatBucket(
			file.buffer,
			fileName || file.originalname,
			file.mimetype,
		);

		return result;
	}

	/**
	 */
	@Get("image/:key")
	async getImage(
		@Param("key") key: string,
		@Res() res: Response,
		@Query("bucket") bucket?: string,
	) {
		try {
			const result = await this.tosService.getImage(key, bucket);

			if (result.success && result.data) {
				res.setHeader("Content-Type", result.contentType || "image/png");
				res.setHeader("Cache-Control", "public, max-age=3600");
				res.send(result.data);
			} else {
				res.status(HttpStatus.NOT_FOUND).json({
					success: false,
					error: result.error || "Image not found",
				});
			}
		} catch (error) {
			res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: error.message || "Failed to fetch image",
			});
		}
	}

	/**
	 */
	@Get("image-base64/:key")
	async getImageBase64(
		@Param("key") key: string,
		@Query("bucket") bucket?: string,
	) {
		const result = await this.tosService.getImageAsBase64(key, bucket);
		return result;
	}

	/**
	 */
	@Get("image-base64-by-url")
	async getImageBase64ByUrl(@Query() dto: GetImageByUrlDto) {
		if (!dto.url) {
			return {
				success: false,
				error: "URL parameter cannot be empty",
			};
		}

		const result = await this.tosService.getImageAsBase64(dto.url);
		return result;
	}

	/**
	 */
	@Delete("image/:key")
	async deleteImage(
		@Param("key") key: string,
		@Query("bucket") bucket?: string,
	) {
		const result = await this.tosService.deleteImage(key, bucket);
		return result;
	}

	/**
	 */
	@Get("public-url/:key")
	async getPublicUrl(
		@Param("key") key: string,
		@Query("bucket") bucket?: string,
	) {
		const url = this.tosService.getPublicUrl(key, bucket);
		return {
			success: true,
			url,
		};
	}

	/**
	 */
	@Get("signed-url/:key")
	async getSignedUrl(
		@Param("key") key: string,
		@Query("expires") expires?: string,
		@Query("bucket") bucket?: string,
	) {
		try {
			const expiresIn = expires ? parseInt(expires, 10) : 3600;
			const url = await this.tosService.getSignedUrl(key, expiresIn, bucket);
			return {
				success: true,
				url,
			};
		} catch (error) {
			return {
				success: false,
				error: error.message || "Failed to generate presigned URL",
			};
		}
	}

	/**
	 */
	@Get("health")
	async checkHealth(@Query("bucket") bucket?: string) {
		const result = await this.tosService.checkConnection(bucket);
		return result;
	}

	/**
	 */
	@Post("upload-log")
	@UseInterceptors(FileInterceptor("file"))
	async uploadLogFile(
		@UploadedFile() file: Express.Multer.File,
		@Body("user_device_log_id") logIdStr: string,
	) {
		const userId = DEFAULT_USER_ID;

		if (!file) {
			throw new BadRequestException("Select a log file to upload");
		}


		if (!logIdStr) {
			throw new BadRequestException("user_device_log_id cannot be empty");
		}

		const logId = parseInt(logIdStr, 10);
		if (isNaN(logId)) {
			throw new BadRequestException("user_device_log_id format is invalid. It must be a number.");
		}


		const userDeviceLog = await prisma.user_device_log.findUnique({
			where: { id: logId },
		});

		if (!userDeviceLog) {
			throw new NotFoundException(`Log record not found，ID: ${logId}`);
		}


		await prisma.user_device_log.update({
			where: { id: logId },
			data: {
				log_status: LogTaskStatus.WAIT_UPLOAD,
				updated_at: new Date(),
			},
		});

		try {

			const uploadResult = await this.tosService.uploadLogFile(
				file.buffer,
				file.originalname,
				file.mimetype,
				userId,
			);

			if (!uploadResult.success) {

				await prisma.user_device_log.update({
					where: { id: logId },
					data: {
						log_status: "failed",
						updated_at: new Date(),
					},
				});

				return {
					success: false,
					error: uploadResult.error || "File upload failed",
				};
			}


			await prisma.user_device_log.update({
				where: { id: logId },
				data: {
					log_uri: uploadResult.key || uploadResult.url || "",
					log_status: LogTaskStatus.UPLOADED,
					updated_at: new Date(),
				},
			});

			return {
				success: true,
				url: uploadResult.url,
				key: uploadResult.key,
				message: "Log file uploaded successfully",
			};
		} catch (error) {

			await prisma.user_device_log.update({
				where: { id: logId },
				data: {
					log_status: LogTaskStatus.FAILED,
					updated_at: new Date(),
				},
			});

			throw error;
		}
	}
}
