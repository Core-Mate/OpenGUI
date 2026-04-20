package com.coremate.opengui.automation.base.utils

import android.content.Context
import android.content.res.Resources
import android.util.DisplayMetrics
import android.view.WindowManager
import com.coremate.opengui.automation.AMServiceManager

class AMScreenUtils {

    companion object {
        /**
         * 获取屏幕的宽度（单位：px）
         *
         * @return 屏幕宽px
         */
        @JvmStatic
        fun screenWidth() = AMServiceManager.applicationContext.let {
            val windowManager = it.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val dm = DisplayMetrics() // 创建了一张白纸
            windowManager.defaultDisplay.getMetrics(dm) // 给白纸设置宽高
            dm.widthPixels
        } ?: 0

        /**
         * 获取屏幕的高度（单位：px）
         *
         * @return 屏幕高px
         */
        @JvmStatic
        fun screenHeight(): Int = AMServiceManager.applicationContext.let {
            val windowManager =
                it.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val dm = DisplayMetrics() // 创建了一张白纸
            windowManager.defaultDisplay.getMetrics(dm) // 给白纸设置宽高
            dm.heightPixels
        } ?: 0

        /**
         * 获取状态栏高度
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