package com.coremate.opengui.feature.promotor.ui.views

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.widget.LinearLayout
import androidx.core.graphics.toColorInt

class FlowLightLinearLayout @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : LinearLayout(context, attrs, defStyleAttr) {

    private val lightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 6f.dpToPx(context)  // 宽度
        isDither = true
    }

    private var colors = intArrayOf(
        "#00FFFFFF".toColorInt(),
        "#FF33B5E5".toColorInt(),
        "#00FFFFFF".toColorInt()
    )

    // 渐变位置
    private var positions = floatArrayOf(0f, 0.5f, 1f)

    // 动画偏移
    private var offset = 0f

    // 光晕路径
    private val path = Path()

    // 光晕矩形区域
    private val lightRect = RectF()

    // 动画
    private val animator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 1500
        repeatCount = ValueAnimator.INFINITE
        repeatMode = ValueAnimator.REVERSE
        addUpdateListener {
            offset = it.animatedValue as Float
            invalidate()
        }
    }

    init {
        setWillNotDraw(false)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // 计算可用区域  去除内边距，因为光晕通常画在边缘
        lightRect.set(
            paddingLeft.toFloat() + lightPaint.strokeWidth / 2,
            paddingTop.toFloat() + lightPaint.strokeWidth / 2,
            (width - paddingRight).toFloat() - lightPaint.strokeWidth / 2,
            (height - paddingBottom).toFloat() - lightPaint.strokeWidth / 2
        )

        // 区域太小则不绘制
        if (lightRect.width() <= 0 || lightRect.height() <= 0) return

        // 构建圆角矩形路径
        val cornerRadius = 18f.dpToPx(context)
        path.reset()
        path.addRoundRect(lightRect, cornerRadius, cornerRadius, Path.Direction.CW)

        // 线性渐变着色器，方向从左到右，偏移量由 offset 控制
        // 为了让光晕流动，让渐变区间在矩形上平移
        val gradientWidth = lightRect.width() * 0.5f
        val startX = lightRect.left + gradientWidth * offset
        val endX = startX + gradientWidth

        val shader = LinearGradient(
            startX, lightRect.top,
            endX, lightRect.top, // 水平方向渐变
            colors,
            positions,
            Shader.TileMode.CLAMP
        )
        lightPaint.shader = shader

        // 绘制边框路径
        canvas.drawPath(path, lightPaint)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        animator.start()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator.cancel()
    }

    private fun Float.dpToPx(context: Context): Float {
        return this * context.resources.displayMetrics.density
    }
}