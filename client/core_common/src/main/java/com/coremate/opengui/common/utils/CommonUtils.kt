package com.coremate.opengui.common.utils

import android.content.Context

/**
 * 通用工具类
 * 提供常用的工具方法
 */
object CommonUtils {

    /**
     * 将 dp 转换为 px
     *
     * @param context 应用上下文
     * @param dpValue dp 值
     * @return 转换后的 px 值
     */
    fun dpToPx(context: Context, dpValue: Float): Int {
        val displayMetrics = context.resources.displayMetrics
        return (dpValue * displayMetrics.density).toInt()
    }

    /**
     * 将 dp 转换为 px (Double 版本)
     *
     * @param context 应用上下文
     * @param dpValue dp 值
     * @return 转换后的 px 值
     */
    fun dpToPx(context: Context, dpValue: Double): Int {
        return dpToPx(context, dpValue.toFloat())
    }

    /**
     * 将 dp 转换为 px (Int 版本)
     *
     * @param context 应用上下文
     * @param dpValue dp 值
     * @return 转换后的 px 值
     */
    fun dpToPx(context: Context, dpValue: Int): Int {
        return dpToPx(context, dpValue.toFloat())
    }

    /**
     * 将 px 转换为 dp
     *
     * @param context 应用上下文
     * @param pxValue px 值
     * @return 转换后的 dp 值
     */
    fun pxToDp(context: Context, pxValue: Float): Int {
        val displayMetrics = context.resources.displayMetrics
        return (pxValue / displayMetrics.density).toInt()
    }

    /**
     * 获取屏幕宽度 (px)
     *
     * @param context 应用上下文
     * @return 屏幕宽度
     */
    fun getScreenWidth(context: Context): Int {
        val displayMetrics = context.resources.displayMetrics
        return displayMetrics.widthPixels
    }

    /**
     * 获取屏幕高度 (px)
     *
     * @param context 应用上下文
     * @return 屏幕高度
     */
    fun getScreenHeight(context: Context): Int {
        val displayMetrics = context.resources.displayMetrics
        return displayMetrics.heightPixels
    }

    /**
     * 获取屏幕密度
     *
     * @param context 应用上下文
     * @return 屏幕密度
     */
    fun getScreenDensity(context: Context): Float {
        return context.resources.displayMetrics.density
    }
}

/**
 * Float 扩展函数：将 dp 转换为 px
 *
 * @param context 应用上下文
 * @return 转换后的 px 值
 */
fun Float.dpToPx(context: Context): Int {
    return CommonUtils.dpToPx(context, this)
}

/**
 * Int 扩展函数：将 dp 转换为 px
 *
 * @param context 应用上下文
 * @return 转换后的 px 值
 */
fun Int.dpToPx(context: Context): Int {
    return CommonUtils.dpToPx(context, this)
}

/**
 * Double 扩展函数：将 dp 转换为 px
 *
 * @param context 应用上下文
 * @return 转换后的 px 值
 */
fun Double.dpToPx(context: Context): Int {
    return CommonUtils.dpToPx(context, this)
}

/**
 * Float 扩展函数：将 px 转换为 dp
 *
 * @param context 应用上下文
 * @return 转换后的 dp 值
 */
fun Float.pxToDp(context: Context): Int {
    return CommonUtils.pxToDp(context, this)
}
