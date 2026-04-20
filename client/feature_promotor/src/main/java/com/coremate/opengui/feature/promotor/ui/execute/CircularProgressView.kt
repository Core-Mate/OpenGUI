package com.coremate.opengui.feature.promotor.ui.execute

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.view.animation.DecelerateInterpolator
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import kotlin.math.PI

/**
 * 与 Web ExecutionOverlay SVG 一致：
 * 1. 外圈旋转光弧（exec-orbit）：dash 约 1/4 圆，渐变透明蓝→紫 0.35→透明蓝，3s 旋转一圈
 * 2. 背景灰环：#E5E7EB stroke-width 5 opacity 0.5
 * 3. 进度弧：linearGradient #2E58FF→#6366F1，stroke-width 5，stroke-linecap round，从顶部顺时针
 */
class CircularProgressView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val orbitPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val rectF = RectF()

    /** 旋转光弧当前角度（度） */
    private var orbitRotation = 0f
    private var orbitAnimator: ValueAnimator? = null
    private var progressAnimator: ValueAnimator? = null

    /** 实际绘制用的进度值（动画驱动） */
    private var displayProgress: Float = 0f

    var progress: Float = 0f
        set(value) {
            val target = value.coerceIn(0f, 100f)
            if (target == field) return
            field = target
            animateProgress(target)
        }

    /** 进度动画结束回调 */
    var onProgressAnimationEnd: (() -> Unit)? = null

    private fun animateProgress(target: Float) {
        progressAnimator?.cancel()
        progressAnimator = ValueAnimator.ofFloat(displayProgress, target).apply {
            duration = 500
            interpolator = DecelerateInterpolator()
            addUpdateListener {
                displayProgress = it.animatedValue as Float
                invalidate()
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    onProgressAnimationEnd?.invoke()
                }
            })
            start()
        }
    }

    var isComplete: Boolean = false
        set(value) {
            field = value
            if (value) stopOrbitAnimation()
            invalidate()
        }

    private val sizePx: Float
        get() = width.coerceAtMost(height).toFloat()

    /** 与 Web 一致：100px 下 r=47.5, stroke 5 → 比例 r = (size - 5) / 2 */
    private val strokeWidthProgress: Float
        get() = 5f * resources.displayMetrics.density

    private val strokeWidthOrbit: Float
        get() = 7f * resources.displayMetrics.density

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        startOrbitAnimation()
    }

    override fun onDetachedFromWindow() {
        stopOrbitAnimation()
        progressAnimator?.cancel()
        progressAnimator = null
        super.onDetachedFromWindow()
    }

    private fun startOrbitAnimation() {
        if (orbitAnimator?.isRunning == true || isComplete) return
        orbitAnimator = ValueAnimator.ofFloat(0f, 360f).apply {
            duration = 3000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            addUpdateListener {
                orbitRotation = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun stopOrbitAnimation() {
        orbitAnimator?.cancel()
        orbitAnimator = null
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val size = sizePx
        if (size <= 0f) return
        val cx = width / 2f
        val cy = height / 2f
        val r = (size - strokeWidthProgress) / 2f
        rectF.set(cx - r, cy - r, cx + r, cy + r)
        val circumference = (2 * PI * r).toFloat()

        // 1. 外圈旋转光弧（未完成时）：stroke-width 7, dasharray ≈ 1/4 圆
        if (!isComplete) {
            orbitPaint.strokeWidth = strokeWidthOrbit
            orbitPaint.shader = LinearGradient(
                rectF.left, cy,
                rectF.right, cy,
                intArrayOf(
                    0x002E58FF.toInt(),
                    0x596366F1.toInt(),
                    0x002E58FF.toInt()
                ),
                floatArrayOf(0f, 0.5f, 1f),
                Shader.TileMode.CLAMP
            )
            orbitPaint.pathEffect = DashPathEffect(
                floatArrayOf(circumference / 4f, circumference * 3f / 4f),
                0f
            )
            canvas.save()
            canvas.rotate(orbitRotation, cx, cy)
            canvas.drawCircle(cx, cy, r, orbitPaint)
            canvas.restore()
            orbitPaint.pathEffect = null
        }

        // 2. 背景灰环：#E5E7EB stroke-width 5 opacity 0.5
        bgPaint.color = 0x80E5E7EB.toInt()
        bgPaint.strokeWidth = strokeWidthProgress
        canvas.drawCircle(cx, cy, r, bgPaint)

        // 3. 进度弧：从 -90°（顶部）顺时针，stroke-linecap round
        val sweep = 360f * (displayProgress / 100f)
        if (sweep > 0f) {
            progressPaint.strokeWidth = strokeWidthProgress
            // 渐变：progressGradient (#2E58FF → #6366F1) 或 completeGradient (#4ade80 → #10b981)
            progressPaint.shader = if (isComplete) {
                LinearGradient(
                    rectF.left, cy,
                    rectF.right, cy,
                    0xFF4ADE80.toInt(),
                    0xFF10B981.toInt(),
                    Shader.TileMode.CLAMP
                )
            } else {
                LinearGradient(
                    rectF.left, cy,
                    rectF.right, cy,
                    0xFF2E58FF.toInt(),
                    0xFF6366F1.toInt(),
                    Shader.TileMode.CLAMP
                )
            }
            canvas.drawArc(rectF, -90f, sweep, false, progressPaint)
        }
    }
}
