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
        ///全局上下文
        lateinit var applicationContext: Context
        val instance by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            AMServiceManager()
        }
    }

    //是否开启前台服务
    private var isStartService = false

    //前台服务图标
    var notificationImg: Int? = null

//    var cozeAIManager: CozeAIManager? = null

    /**
     * 初始化
     * @param context 必须是ApplicationContext
     */
    fun init(context: Context) {
        applicationContext = context
    }

    /**
     * 获取无障碍服务
     */
    fun accessibilityService(): AccessibilityService? {
        return SelectToSpeakService.service
    }

    /**
     * 检测权限
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
     * 开启前台服务
     * @param notificationImg 图标
     */
    fun startForegroundService(context: Activity, requestCode: Int, notificationImg: Int? = null) {
        this.notificationImg = notificationImg
        //请求通知权限
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
        //再次启动Service
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intentFive = Intent(context, AMForegroundService::class.java)
            context.startForegroundService(intentFive)
        } else {
            val intentFive = Intent(context, AMForegroundService::class.java)
            context.startService(intentFive)
        }
    }

    /**
     * 关闭前台服务
     */
    fun stopForegroundService(context: Context?) {
        //停止Service
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
     * 开启自启动权限
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
                        // fallback：跳转到应用详情页
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
     * 执行任务
     * @param context 当前调用的actviity
     * @param param - bizType 和 对应的bean(参数)
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
     * 添加任务监听
     * */
    fun addObserver(listener: IAMProcessListener) {
        AMCore.instance.addObserver(listener)
    }

    /**
     * 移除任务监听
     * */
    fun removeObserver(listener: IAMProcessListener) {
        AMCore.instance.removeObserver(listener)
    }

    /**
     * 移除所有监听
     * */
    fun removeAllObserver() {
        AMCore.instance.removeAllObserver()
    }

}