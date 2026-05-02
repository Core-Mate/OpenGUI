// core_common/src/main/java/com/haomai/promotor/common/interfaces/ScreenshotProvider.kt

package com.coremate.opengui.common.interfaces

import android.graphics.Bitmap // Bitmap keeps this interface in an Android module.

/**
 * Abstraction for screenshot capture.
 * Breaks direct module dependencies through dependency inversion.
 */
interface ScreenshotProvider {
    /**
 * Capture the current screen.
 * This is a suspend function and must be called from a coroutine scope.
 * @return screenshot Bitmap, or null when capture fails.
     */
    suspend fun capture(): Bitmap?
}
