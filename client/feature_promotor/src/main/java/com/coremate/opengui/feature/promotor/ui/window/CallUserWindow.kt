package com.coremate.opengui.feature.promotor.ui.window

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.WindowManager
import android.widget.FrameLayout
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.common.MessageController
import com.coremate.opengui.common.utils.HapticFeedbackHelper
import com.coremate.opengui.feature.promotor.databinding.WindowCallUserBinding
import com.coremate.opengui.feature.promotor.ui.AIFloatWindowManager

class CallUserWindow(context: Context) : FrameLayout(context) {
    private val binding: WindowCallUserBinding
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    @Volatile
    var isShowing = false

    init {
        val themedContext = ContextThemeWrapper(context, R.style.Theme_Promotor_Feature)
        binding = WindowCallUserBinding.inflate(LayoutInflater.from(themedContext), this, true)
        binding.btTakeOver.setOnClickListener {
            HapticFeedbackHelper.click(context)
            LogManager.saveLog(context,"CallUserWindow","btTakeOver click ", TaskCenter.executionId?:-1)
            dismiss()
            AIFloatWindowManager.showSlideExpandWindow(false,"点击接管按钮，显示灵动岛")
        }
        binding.btStop.setOnClickListener {
            HapticFeedbackHelper.confirm(context)
            LogManager.saveLog(context,"CallUserWindow","btStop click }", TaskCenter.executionId?:-1)
            dismiss()
            MessageController.cancelAndGotoSummarizer()
        }
        // 注册到管理器
        AIFloatWindowManager.registerCallUserWindow(this)
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
    fun show(message: String?) {
        if (!isShowing) {
            binding.tvTitle.text = TaskCenter.taskTitle
            binding.tvMessage.text = message ?: "需要接管"
            windowManager.addView(this, layoutParamsForShow)
            isShowing = true
            AIFloatWindowManager.getExecuteTaskWindow()?.setPauseTaskStatus()
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(true)
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("任务已暂停，点击恢复")
        }
    }

    @Synchronized
    fun dismiss() {
        if (isShowing) {
            try {
                windowManager.removeView(this)
                isShowing = false
            } catch (_: Exception) {
            }
        }
    }
}