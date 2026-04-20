package com.coremate.opengui.automation.base

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.coremate.opengui.automation.AMServiceManager

/**
 * 目标APP
 * @param zhName app名称
 * @param shortName 简称（例如微信 WX）
 * @param packageName 包名
 * @param version 适配版本
 * */
enum class AMTargetApp(
    val zhName: String,
    val shortName: String,
    val packageName: String,
    var version: String,
) {
    WX(
        "微信",
        "wx",
        "com.tencent.mm",
        "8.0.60",
    ),
    LV(
        "剪映",
        "lv",
        "com.lemon.lv",
        "16.6.0",
    ),
    TK(
        "抖音",
        "tk",
        "com.ss.android.ugc.aweme",
        "31.7.1",
    ),
    RED(
        "小红书",
        "red",
        "com.xingin.xhs",
        "8.69.5",
    ),
    SYS_PERMISSION(
        "系统权限",
        "permission",
        "com.android.permissioncontroller",
        "1.0.0"
    ),
    OPLUS_PERMISSION(
        "系统权限2",
        "permission2",
        "com.oplus.securitypermission",
        "1.0.0"
    );

    companion object {
        /**
         * 判断是否安装
         * */
        fun checkInstall(context: Context, targetApp: AMTargetApp): Boolean =
            isAppInstalled(context, targetApp.packageName)

        /**
         * 判断三方app是否已安装
         * @param context 上下文对象
         * @param packageName 三方app的包名
         * @return 是否已安装
         */
        private fun isAppInstalled(context: Context, packageName: String?): Boolean {
            val packageManager = context.packageManager
            return try {
                packageManager.getPackageInfo(packageName!!, PackageManager.GET_ACTIVITIES)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }
    }

    /**
     * 打开三方app
     * */
    fun openThirdApp() {
        val intent =
            AMServiceManager.applicationContext.packageManager?.getLaunchIntentForPackage(
                packageName
            )
        if (intent != null) {
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            AMServiceManager.applicationContext.startActivity(intent)
        }
    }

}