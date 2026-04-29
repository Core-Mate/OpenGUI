package com.coremate.opengui.accessibility.capture

import android.graphics.Bitmap
import android.os.Build
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.common.interfaces.ScreenshotProvider

/**
 * A manager class for handling screen capture operations via the Accessibility Service.
 */
class ScreenCaptureManager : ScreenshotProvider {

    /**
     * Captures the current screen.
     */
    override suspend fun capture(): Bitmap? {
        // Check for the required Android version.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            System.err.println("Screen capture requires Android 11 (API 30) or higher.")
            return null
        }

        // Call the capture method on the running GestureService instance.
        return GestureService.Companion.instance?.captureScreen()
    }
}