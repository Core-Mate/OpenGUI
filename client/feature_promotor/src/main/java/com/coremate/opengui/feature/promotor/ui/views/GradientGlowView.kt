package com.coremate.opengui.feature.promotor.ui.views

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator

class GradientGlowView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var gradientOffset = 0f

    private val animator = ValueAnimator.ofFloat(0f, 2f).apply {
        duration = 4000
        repeatCount = ValueAnimator.INFINITE
        repeatMode = ValueAnimator.RESTART
        interpolator = AccelerateDecelerateInterpolator()
        addUpdateListener {
            gradientOffset = it.animatedValue as Float
            invalidate()
        }
    }

    init {
        setLayerType(LAYER_TYPE_SOFTWARE, null)
        alpha = 0.5f // 整体透明度 50%
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val w = width.toFloat()
        val h = height.toFloat()

        // 根据动画偏移创建渐变
        val positions = floatArrayOf(0f, 0.33f, 0.66f, 1f)
        val colors = intArrayOf(
            Color.parseColor("#3B82F6"),
            Color.parseColor("#8B5CF6"),
            Color.parseColor("#06B6D4"),
            Color.parseColor("#3B82F6")
        )

        // 动态改变渐变角度，模拟 CSS gradient-shift 动画
        val angle = 135f + (gradientOffset * 90f) // 从 135° 到 315°
        val radians = Math.toRadians(angle.toDouble())

        val startX = w / 2 + (w / 2 * Math.cos(radians)).toFloat()
        val startY = h / 2 + (h / 2 * Math.sin(radians)).toFloat()
        val endX = w / 2 - (w / 2 * Math.cos(radians)).toFloat()
        val endY = h / 2 - (h / 2 * Math.sin(radians)).toFloat()

        val gradient = LinearGradient(
            startX, startY, endX, endY,
            colors, positions,
            Shader.TileMode.CLAMP
        )

        paint.shader = gradient
        paint.maskFilter = BlurMaskFilter(40f, BlurMaskFilter.Blur.NORMAL)

        canvas.drawRoundRect(
            0f, 0f, w, h,
            16.dpToPx(), 16.dpToPx(),
            paint
        )
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        animator.start()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator.cancel()
    }

    private fun Int.dpToPx(): Float {
        return this * resources.displayMetrics.density
    }
}