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
 */
class ClickFeedbackView(context: Context) : FrameLayout(context), ClickFeedbackProvider {

    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager


    private val hideIndicatorRunnable = Runnable {
        hideClickIndicator()
    }

    private val logger: Logger = AndroidLogger()
    private val mainHandler = Handler(Looper.getMainLooper())

    private val indicatorView: View


    private val layoutParams: WindowManager.LayoutParams by lazy {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,

            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = 0
        }
    }

    init {

        indicatorView = View(context).apply {
            setBackgroundResource(R.drawable.circle_shape)
            layoutParams = LayoutParams(
                resources.getDimensionPixelSize(R.dimen.click_indicator_size),
                resources.getDimensionPixelSize(R.dimen.click_indicator_size)
            )
            visibility = GONE
        }
        addView(indicatorView)
    }

    /**
     */
    override fun showClickIndicator(x: Float, y: Float, durationMillis: Long) {

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
                return
            }
        } else {

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

        indicatorView.visibility = VISIBLE
        mainHandler.removeCallbacks(hideIndicatorRunnable)
        mainHandler.postDelayed(hideIndicatorRunnable, durationMillis)
        logger.debug(
            "ClickFeedbackView",
            "Showing click indicator at ($x, $y) for ${durationMillis}ms."
        )
    }

    /**
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
        indicatorView.visibility = GONE
        mainHandler.removeCallbacks(hideIndicatorRunnable)
    }

    /**
     */
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        hideClickIndicator()
        logger.debug("ClickFeedbackView", "ClickFeedbackView detached from window.")
    }
}