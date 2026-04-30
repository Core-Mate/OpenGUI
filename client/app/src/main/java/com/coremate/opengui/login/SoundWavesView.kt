package com.coremate.opengui.login

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.AttributeSet
import com.coremate.opengui.R
import android.util.TypedValue
import android.view.View
import java.util.*
import kotlin.math.roundToInt

class SoundWavesView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {
    companion object {
        private const val DEFAULT_CYLINDER_COUNT = 36
        private const val DEFAULT_CYLINDER_WIDTH_DP = 3f
        private const val DEFAULT_COLOR = Color.WHITE
        private const val REFRESH_INTERVAL_MS = 200L
    }

    private var cylinderCount = DEFAULT_CYLINDER_COUNT
    private var cylinderWidthPx = dpToPx(DEFAULT_CYLINDER_WIDTH_DP)
    private val cylinderHeightsPx = IntArray(cylinderCount)
    private val cylinderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = DEFAULT_COLOR
    }
    private val random = Random()
    private var isAnimating = false
    private val refreshRunnable = object : Runnable {
        override fun run() {
            if (isAnimating) {
                generateRandomHeights()
                invalidate()
                postDelayed(this, REFRESH_INTERVAL_MS)
            }
        }
    }

    init {
        context.obtainStyledAttributes(attrs, R.styleable.SoundWavesView).apply {
            cylinderCount = getInt(R.styleable.SoundWavesView_cylinderCount, DEFAULT_CYLINDER_COUNT)
            cylinderWidthPx = getDimensionPixelSize(
                R.styleable.SoundWavesView_cylinderWidth,
                dpToPx(DEFAULT_CYLINDER_WIDTH_DP)
            )
            cylinderPaint.color = getColor(R.styleable.SoundWavesView_cylinderColor, DEFAULT_COLOR)
            recycle()
        }
        generateRandomHeights()
    }

    private fun dpToPx(dp: Float): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp,
            resources.displayMetrics
        ).roundToInt()
    }

    private fun generateRandomHeights() {
        val minHeightPx = dpToPx(4f)
        val maxHeightPx = dpToPx(20f)

        for (i in 0 until cylinderCount) {
            cylinderHeightsPx[i] = minHeightPx + random.nextInt(maxHeightPx - minHeightPx + 1)
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val width = width.toFloat()
        val height = height.toFloat()
        val centerY = height / 2f


        val totalCylindersWidth = cylinderCount * cylinderWidthPx
        val padding = (dpToPx(256f) - totalCylindersWidth) / (cylinderCount + 1)


        for (i in 0 until cylinderCount) {
            val left = (padding + i * (cylinderWidthPx + padding)).toFloat()
            val right = left + cylinderWidthPx
            val halfHeight = cylinderHeightsPx[i] / 2f
            val radius = cylinderWidthPx / 2f


            val top = centerY - halfHeight
            val bottom = centerY + halfHeight


            Path().apply {

                moveTo(left, top + radius)
                arcTo(RectF(left, top, right, top + 2 * radius), 180f, 180f)


                lineTo(right, bottom - radius)


                arcTo(RectF(left, bottom - 2 * radius, right, bottom), 0f, 180f)


                lineTo(left, top + radius)

                canvas.drawPath(this, cylinderPaint)
            }
        }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val minHeight = dpToPx(20f) + dpToPx(40f)
        val height = resolveSize(minHeight, heightMeasureSpec)
        setMeasuredDimension(widthMeasureSpec, height)
    }

    public fun startAnimation() {
        if (!isAnimating) {
            isAnimating = true
            post(refreshRunnable)
        }
    }

    fun stopAnimation() {
        isAnimating = false
        removeCallbacks(refreshRunnable)
    }

    fun setCylinderColor(color: Int) {
        cylinderPaint.color = color
        invalidate()
    }

    fun getCylinderCount() = cylinderCount

    fun setCylinderCount(count: Int) {
        cylinderCount = count
        generateRandomHeights()
        requestLayout()
        invalidate()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopAnimation()
    }
}