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

    // 绘制画笔
    private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val thumbPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        setShadowLayer(dpToPx(2f), 0f, dpToPx(1f), Color.parseColor("#40000000")) // 浅灰色阴影
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = dpToPx(18f)
        textAlign = Paint.Align.CENTER
    }

    // Switch 的尺寸和间距
    private val cornerRadius = dpToPx(20f) // 背景圆角半径，设置为高度的一半
    private val thumbRadius = dpToPx(10f)  // 游标半径，略小于背景高度的一半
    private val padding = dpToPx(2f)      // 游标和背景边缘的间距

    // 状态相关
    private var isChecked = false
    private var thumbXOffset = 0f // 游标当前X轴偏移量（动画用）
    private var targetThumbXOffset = 0f // 游标目标X轴偏移量

    // 颜色定义
    private val onBgColor = Color.parseColor("#673AB7") // 开启状态背景色 (深紫色)
    private val offBgColor = Color.parseColor("#E0E0E0") // 关闭状态背景色 (浅灰色)
    private val onTextColor = Color.WHITE // 开启状态文本色
    private val offTextColor = Color.GRAY // 关闭状态文本色

    // 背景渐变色（图片中是整体颜色渐变，这里简化为单一色，如需复杂渐变，请在onDraw中创建LinearGradient）
    // 如果需要渐变，可以在onDraw中根据onBgColor和offBgColor创建LinearGradient

    // 监听器
    private var onCheckedChangeListener: ((Boolean) -> Unit)? = null

    // 手势检测器用于处理点击事件
    private val gestureDetector: GestureDetector

    init {
        // 启用软件渲染以支持阴影效果
        setLayerType(LAYER_TYPE_SOFTWARE, null)

        // 初始化手势检测器
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
        val desiredWidth = dpToPx(52f).toInt() // 默认宽度
        val desiredHeight = dpToPx(28f).toInt() // 默认高度

        setMeasuredDimension(
            resolveSize(desiredWidth, widthMeasureSpec),
            resolveSize(desiredHeight, heightMeasureSpec)
        )
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // 确保游标半径和背景圆角与实际高度匹配
        val actualHeight = h.toFloat()
        // cornerRadius = actualHeight / 2 // 如果要完全椭圆形
        // thumbRadius = (actualHeight - 2 * padding) / 2 // 游标半径

        // 根据当前状态设置游标初始位置
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

        // 1. 绘制背景
        val currentBgColor = (ArgbEvaluator().evaluate(
            thumbXOffset / getThumbMaxOffset(), // 使用当前游标位置计算颜色过渡
            offBgColor,
            onBgColor
        ) as Int)
        backgroundPaint.color = currentBgColor
        canvas.drawRoundRect(bgRect, cornerRadius, cornerRadius, backgroundPaint)

        // 2. 绘制文本
        val currentTextColor = (ArgbEvaluator().evaluate(
            thumbXOffset / getThumbMaxOffset(),
            offTextColor,
            onTextColor
        ) as Int)
        textPaint.color = currentTextColor

        val textBounds = Rect()
//        val text = if (isChecked) "是" else "否"
        val text = if (isChecked) "" else ""
        textPaint.getTextBounds(text, 0, text.length, textBounds)

        // 计算文本位置，使其在未被游标覆盖的一半区域居中
        if (isChecked) { // "是" 文本在左侧
            val textX = (getThumbMinOffset() + thumbXOffset - thumbRadius) / 2
            canvas.drawText(text, textX, actualHeight / 2 + textBounds.height() / 2, textPaint)
        } else { // "否" 文本在右侧
            val textX = (getThumbMaxOffset() + thumbXOffset + thumbRadius) / 2
            canvas.drawText(text, textX, actualHeight / 2 + textBounds.height() / 2, textPaint)
        }

        // 3. 绘制游标
        canvas.drawCircle(thumbXOffset, actualHeight / 2, thumbRadius, thumbPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        // 将触摸事件交给手势检测器处理，并始终消费事件以确保点击有效
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

        // 动画移动游标
        val animator = ValueAnimator.ofFloat(thumbXOffset, targetThumbXOffset)
        animator.addUpdateListener { animation ->
            thumbXOffset = animation.animatedValue as Float
            invalidate() // 实时重绘
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