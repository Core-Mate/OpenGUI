// ImageUploader.kt (接口不变)
package com.coremate.opengui.network.upload

import android.content.Context

interface ImageUploader {
    suspend fun uploadImage(context: Context, imageData: ByteArray, fileName: String? = null): String?
}