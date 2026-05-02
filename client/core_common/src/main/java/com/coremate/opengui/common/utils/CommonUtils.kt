package com.coremate.opengui.common.utils

import android.content.Context

/**
 * Common utility class
 * Provides common utility methods
 */
object CommonUtils {

    /**
 * Convert dp to px
     *
 * @param context application context
 * @param dp Value dp value
 * @return converted px value
     */
    fun dpToPx(context: Context, dpValue: Float): Int {
        val displayMetrics = context.resources.displayMetrics
        return (dpValue * displayMetrics.density).toInt()
    }

    /**
 * Convert dp to px (Double version)
     *
 * @param context application context
 * @param dp Value dp value
 * @return converted px value
     */
    fun dpToPx(context: Context, dpValue: Double): Int {
        return dpToPx(context, dpValue.toFloat())
    }

    /**
 * Convert dp to px (Int version)
     *
 * @param context application context
 * @param dp Value dp value
 * @return converted px value
     */
    fun dpToPx(context: Context, dpValue: Int): Int {
        return dpToPx(context, dpValue.toFloat())
    }

    /**
 * Convert px to dp
     *
 * @param context application context
 * @param px Value px value
 * @return converted dp value
     */
    fun pxToDp(context: Context, pxValue: Float): Int {
        val displayMetrics = context.resources.displayMetrics
        return (pxValue / displayMetrics.density).toInt()
    }

    /**
 * Get screen width in px
     *
 * @param context application context
 * @return screen width
     */
    fun getScreenWidth(context: Context): Int {
        val displayMetrics = context.resources.displayMetrics
        return displayMetrics.widthPixels
    }

    /**
 * Get screen height in px
     *
 * @param context application context
 * @return screen height
     */
    fun getScreenHeight(context: Context): Int {
        val displayMetrics = context.resources.displayMetrics
        return displayMetrics.heightPixels
    }

    /**
 * Get screen density
     *
 * @param context application context
 * @return screen density
     */
    fun getScreenDensity(context: Context): Float {
        return context.resources.displayMetrics.density
    }
}

/**
 * Float Extension functions:Convert dp to px
 *
 * @param context application context
 * @return converted px value
 */
fun Float.dpToPx(context: Context): Int {
    return CommonUtils.dpToPx(context, this)
}

/**
 * Int Extension functions:Convert dp to px
 *
 * @param context application context
 * @return converted px value
 */
fun Int.dpToPx(context: Context): Int {
    return CommonUtils.dpToPx(context, this)
}

/**
 * Double Extension functions:Convert dp to px
 *
 * @param context application context
 * @return converted px value
 */
fun Double.dpToPx(context: Context): Int {
    return CommonUtils.dpToPx(context, this)
}

/**
 * Float Extension functions:Convert px to dp
 *
 * @param context application context
 * @return converted dp value
 */
fun Float.pxToDp(context: Context): Int {
    return CommonUtils.pxToDp(context, this)
}
