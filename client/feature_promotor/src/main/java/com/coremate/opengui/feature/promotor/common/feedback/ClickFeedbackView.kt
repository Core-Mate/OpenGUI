package com.coremate.opengui.feature.promotor.common.feedback

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import com.coremate.opengui.accessibility.feedback.ClickFeedbackProvider
import com.coremate.opengui.common.utils.AndroidLogger
import com.coremate.opengui.common_jvm.utils.Logger
import com.coremate.opengui.feature.promotor.R

/**
 * 一个独立的悬浮视图，用于显示点击反馈（例如红圈）。
 * 它应该始终是触摸穿透的。
 */
class ClickFeedbackView(context: Context) : FrameLayout(context), ClickFeedbackProvider {

    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    // 用于隐藏点击指示器的 Runnable
    private val hideIndicatorRunnable = Runnable {
        hideClickIndicator()
    }

    private val logger: Logger = AndroidLogger()
    private val mainHandler = Handler(Looper.getMainLooper())

    private val indicatorView: View // 点击指示器实际的 View

    // LayoutParams 始终是触摸穿透且不获取焦点
    private val layoutParams: WindowManager.LayoutParams by lazy {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, // 宽度自适应红圈大小
            WindowManager.LayoutParams.WRAP_CONTENT, // 高度自适应红圈大小
            type,
            // 始终穿透，不获取焦点，不拦截触摸
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or // 使用 NOT_TOUCHABLE 确保完全穿透
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT // 透明背景
        ).apply {
            gravity = Gravity.TOP or Gravity.START // 初始位置（后面会动态更新）
            x = 0
            y = 0
        }
    }

    init {
        // 创建点击指示器视图
        indicatorView = View(context).apply {
            setBackgroundResource(R.drawable.circle_shape) // 使用您之前定义的圆形 drawable
            layoutParams = LayoutParams(
                resources.getDimensionPixelSize(R.dimen.click_indicator_size), // 定义一个 dimen 值，例如 24dp
                resources.getDimensionPixelSize(R.dimen.click_indicator_size)
            )
            visibility = GONE // 默认隐藏
        }
        addView(indicatorView) // 将指示器添加到 FrameLayout 自身
    }

    /**
     * 实现 ClickFeedbackProvider 接口的 showClickIndicator 方法。
     * 显示点击指示器在指定坐标。
     * @param x 屏幕X坐标。
     * @param y 屏幕Y坐标。
     * @param durationMillis 指示器显示持续时间（毫秒）。
     */
    override fun showClickIndicator(x: Float, y: Float, durationMillis: Long) {
        // 更新 LayoutParams 的位置，使指示器中心对齐点击点
        layoutParams.x = (x - indicatorView.width / 2).toInt()
        layoutParams.y = (y - indicatorView.height / 2).toInt()

        if (!isAttachedToWindow) {
            try {
                windowManager.addView(this, layoutParams)
                logger.info("ClickFeedbackView", "Click indicator window added.")
            } catch (e: Exception) {
                logger.error(
                    "ClickFeedbackView",
                    "Failed to add click indicator window: ${e.message}",
                    e
                )
                return // 如果添加失败，则不继续显示逻辑
            }
        } else {
            // 如果窗口已存在，更新其位置
            try {
                windowManager.updateViewLayout(this, layoutParams)
            } catch (e: Exception) {
                logger.error(
                    "ClickFeedbackView",
                    "Failed to update click indicator window layout: ${e.message}",
                    e
                )
                return
            }
        }

        indicatorView.visibility = VISIBLE // 显示指示器
        mainHandler.removeCallbacks(hideIndicatorRunnable)
        mainHandler.postDelayed(hideIndicatorRunnable, durationMillis)
        logger.debug(
            "ClickFeedbackView",
            "Showing click indicator at ($x, $y) for ${durationMillis}ms."
        )
    }

    /**
     * 实现 ClickFeedbackProvider 接口的 hideClickIndicator 方法。
     * 隐藏点击指示器并从窗口管理器中移除。
     */
    override fun hideClickIndicator() {
        if (isAttachedToWindow) {
            try {
                windowManager.removeView(this)
                logger.info("ClickFeedbackView", "Click indicator window removed.")
            } catch (e: Exception) {
                logger.error(
                    "ClickFeedbackView",
                    "Failed to remove click indicator window: ${e.message}",
                    e
                )
            }
        }
        indicatorView.visibility = GONE // 确保视图本身也隐藏
        mainHandler.removeCallbacks(hideIndicatorRunnable) // 清除待处理的隐藏任务
    }

    /**
     * 在销毁时调用，确保悬浮窗被移除。
     */
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        hideClickIndicator() // 确保在视图从窗口管理器中分离时隐藏
        logger.debug("ClickFeedbackView", "ClickFeedbackView detached from window.")
    }
}