package com.coremate.opengui.automation

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.app.Activity
import android.app.AlertDialog
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.context.IAMProcessListener
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.permission.CaptureManager
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMPermissionUtils
import com.coremate.opengui.automation.base.utils.AMToastUtils
import com.coremate.opengui.automation.biz.common.foreground.AMForegroundService
import com.coremate.opengui.automation.biz.permission.AMPermissionDialog
//import com.coremate.opengui.automation.test.CozeAIManager

class AMServiceManager {

    companion object {
        ///Global Context
        lateinit var applicationContext: Context
        val instance by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            AMServiceManager()
        }
    }

    //Whether foreground service is enabled
    private var isStartService = false

    //Foreground service icon
    var notificationImg: Int? = null

//    var cozeAIManager: CozeAIManager? = null

    /**
 * Initialize
 * @param context must be Application Context
     */
    fun init(context: Context) {
        applicationContext = context
    }

    /**
 * Get Accessibility service
     */
    fun accessibilityService(): AccessibilityService? {
        return SelectToSpeakService.service
    }

    /**
 * Check Permission
     * */
    fun checkPermission(
        context: Activity,
    ): Boolean {
        AMCore.activityByOp = context
        val hasPermission = (true.takeIf {
            AMPermissionUtils.hasAlertWindowPermission(context)
        }?.takeIf {
            AMPermissionUtils.hasAccessibilityPermission(
                context, SelectToSpeakService::
                class.java
            )
        }) ?: false.also {
            AMPermissionDialog(context).show()
        }
        return hasPermission
    }

    /**
 * Start foreground service
 * @param notification Img icon
     */
    fun startForegroundService(context: Activity, requestCode: Int, notificationImg: Int? = null) {
        this.notificationImg = notificationImg
        //Request notification permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                context.requestPermissions(
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    requestCode
                )
            } else {
                startForeground(context)
            }
        } else {
            startForeground(context)
        }
    }

    private fun startForeground(context: Activity) {
        isStartService = true
        //Start Service again
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intentFive = Intent(context, AMForegroundService::class.java)
            context.startForegroundService(intentFive)
        } else {
            val intentFive = Intent(context, AMForegroundService::class.java)
            context.startService(intentFive)
        }
    }

    /**
 * Stop foreground service
     */
    fun stopForegroundService(context: Context?) {
        //Stop Service
        if (context != null) {
            if (isStartService) {
                isStartService = false
                try {
                    val intentFour = Intent(
                        context,
                        AMForegroundService::class.java
                    )
                    context.stopService(intentFour)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    /**
 * Open autostart permission settings
     */
    fun gotoOppoAutoStartSettings(context: Context) {
        AlertDialog.Builder(context)
            .setTitle("权限提醒")
            .setMessage("请前往设置 > 应用 > 自启动，开启本应用的自启动权限。")
            .setPositiveButton("前往") { dialog, _ ->
                try {
                    val intent = Intent()
                    intent.component = ComponentName(
                        "com.android.settings",
                        "com.android.settings.Settings"
                    )
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                } catch (e: Exception) {
                    try {
                        val intent = Intent()
                        intent.component = ComponentName(
                            "com.android.settings",
                            "com.android.settings.Settings"
                        )
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(intent)
                    } catch (e: Exception) {
                        // fallback: navigate to the app details page
                        val fallbackIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        fallbackIntent.data = Uri.parse("package:${context.packageName}")
                        fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(fallbackIntent)
                    }
                }
            }
            .setNegativeButton("取消") { dialog, _ ->
                dialog.dismiss()
            }
            .show()

    }

    /**
 * Execute task
 * @param context current calling activity
 * @param param biz Type and the corresponding parameter bean
     */
    fun processTask(context: Activity, param: AMDataContainer) {
        AMCore.instance.context = context
        if (checkPermission(context)) {
            if (param.bizType != null) {
                AMCore.instance.waitTasks.add(param)
                AMLog.onEDebugLog("加入操作队列")
            } else {
                AMToastUtils.showToast("bizType 不能为null")
            }
            AMCore.instance.consume()
        }
    }

    /**
 * Add task listener
     * */
    fun addObserver(listener: IAMProcessListener) {
        AMCore.instance.addObserver(listener)
    }

    /**
 * Remove task listener
     * */
    fun removeObserver(listener: IAMProcessListener) {
        AMCore.instance.removeObserver(listener)
    }

    /**
 * Remove all listeners
     * */
    fun removeAllObserver() {
        AMCore.instance.removeAllObserver()
    }

}