package com.coremate.opengui.feature.promotor.ui.views

import android.animation.ArgbEvaluator
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.util.AttributeSet
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator

class CustomSwitch @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {


    private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val thumbPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        setShadowLayer(dpToPx(2f), 0f, dpToPx(1f), Color.parseColor("#40000000")) // Light gray shadow.
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = dpToPx(18f)
        textAlign = Paint.Align.CENTER
    }


    private val cornerRadius = dpToPx(20f)
    private val thumbRadius = dpToPx(10f)
    private val padding = dpToPx(2f)


    private var isChecked = false
    private var thumbXOffset = 0f
    private var targetThumbXOffset = 0f


    private val onBgColor = Color.parseColor("#673AB7") // On-state background color, dark purple.
    private val offBgColor = Color.parseColor("#E0E0E0") // Off-state background color, light gray.
    private val onTextColor = Color.WHITE
    private val offTextColor = Color.GRAY





    private var onCheckedChangeListener: ((Boolean) -> Unit)? = null


    private val gestureDetector: GestureDetector

    init {

        setLayerType(LAYER_TYPE_SOFTWARE, null)


        gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent): Boolean {
                return true
            }
            override fun onSingleTapUp(e: MotionEvent): Boolean {
                performClick()
                toggle()
                return true
            }
        })
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val desiredWidth = dpToPx(52f).toInt()
        val desiredHeight = dpToPx(28f).toInt()

        setMeasuredDimension(
            resolveSize(desiredWidth, widthMeasureSpec),
            resolveSize(desiredHeight, heightMeasureSpec)
        )
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)

        val actualHeight = h.toFloat()




        targetThumbXOffset = if (isChecked) getThumbMaxOffset() else getThumbMinOffset()
        thumbXOffset = targetThumbXOffset
    }

    private fun getThumbMinOffset(): Float {
        return padding + thumbRadius
    }

    private fun getThumbMaxOffset(): Float {
        return width - padding - thumbRadius
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val actualHeight = height.toFloat()
        val bgRect = RectF(0f, 0f, width.toFloat(), actualHeight)


        val currentBgColor = (ArgbEvaluator().evaluate(
            thumbXOffset / getThumbMaxOffset(),
            offBgColor,
            onBgColor
        ) as Int)
        backgroundPaint.color = currentBgColor
        canvas.drawRoundRect(bgRect, cornerRadius, cornerRadius, backgroundPaint)


        val currentTextColor = (ArgbEvaluator().evaluate(
            thumbXOffset / getThumbMaxOffset(),
            offTextColor,
            onTextColor
        ) as Int)
        textPaint.color = currentTextColor

        val textBounds = Rect()
//        val text = if (isChecked) "Yes" else "No"
        val text = if (isChecked) "" else ""
        textPaint.getTextBounds(text, 0, text.length, textBounds)


        if (isChecked) { // "Yes" text on the left.
            val textX = (getThumbMinOffset() + thumbXOffset - thumbRadius) / 2
            canvas.drawText(text, textX, actualHeight / 2 + textBounds.height() / 2, textPaint)
        } else { // "No" text on the right.
            val textX = (getThumbMaxOffset() + thumbXOffset + thumbRadius) / 2
            canvas.drawText(text, textX, actualHeight / 2 + textBounds.height() / 2, textPaint)
        }


        canvas.drawCircle(thumbXOffset, actualHeight / 2, thumbRadius, thumbPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {

        gestureDetector.onTouchEvent(event)
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    fun toggle() {
        setChecked(!isChecked)
    }

    fun setChecked(checked: Boolean) {
        if (this.isChecked == checked) return

        this.isChecked = checked
        targetThumbXOffset = if (isChecked) getThumbMaxOffset() else getThumbMinOffset()


        val animator = ValueAnimator.ofFloat(thumbXOffset, targetThumbXOffset)
        animator.addUpdateListener { animation ->
            thumbXOffset = animation.animatedValue as Float
            invalidate()
        }
        animator.interpolator = AccelerateDecelerateInterpolator()
        animator.duration = 200
        animator.start()

        onCheckedChangeListener?.invoke(isChecked)
    }

    fun isChecked(): Boolean = isChecked

    fun setOnCheckedChangeListener(listener: (Boolean) -> Unit) {
        this.onCheckedChangeListener = listener
    }

    /**
     * Helper method to convert dp to px
     */
    private fun dpToPx(dp: Float): Float {
        return dp * resources.displayMetrics.density + 0.5f // +0.5f for rounding
    }
}
