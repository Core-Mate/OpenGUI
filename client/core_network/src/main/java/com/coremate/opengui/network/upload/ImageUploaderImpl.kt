package com.coremate.opengui.network.upload

import android.content.Context
import com.google.gson.Gson
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.network.interceptors.HeaderInterceptor
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

// 定义后端上传接口的响应体数据类
data class UploadBackendResponse(val success: Boolean, val key: String?, val error: String?)

/**
 * 真实的 ImageUploader 实现，将图片数据上传到您后端提供的 /tos/upload 接口。
 */
class ImageUploaderImpl(private val token: String, private val baseUrl: String) :
    ImageUploader { // 构造函数需要baseUrl

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS) // 连接超时
        .readTimeout(30, TimeUnit.SECONDS)    // 读取超时
        .writeTimeout(30, TimeUnit.SECONDS)   // 写入超时
        .callTimeout(60, TimeUnit.SECONDS)    // 完整调用超时（OkHttp 4.0+）
        .addInterceptor(HeaderInterceptor(token))
        .build()
    private val gson = Gson()

    override suspend fun uploadImage(context: Context, imageData: ByteArray, fileName: String?): String? {
        val finalFileName = fileName ?: "screenshot_${System.currentTimeMillis()}.webp"
        val requestUrl = "$baseUrl/api/tos/upload" // 拼接完整的上传 URL
        LogManager.saveLog(context,"ImageUploaderImpl",
            "Attempting to upload image to backend: $requestUrl for file: $finalFileName    Image data size: ${imageData.size} bytes",
            TaskCenter.executionId?:-1)
        return suspendCancellableCoroutine { continuation ->
            // 构建请求体：MultipartBody 来模拟 FormData
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM) // 对应 FormData 类型
                .addFormDataPart(
                    "file", // 对应前端 `formData.append('file', newImg.file)` 中的 'file' 键
                    finalFileName, // 文件名
                    imageData.toRequestBody("image/webp".toMediaTypeOrNull()) // 图片数据和媒体类型
                )
                .build()

            val request = Request.Builder()
                .url(requestUrl)
                .post(requestBody)
                .build()
            val start = System.currentTimeMillis()
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    LogManager.saveLog(context,"ImageUploaderImpl",
                        "Image upload to backend failed: ${e.message}------>duration = ${System.currentTimeMillis() - start}",
                        TaskCenter.executionId?:-1)
                    continuation.resume(null)
                }

                override fun onResponse(call: Call, response: Response) {
                    LogManager.saveLog(context,"ImageUploaderImpl",
                        "Image Upload duration = ${System.currentTimeMillis() - start}",
                        TaskCenter.executionId?:-1)
                    if (response.isSuccessful) {
                        val responseBody = response.body?.string()
                        try {
                            val uploadResponse =
                                gson.fromJson(responseBody, UploadBackendResponse::class.java)
                            if (uploadResponse.success && uploadResponse.key != null) {
                                LogManager.saveLog(context,"ImageUploaderImpl",
                                    "Image uploaded successfully. Returning key: ${uploadResponse.key}",
                                    TaskCenter.executionId?:-1)
                                continuation.resume(uploadResponse.key)
                            } else {
                                LogManager.saveLog(context,"ImageUploaderImpl",
                                    "Image upload to backend failed: ${uploadResponse.error ?: "Unknown error"}",
                                    TaskCenter.executionId?:-1)
                                continuation.resume(null)
                            }
                        } catch (e: Exception) {
                            LogManager.saveLog(context,"ImageUploaderImpl",
                                "Failed to parse backend upload response: ${e.message}, Response: $responseBody",
                                TaskCenter.executionId?:-1)
                            continuation.resume(null)
                        }
                    } else {
                        LogManager.saveLog(context,"ImageUploaderImpl",
                            "Image upload to backend failed with code ${response.code}: ${response.message}, Body: ${response.body?.string()}",
                            TaskCenter.executionId?:-1)
                        continuation.resume(null)
                    }
                }
            })

            // 处理协程取消
            continuation.invokeOnCancellation { throwable ->
                LogManager.saveLog(context,"ImageUploaderImpl",
                    "Image upload to backend was cancelled: ${throwable?.message}",
                    TaskCenter.executionId?:-1)
                // 对于 OkHttp，取消协程通常会自动取消 Call，无需额外处理
            }
        }
    }
}