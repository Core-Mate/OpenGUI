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
	 * 上传文件
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
				error: "请选择要上传的文件",
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
	 * 上传Base64图片
	 */
	@Post("upload-base64")
	async uploadBase64(@Body() dto: UploadBase64Dto) {
		if (!dto.base64) {
			return {
				success: false,
				error: "Base64数据不能为空",
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
	 * 上传图片到 'chat-api' 桶，并返回公共URL
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
				error: "请选择要上传的图片文件",
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
	 * 获取图片（返回图片数据）
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
					error: result.error || "图片未找到",
				});
			}
		} catch (error) {
			res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: error.message || "获取图片失败",
			});
		}
	}

	/**
	 * 获取图片的Base64编码
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
	 * 根据URL获取图片的Base64编码
	 */
	@Get("image-base64-by-url")
	async getImageBase64ByUrl(@Query() dto: GetImageByUrlDto) {
		if (!dto.url) {
			return {
				success: false,
				error: "URL参数不能为空",
			};
		}

		const result = await this.tosService.getImageAsBase64(dto.url);
		return result;
	}

	/**
	 * 删除图片
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
	 * 获取图片的公共URL
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
	 * 获取图片的预签名URL
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
				error: error.message || "生成预签名URL失败",
			};
		}
	}

	/**
	 * 检查TOS连接状态
	 */
	@Get("health")
	async checkHealth(@Query("bucket") bucket?: string) {
		const result = await this.tosService.checkConnection(bucket);
		return result;
	}

	/**
	 * 上传日志文件
	 */
	@Post("upload-log")
	@UseInterceptors(FileInterceptor("file"))
	async uploadLogFile(
		@UploadedFile() file: Express.Multer.File,
		@Body("user_device_log_id") logIdStr: string,
	) {
		const userId = DEFAULT_USER_ID;
		// 1. 验证文件
		if (!file) {
			throw new BadRequestException("请选择要上传的日志文件");
		}

		// 2. 验证 user_device_log_id
		if (!logIdStr) {
			throw new BadRequestException("user_device_log_id 不能为空");
		}

		const logId = parseInt(logIdStr, 10);
		if (isNaN(logId)) {
			throw new BadRequestException("user_device_log_id 格式错误，必须是数字");
		}

		// 3. 查询 user_device_log 记录
		const userDeviceLog = await prisma.user_device_log.findUnique({
			where: { id: logId },
		});

		if (!userDeviceLog) {
			throw new NotFoundException(`日志记录不存在，ID: ${logId}`);
		}

		// 4. 更新 log_status 为 uploading
		await prisma.user_device_log.update({
			where: { id: logId },
			data: {
				log_status: LogTaskStatus.WAIT_UPLOAD,
				updated_at: new Date(),
			},
		});

		try {
			// 5. 上传文件到 TOS
			const uploadResult = await this.tosService.uploadLogFile(
				file.buffer,
				file.originalname,
				file.mimetype,
				userId,
			);

			if (!uploadResult.success) {
				// 上传失败，更新状态为 failed
				await prisma.user_device_log.update({
					where: { id: logId },
					data: {
						log_status: "failed",
						updated_at: new Date(),
					},
				});

				return {
					success: false,
					error: uploadResult.error || "文件上传失败",
				};
			}

			// 6. 上传成功，更新 user_device_log 的 log_uri 和 log_status
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
				message: "日志文件上传成功",
			};
		} catch (error) {
			// 发生异常，更新状态为 failed
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
