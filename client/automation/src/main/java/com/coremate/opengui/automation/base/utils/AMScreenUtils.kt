package com.coremate.opengui.automation.base.utils

import android.content.Context
import android.content.res.Resources
import android.util.DisplayMetrics
import android.view.WindowManager
import com.coremate.opengui.automation.AMServiceManager

class AMScreenUtils {

    companion object {
        /**
 * Get screen width in px
         *
 * @return screen width in px
         */
        @JvmStatic
        fun screenWidth() = AMServiceManager.applicationContext.let {
            val windowManager = it.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val dm = DisplayMetrics() // Create an empty metrics object.
            windowManager.defaultDisplay.getMetrics(dm) // Populate width and height.
            dm.widthPixels
        } ?: 0

        /**
 * Get screen height in px
         *
 * @return screen height in px
         */
        @JvmStatic
        fun screenHeight(): Int = AMServiceManager.applicationContext.let {
            val windowManager =
                it.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val dm = DisplayMetrics() // Create an empty metrics object.
            windowManager.defaultDisplay.getMetrics(dm) // Populate width and height.
            dm.heightPixels
        } ?: 0

        /**
 * Get status bar height
         * */
        @JvmStatic
        fun getStatusBarHeight(): Int = Resources.getSystem().getDimensionPixelSize(
            Resources.getSystem().getIdentifier("status_bar_height", "dimen", "android")
        )

        /**
         * dp -> px
         */
        @JvmStatic
        fun dp2px(dpValue: Float): Int = AMServiceManager.applicationContext.let {
            val scale: Float = it.resources.displayMetrics.density
            (dpValue * scale + 0.5f).toInt()
        } ?: 0

    }

}
