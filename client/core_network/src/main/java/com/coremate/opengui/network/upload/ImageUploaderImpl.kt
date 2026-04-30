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

// Response body from the backend upload endpoint.
data class UploadBackendResponse(val success: Boolean, val key: String?, val error: String?)

/**
 * ImageUploader implementation that uploads image bytes to the backend /tos/upload endpoint.
 */
class ImageUploaderImpl(private val token: String, private val baseUrl: String) :
    ImageUploader {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS) // Connect timeout.
        .readTimeout(30, TimeUnit.SECONDS)    // Read timeout.
        .writeTimeout(30, TimeUnit.SECONDS)   // Write timeout.
        .callTimeout(60, TimeUnit.SECONDS)    // Full call timeout (OkHttp 4.0+).
        .addInterceptor(HeaderInterceptor(token))
        .build()
    private val gson = Gson()

    override suspend fun uploadImage(context: Context, imageData: ByteArray, fileName: String?): String? {
        val finalFileName = fileName ?: "screenshot_${System.currentTimeMillis()}.webp"
        val requestUrl = "$baseUrl/api/tos/upload" // Full upload URL.
        LogManager.saveLog(context,"ImageUploaderImpl",
            "Attempting to upload image to backend: $requestUrl for file: $finalFileName    Image data size: ${imageData.size} bytes",
            TaskCenter.executionId?:-1)
        return suspendCancellableCoroutine { continuation ->
            // Build a multipart request body that matches browser FormData.
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                    "file",
                    finalFileName,
                    imageData.toRequestBody("image/webp".toMediaTypeOrNull())
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

            // Handle coroutine cancellation.
            continuation.invokeOnCancellation { throwable ->
                LogManager.saveLog(context,"ImageUploaderImpl",
                    "Image upload to backend was cancelled: ${throwable?.message}",
                    TaskCenter.executionId?:-1)
                // OkHttp calls are usually cancelled automatically with the coroutine.
            }
        }
    }
}
