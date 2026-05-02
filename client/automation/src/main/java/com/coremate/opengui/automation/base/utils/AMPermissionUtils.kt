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
        // Permission
        //
        /////////////////////////////////////////////////////////////////////////////////

        /**
 * Check Whether accessibility permission is enabled
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
 * Navigate to accessibility settings
         */
        fun openAccessibilitySetting(ct: Context) {
            ct.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        /**
 * Check Floating window Permission
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
 * Request floating-window permission
         * @param activity
         * @param REQUEST_DIALOG_PERMISSION
         */
        fun openAlertWindowSetting(activity: Activity, REQUEST_DIALOG_PERMISSION: Int) {
            val sdkInt = Build.VERSION.SDK_INT
            if (sdkInt >= Build.VERSION_CODES.O) { // Android 8.0 and above.
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
                intent.data = Uri.parse("package:" + activity.packageName)
                activity.startActivityForResult(intent, REQUEST_DIALOG_PERMISSION)
            } else if (sdkInt >= Build.VERSION_CODES.M) { //6.0-8.0
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
                intent.data = Uri.parse("package:" + activity.packageName)
                activity.startActivityForResult(intent, REQUEST_DIALOG_PERMISSION)
            } else { // Android 4.4 to below 6.0.
                //No handling needed.....
            }
        }

    }
}
