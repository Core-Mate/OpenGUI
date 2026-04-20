package com.coremate.opengui.automation.base.utils

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import com.coremate.opengui.automation.AMServiceManager

class AMPermissionUtils {

    companion object {

        /////////////////////////////////////////////////////////////////////////////////
        //
        //                      权限
        //
        /////////////////////////////////////////////////////////////////////////////////

        /**
         * 检查是否开启辅助权限
         */
        fun hasAccessibilityPermission(ct: Context, serviceClass: Class<*>): Boolean {
            var ok = 0
            try {
                ok = Settings.Secure.getInt(
                    ct.applicationContext.contentResolver,
                    android.provider.Settings.Secure.ACCESSIBILITY_ENABLED
                )
            } catch (ex: Exception) {
                ex.printStackTrace()
            }
            val ms = TextUtils.SimpleStringSplitter(':')
            if (ok == 1) {
                val settingValue = Settings.Secure.getString(
                    ct.contentResolver,
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                )
                if (settingValue != null) {
                    ms.setString(settingValue)
                    while (ms.hasNext()) {
                        val accessibilityService = ms.next()
                        if (accessibilityService.contains(serviceClass.simpleName) && accessibilityService.contains(
                                AMServiceManager.applicationContext.packageName ?: ""
                            )
                        ) {
                            return true
                        }
                    }
                }
            }
            return false
        }

        /**
         * 跳转到设置页的辅助功能
         */
        fun openAccessibilitySetting(ct: Context) {
            ct.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        /**
         * 检查悬浮窗权限
         */
        fun hasAlertWindowPermission(context: Context): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                return try {
                    var cls = Class.forName("android.content.Context")
                    val declaredField = cls.getDeclaredField("APP_OPS_SERVICE")
                    declaredField.isAccessible = true
                    var obj: Any? = declaredField[cls] as? String ?: return false
                    val str2 = obj as String
                    obj =
                        cls.getMethod("getSystemService", String::class.java).invoke(context, str2)
                    cls = Class.forName("android.app.AppOpsManager")
                    val declaredField2 = cls.getDeclaredField("MODE_ALLOWED")
                    declaredField2.isAccessible = true
                    val checkOp = cls.getMethod(
                        "checkOp", Integer.TYPE, Integer.TYPE,
                        String::class.java
                    )
                    val result =
                        checkOp.invoke(obj, 24, Binder.getCallingUid(), context.packageName) as Int
                    result == declaredField2.getInt(cls)
                } catch (e: java.lang.Exception) {
                    false
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                return Settings.canDrawOverlays(context)
            }
            return false
        }

        /**
         * 请求悬浮窗权限
         * @param activity
         * @param REQUEST_DIALOG_PERMISSION
         */
        fun openAlertWindowSetting(activity: Activity, REQUEST_DIALOG_PERMISSION: Int) {
            val sdkInt = Build.VERSION.SDK_INT
            if (sdkInt >= Build.VERSION_CODES.O) { //8.0以上
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
                intent.data = Uri.parse("package:" + activity.packageName)
                activity.startActivityForResult(intent, REQUEST_DIALOG_PERMISSION)
            } else if (sdkInt >= Build.VERSION_CODES.M) { //6.0-8.0
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
                intent.data = Uri.parse("package:" + activity.packageName)
                activity.startActivityForResult(intent, REQUEST_DIALOG_PERMISSION)
            } else { //4.4-6.0一下
                //无需处理了.....
            }
        }

    }
}