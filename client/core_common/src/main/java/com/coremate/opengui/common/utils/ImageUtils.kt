// core_common/src/main/java/com/haomai/promotor/common/utils/ImageUtils.kt

package com.coremate.opengui.common.utils

import android.graphics.Bitmap
import android.util.Base64 // android.util.Base64 是 Android 平台特有的
import java.io.ByteArrayOutputStream

/**
 * 图像处理工具类。
 */
object ImageUtils {

    /**
     * Converts a Bitmap to a ByteArray (JPEG format).
     * @param bitmap The Bitmap to convert.
     * @param quality The compression quality (0-100).
     * @return The ByteArray, or null if conversion fails.
     */
    fun bitmapToByteArray(bitmap: Bitmap, quality: Int = 80): ByteArray? {
        return try {
            ByteArrayOutputStream().use { outputStream ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream)
                outputStream.toByteArray()
            }
        } catch (e: Exception) {
            System.err.println("Error converting bitmap to ByteArray: ${e.message}")
            null
        }
    }

    /**
     * Converts a Bitmap to a Base64 encoded String (JPEG format).
     * @param bitmap The Bitmap to convert.
     * @param quality The compression quality (0-100).
     * @return The Base64 encoded String, or null if conversion fails.
     */
    fun bitmapToBase64(bitmap: Bitmap, quality: Int = 80): String? {
        return bitmapToByteArray(bitmap, quality)?.let {
            Base64.encodeToString(it, Base64.NO_WRAP)
        }
    }
}