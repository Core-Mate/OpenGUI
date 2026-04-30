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
        strokeWidth = 6f.dpToPx(context)
        isDither = true
    }

    private var colors = intArrayOf(
        "#00FFFFFF".toColorInt(),
        "#FF33B5E5".toColorInt(),
        "#00FFFFFF".toColorInt()
    )


    private var positions = floatArrayOf(0f, 0.5f, 1f)


    private var offset = 0f


    private val path = Path()


    private val lightRect = RectF()


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


        lightRect.set(
            paddingLeft.toFloat() + lightPaint.strokeWidth / 2,
            paddingTop.toFloat() + lightPaint.strokeWidth / 2,
            (width - paddingRight).toFloat() - lightPaint.strokeWidth / 2,
            (height - paddingBottom).toFloat() - lightPaint.strokeWidth / 2
        )


        if (lightRect.width() <= 0 || lightRect.height() <= 0) return


        val cornerRadius = 18f.dpToPx(context)
        path.reset()
        path.addRoundRect(lightRect, cornerRadius, cornerRadius, Path.Direction.CW)



        val gradientWidth = lightRect.width() * 0.5f
        val startX = lightRect.left + gradientWidth * offset
        val endX = startX + gradientWidth

        val shader = LinearGradient(
            startX, lightRect.top,
            endX, lightRect.top,
            colors,
            positions,
            Shader.TileMode.CLAMP
        )
        lightPaint.shader = shader


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