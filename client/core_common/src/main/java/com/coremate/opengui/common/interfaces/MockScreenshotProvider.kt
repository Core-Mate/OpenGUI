// core_common/src/main/java/com/haomai/promotor/common/interfaces/MockScreenshotProvider.kt

package com.coremate.opengui.common.interfaces

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.coremate.opengui.common.utils.AndroidLogger
import com.coremate.opengui.common_jvm.utils.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.util.concurrent.atomic.AtomicInteger

/**
 * Mock 实现的 ScreenshotProvider，用于从 assets 加载预设图片进行测试。
 */
class MockScreenshotProvider(
    private val context: Context,
    private val imageAssetPaths: List<String> // 传入 assets 目录下的图片路径列表
) : ScreenshotProvider {

    private val runtimeLogger: Logger = AndroidLogger()
    private val imageIndex = AtomicInteger(0) // 用于轮询图片列表

    override suspend fun capture(): Bitmap? = withContext(Dispatchers.IO) {
        if (imageAssetPaths.isEmpty()) {
            runtimeLogger.warn("MockScreenshotProvider", "No image asset paths provided for mocking.")
            return@withContext null
        }

        // 轮询图片列表
        val currentIndex = imageIndex.getAndIncrement() % imageAssetPaths.size
        val imagePath = imageAssetPaths[currentIndex]

        return@withContext try {
            val inputStream: InputStream = context.assets.open(imagePath)
            val bitmap = BitmapFactory.decodeStream(inputStream)
            inputStream.close()
            runtimeLogger.info("MockScreenshotProvider", "Mock screenshot captured from assets: $imagePath")
            bitmap
        } catch (e: Exception) {
            runtimeLogger.error("MockScreenshotProvider", "Failed to load mock screenshot from assets: $imagePath. Error: ${e.message}", e)
            null
        }
    }
}