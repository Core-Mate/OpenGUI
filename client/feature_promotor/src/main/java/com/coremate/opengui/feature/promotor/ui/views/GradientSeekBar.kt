package com.coremate.opengui.feature.promotor.ui.views

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.roundToInt

class GradientSeekBar @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {


    private val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val thumbPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        setShadowLayer(5f, 0f, 0f, Color.BLACK)
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        textSize = dpToPx(14f)
        textAlign = Paint.Align.CENTER
    }


    private var minProgress = 0
    private var maxProgress = 30
    private var currentProgress = 15


    private val gradientColors = intArrayOf(
        Color.parseColor("#9E86FF"),
        Color.parseColor("#4042E7"),
        Color.parseColor("#234BD6")
    )
    private val barHeight = dpToPx(5f)
    private val thumbRadius = dpToPx(10f)
    private val textYOffset = dpToPx(8f)
    private val desiredHeight = dpToPx(47f)
    private val textGap = dpToPx(15f)


    private lateinit var gradient: LinearGradient

    init {

        setLayerType(LAYER_TYPE_SOFTWARE, null)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val measuredWidth = getDefaultSize(suggestedMinimumWidth, widthMeasureSpec)
        val heightMode = MeasureSpec.getMode(heightMeasureSpec)
        val heightSize = MeasureSpec.getSize(heightMeasureSpec)
        val targetHeight = when (heightMode) {
            MeasureSpec.EXACTLY -> heightSize
            else -> desiredHeight.roundToInt()
        }
        setMeasuredDimension(measuredWidth, targetHeight)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)

        val trackLeft = paddingLeft.toFloat() + thumbRadius
        val trackRight = (width - paddingRight).toFloat() - thumbRadius
        gradient = LinearGradient(
            trackLeft, 0f, trackRight, 0f,
            gradientColors,
            null,
            Shader.TileMode.CLAMP
        )
        progressPaint.shader = gradient

        thumbPaint.shader = gradient
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val barY = computeBarY()
        val trackLeft = paddingLeft.toFloat() + thumbRadius
        val trackRight = (width - paddingRight).toFloat() - thumbRadius
        val trackWidth = (trackRight - trackLeft).coerceAtLeast(1f)


        canvas.drawRoundRect(
            trackLeft, barY - barHeight / 2,
            trackRight, barY + barHeight / 2,
            barHeight / 2, barHeight / 2,
            progressPaint
        )


        val thumbX = trackLeft + (currentProgress - minProgress).toFloat() / (maxProgress - minProgress) * trackWidth
        canvas.drawCircle(thumbX, barY, thumbRadius, thumbPaint)


        val fm = textPaint.fontMetrics
        val bottomPadding = dpToPx(2f)
        val textBaseline = height.toFloat() - bottomPadding - fm.bottom


        textPaint.textAlign = Paint.Align.CENTER
        canvas.drawText(currentProgress.toString(), thumbX, textBaseline, textPaint)


        if (currentProgress != minProgress) {
            textPaint.textAlign = Paint.Align.LEFT
            canvas.drawText(minProgress.toString(), paddingLeft.toFloat(), textBaseline, textPaint)
        }


        if (currentProgress != maxProgress) {
            textPaint.textAlign = Paint.Align.RIGHT
            canvas.drawText(maxProgress.toString(), (width - paddingRight).toFloat(), textBaseline, textPaint)
        }
    }

    private fun computeBarY(): Float {
        val fm = textPaint.fontMetrics
        val bottomPadding = dpToPx(2f)
        val textHeight = fm.bottom - fm.top
        val textTop = height.toFloat() - bottomPadding - textHeight
        val maxBarCenter = textTop - textGap - thumbRadius
        val minBarCenter = thumbRadius + dpToPx(2f)
        return maxBarCenter.coerceAtLeast(minBarCenter)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val x = event.x
        val y = event.y


        val barY = computeBarY()
        if (y > barY - thumbRadius * 2 && y < barY + thumbRadius * 2) {
            val trackLeft = paddingLeft.toFloat() + thumbRadius
            val trackRight = (width - paddingRight).toFloat() - thumbRadius
            val trackWidth = (trackRight - trackLeft).coerceAtLeast(1f)
            val clampedX = x.coerceIn(trackLeft, trackRight)
            val newProgress = (clampedX - trackLeft) / trackWidth * (maxProgress - minProgress) + minProgress


            currentProgress = when {
                newProgress < minProgress -> minProgress
                newProgress > maxProgress -> maxProgress
                else -> newProgress.roundToInt()
            }


            invalidate()
            return true
        }
        return super.onTouchEvent(event)
    }

    /**
     * Helper method to convert dp to px
     */
    private fun dpToPx(dp: Float): Float {
        return dp * resources.displayMetrics.density
    }


    fun setProgress(progress: Int) {
        if (progress in minProgress..maxProgress) {
            this.currentProgress = progress
            invalidate()
        }
    }
}