package com.coremate.opengui.feature.promotor.ui.window

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.text.TextUtils
import android.util.Log
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.WindowManager
import android.widget.FrameLayout
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.common.MessageController
import com.coremate.opengui.common.utils.HapticFeedbackHelper
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.databinding.WindowSlideExpandBinding
import com.coremate.opengui.feature.promotor.ui.AIFloatWindowManager

class SlideExpandWindow(context: Context) : FrameLayout(context) {
    private val binding: WindowSlideExpandBinding
    private val TAG: String = "SlideExpandWindow"
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    @Volatile
    var isShowing = false


    init {
        val themedContext = ContextThemeWrapper(context, R.style.Theme_Promotor_Feature)
        binding = WindowSlideExpandBinding.inflate(LayoutInflater.from(themedContext), this, true)
        // 注册到管理器
        AIFloatWindowManager.registerSlideExpandWindow(this)
        binding.slideExpandRoot.setOnClickListener {
            HapticFeedbackHelper.lightTap(context)
            dismiss("点击灵动岛")
            AIFloatWindowManager.getExecuteTaskWindow()?.reset("$TAG    init")
            AIFloatWindowManager.showExecuteTaskWindow("点击灵动岛")
            LogManager.saveLog(
                context, "SlideExpandWindow", "cardResume click }",
                TaskCenter.executionId ?: -1
            )
        }
        binding.tvContent.isSelected = true
    }

    @Synchronized
    fun show(from: String) {
        try {
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | 灵动岛 显示 | from = $from | isShowing = $isShowing | currentTaskState = ${TaskCenter.currentTaskState}",
                TaskCenter.executionId ?: -1
            )
            if (!isShowing && TaskCenter.currentTaskState == TaskCenter.TaskState.EXECUTE && (AIFloatWindowManager.getCallUserWindow()?.isShowing != true) && (AIFloatWindowManager.getAccessibilityServiceWarningWindow()?.isShowing != true)) {
                windowManager.addView(this, layoutParamsForShow)
                isShowing = true
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @Synchronized
    fun dismiss(from: String) {
        try {
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | 灵动岛 隐藏 | from = $from | isShowing = $isShowing",
                TaskCenter.executionId ?: -1
            )
            if (isShowing) {
                windowManager.removeView(this)
                isShowing = false
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun updateContent(content: String) {
        try {
            LogManager.saveLog(
                context,
                "SlideExpandWindow",
                "SlideExpandWindow | updateContent | content = $content",
                TaskCenter.executionId ?: -1
            )

            if (!isAttachedToWindow && MessageController.getBackgroundStatus() && (AIFloatWindowManager.getCallUserWindow()?.isShowing != true) && (AIFloatWindowManager.getAccessibilityServiceWarningWindow()?.isShowing != true) && (AIFloatWindowManager.getExecuteTaskWindow()?.isShowing != true)) {
                show("updateContent")
            }
            if (!TextUtils.isEmpty(content)) {
                if (!TextUtils.isEmpty(content)) {
                    binding.tvContent.text = content.replace("\n", "")
                }
            } else {
                binding.tvContent.text = ""
            }
        } catch (e: Exception) {
            LogManager.saveLog(
                context,
                "SlideExpandWindow",
                "SlideExpandWindow | updateContent | error: ${e.message}",
                TaskCenter.executionId ?: -1
            )
            Log.e("SlideExpandWindow", "updateContent error", e)
        }
    }

    fun updateBackground(isPause: Boolean) {
        if (isPause) {
            binding.slideExpandRoot.setBackgroundResource(R.drawable.bg_dynamic_island_pause)
        } else {
            binding.slideExpandRoot.setBackgroundResource(R.drawable.bg_dynamic_island_playing)
        }
    }

    private val layoutParamsForShow: WindowManager.LayoutParams by lazy {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        // 计算状态栏高度
        val statusBarHeight = run {
            val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
            if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
        }

        // 可点击但不获取焦点，移除会跨越状态栏区域的 NO_LIMITS / IN_SCREEN 等 flag
        WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            // 可点击但不获取焦点；overlay 上 FLAG_KEEP_SCREEN_ON 可能被系统忽略，需配合 WakeLock 使用
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_LAYOUT_INSET_DECOR,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP
            x = 0
            // 初始位置在状态栏正下方，如需再往下可在此基础上加额外偏移
            y = statusBarHeight / 2
        }
    }
}