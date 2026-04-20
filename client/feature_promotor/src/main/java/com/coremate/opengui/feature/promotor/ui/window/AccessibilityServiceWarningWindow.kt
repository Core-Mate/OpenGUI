package com.coremate.opengui.feature.promotor.ui.window

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.WindowManager
import android.widget.FrameLayout
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.common.MessageController
import com.coremate.opengui.feature.promotor.databinding.WindowAccessibilityServiceWarningBinding
import com.coremate.opengui.feature.promotor.ui.AIFloatWindowManager

class AccessibilityServiceWarningWindow(context: Context) : FrameLayout(context) {
    private val binding: WindowAccessibilityServiceWarningBinding
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    var isShowing = false

    init {
        val themedContext = ContextThemeWrapper(context, R.style.Theme_Promotor_Feature)
        binding = WindowAccessibilityServiceWarningBinding.inflate(
            LayoutInflater.from(themedContext),
            this,
            true
        )
        binding.cardGo.setOnClickListener {
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(true)
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("任务暂停中，点击恢复")
            AIFloatWindowManager.getExecuteTaskWindow()?.setPauseTaskStatus()
            dismiss()
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
        // 注册到管理器
        AIFloatWindowManager.registerAccessibilityServiceWarning(this)
    }

    private val layoutParamsForShow: WindowManager.LayoutParams by lazy {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            // 可点击但不获取焦点
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_INSET_DECOR,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            x = 0
            y = 0
        }
    }

    @Synchronized
    fun show() {
        if (!isShowing) {
            try {
                MessageController.pauseTask()
                windowManager.addView(this, layoutParamsForShow)
                isShowing = true
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    @Synchronized
    fun dismiss() {
        if (isAttachedToWindow) {
            try {
                windowManager.removeView(this)
                isShowing = false
            } catch (e: Exception) {
                e.printStackTrace()
            }
            isShowing = false
        }
    }
}