package com.coremate.opengui.feature.promotor.ui.widget

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.AttributeSet
import android.view.MotionEvent
import androidx.appcompat.widget.AppCompatSeekBar
import kotlin.math.max
import kotlin.math.min

/**
 * SeekBar that shows the current value in a bubble above the thumb while dragging.
 */
class ValueSeekBar @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = android.R.attr.seekBarStyle
) : AppCompatSeekBar(context, attrs, defStyleAttr) {

    private val bubbleBackgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#E6000000")
        style = Paint.Style.FILL
    }
    private val bubbleTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = dp(12f)
    }

    private val bubbleRect = RectF()
    private val bubblePath = Path()

    private val bubbleCornerRadius = dp(10f)
    private val bubblePaddingH = dp(10f)
    private val bubblePaddingV = dp(6f)
    private val triangleHeight = dp(6f)
    private val triangleWidth = dp(10f)

    private var isUserSeeking: Boolean = false
    var showOnlyWhileTouching: Boolean = false

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        if (!showOnlyWhileTouching || isUserSeeking) {
            drawValueBubble(canvas)
        }
    }

    private fun drawValueBubble(canvas: Canvas) {
        val progressRatio = if (max > 0) progress.toFloat() / max.toFloat() else 0f

        val availableWidth = width - paddingLeft - paddingRight
        val thumbCenterX = paddingLeft + availableWidth * progressRatio

        val valueText = progress.toString()
        val textWidth = bubbleTextPaint.measureText(valueText)
        val textHeight = bubbleTextPaint.fontMetrics.let { it.bottom - it.top }

        val bubbleWidth = max(textWidth + bubblePaddingH * 2, dp(32f))
        val bubbleHeight = max(textHeight + bubblePaddingV * 2, dp(22f))

        val bubbleLeft = min(
            max(thumbCenterX - bubbleWidth / 2f, paddingLeft.toFloat()),
            (width - paddingRight).toFloat() - bubbleWidth
        )
        val bubbleTop = paddingTop.toFloat() - bubbleHeight - triangleHeight - dp(4f)
        val bubbleRight = bubbleLeft + bubbleWidth
        val bubbleBottom = bubbleTop + bubbleHeight

        bubbleRect.set(bubbleLeft, bubbleTop, bubbleRight, bubbleBottom)

        bubblePath.reset()
        bubblePath.addRoundRect(bubbleRect, bubbleCornerRadius, bubbleCornerRadius, Path.Direction.CW)

        val triangleCenterX = thumbCenterX
        val triangleTopY = bubbleBottom
        bubblePath.moveTo(triangleCenterX, triangleTopY + triangleHeight)
        bubblePath.lineTo(triangleCenterX - triangleWidth / 2f, triangleTopY)
        bubblePath.lineTo(triangleCenterX + triangleWidth / 2f, triangleTopY)
        bubblePath.close()

        canvas.drawPath(bubblePath, bubbleBackgroundPaint)

        val textCenterX = bubbleRect.centerX()
        val textCenterY = bubbleRect.centerY() - (bubbleTextPaint.fontMetrics.ascent + bubbleTextPaint.fontMetrics.descent) / 2
        canvas.drawText(valueText, textCenterX, textCenterY, bubbleTextPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                isUserSeeking = true
                parent?.requestDisallowInterceptTouchEvent(true)
                invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
                invalidate()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                isUserSeeking = false
                parent?.requestDisallowInterceptTouchEvent(false)
                invalidate()
            }
        }
        return super.onTouchEvent(event)
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density
}


