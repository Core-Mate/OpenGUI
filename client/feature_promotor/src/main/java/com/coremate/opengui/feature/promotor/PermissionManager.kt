package com.coremate.opengui.feature.promotor

import android.content.Context
import android.content.Intent
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.view.LayoutInflater
import android.view.Window
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import com.coremate.opengui.automation.base.utils.AMScreenUtils.Companion.dp2px
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.feature.promotor.ui.views.PermissionDialogItem

object PermissionManager {

    private lateinit var dialog: AlertDialog
    private val TAG = "PermissionManager"

    fun checkPermission(context: Context, from: String): Boolean {
        val hasAccessibilityServicePermission = isAccessibilityServiceEnabled(context)
        val hasDrawOverlaysPermission = Settings.canDrawOverlays(context)
        val hasBatteryOptimizationExemption = hasBatteryOptimizationExemption(context)
        LogManager.saveLog(
            context,
            TAG,
            "$TAG | from = $from | checkPermission | 无障碍服务权限 = $hasAccessibilityServicePermission | 悬浮窗权限 = $hasDrawOverlaysPermission | 电池白名单 = $hasBatteryOptimizationExemption", TaskCenter.executionId?:-1
        )
        return hasAccessibilityServicePermission && hasDrawOverlaysPermission && hasBatteryOptimizationExemption
    }

    fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val service = "${context.packageName}/${GestureService::class.java.canonicalName}"
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        return enabledServices?.contains(service) == true
    }

    fun showRequestPermissionWindow(context: Context) {
        val builder = AlertDialog.Builder(context)
        val view = LayoutInflater.from(context).inflate(R.layout.view_show_permission_state, null)
        val root = view.findViewById<LinearLayout>(R.id.root)
        val hasAccessibilityServicePermission = isAccessibilityServiceEnabled(context)
        if (!hasAccessibilityServicePermission) {
            val item = PermissionDialogItem(context)
            item.setTitle("授予无障碍服务权限")
            item.setOnTextClickListener {
                dialog.dismiss()
                val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            }
            root.addView(item)
        }
        val hasDrawOverlaysPermission = Settings.canDrawOverlays(context)
        if (!hasDrawOverlaysPermission) {
            val item = PermissionDialogItem(context)
            item.setTitle("授予悬浮窗权限")
            item.setOnTextClickListener {
                dialog.dismiss()
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
            root.addView(item)
        }
        if (!hasBatteryOptimizationExemption(context)) {
            try {
                val item = PermissionDialogItem(context)
                item.setTitle("将OpenGUI AI 加入电池白名单")
                item.setOnTextClickListener {
                    dialog.dismiss()
                    val intent =
                        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                            data = Uri.parse("package:${context.packageName}")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) // <<< 在这里添加 FLAG_ACTIVITY_NEW_TASK
                        }
                    context.startActivity(intent)
                }
                root.addView(item)
            } catch (e: Exception) {
                Toast.makeText(context, "无法打开电池优化设置，请手动将OpenGUI AI 加入电池白名单", Toast.LENGTH_LONG).show()
                LogManager.saveLog(
                    context,
                    TAG,
                    "$TAG | showRequestPermissionWindow | Exception = ${e.message}", TaskCenter.executionId?:-1
                )
                openBatteryOptimizationSettings(context)
            }
        }
        builder.setView(view)
        dialog = builder.create()
        dialog.show()
        dialog.setCancelable(true)
        val window: Window? = dialog.window
        window?.setBackgroundDrawable(BitmapDrawable())
        window?.setLayout(dp2px(330f), dp2px(389f))
    }

    fun openBatteryOptimizationSettings(context: Context) {
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        context.startActivity(intent)
    }

    fun hasBatteryOptimizationExemption(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }
}