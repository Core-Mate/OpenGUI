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
            "$TAG | from = $from | checkPermission | accessibility = $hasAccessibilityServicePermission | overlay = $hasDrawOverlaysPermission | battery whitelist = $hasBatteryOptimizationExemption", TaskCenter.executionId?:-1
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
            item.setTitle("Grant accessibility permission")
            item.setOnTextClickListener {
                dialog.dismiss()
                try {
                    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(context, "Could not open accessibility settings. Please enable it manually.", Toast.LENGTH_LONG).show()
                    LogManager.saveLog(
                        context,
                        TAG,
                        "$TAG | openAccessibilitySettings | Exception = ${e.message}", TaskCenter.executionId?:-1
                    )
                }
            }
            root.addView(item)
        }
        val hasDrawOverlaysPermission = Settings.canDrawOverlays(context)
        if (!hasDrawOverlaysPermission) {
            val item = PermissionDialogItem(context)
            item.setTitle("Grant overlay permission")
            item.setOnTextClickListener {
                dialog.dismiss()
                try {
                    val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(context, "Could not open overlay settings. Please enable it manually.", Toast.LENGTH_LONG).show()
                    LogManager.saveLog(
                        context,
                        TAG,
                        "$TAG | openOverlaySettings | Exception = ${e.message}", TaskCenter.executionId?:-1
                    )
                }
            }
            root.addView(item)
        }
        if (!hasBatteryOptimizationExemption(context)) {
            try {
                val item = PermissionDialogItem(context)
                item.setTitle("Allow OpenGUI AI to ignore battery optimization")
                item.setOnTextClickListener {
                    dialog.dismiss()
                    try {
                        val intent =
                            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                data = Uri.parse("package:${context.packageName}")
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                        context.startActivity(intent)
                    } catch (e: Exception) {
                        Toast.makeText(context, "Could not open battery optimization prompt. Opening battery settings instead.", Toast.LENGTH_LONG).show()
                        LogManager.saveLog(
                            context,
                            TAG,
                            "$TAG | openBatteryOptimizationPrompt | Exception = ${e.message}", TaskCenter.executionId?:-1
                        )
                        openBatteryOptimizationSettings(context)
                    }
                }
                root.addView(item)
            } catch (e: Exception) {
                Toast.makeText(context, "Could not open battery optimization settings. Please allow OpenGUI AI manually.", Toast.LENGTH_LONG).show()
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
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    fun hasBatteryOptimizationExemption(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }
}
