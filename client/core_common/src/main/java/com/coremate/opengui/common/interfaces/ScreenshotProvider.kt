// core_common/src/main/java/com/haomai/promotor/common/interfaces/ScreenshotProvider.kt

package com.coremate.opengui.common.interfaces

import android.graphics.Bitmap // 接口中使用 Bitmap，所以此接口必须在 Android 模块

/**
 * 提供截图功能的抽象接口。
 * 旨在打破模块间的直接依赖，实现依赖倒置。
 */
interface ScreenshotProvider {
    /**
     * 捕获当前屏幕截图。
     * 这是一个 suspend 函数，必须在协程作用域内调用。
     * @return 屏幕截图的 Bitmap 对象，如果捕获失败则返回 null。
     */
    suspend fun capture(): Bitmap?
}