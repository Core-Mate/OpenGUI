package com.coremate.opengui.feature.promotor.ui.views

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import kotlin.concurrent.fixedRateTimer

class LoadingDotsView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyle: Int = 0
) : View(context, attrs, defStyle) {

    private val dotRadius = dp2px(1.5f) // 半径 = 3dp / 2
    private val dotSpacing = dp2px(2f)   // 圆点之间间距

    // 三个颜色
    private val colors = listOf(
        0x66000000, // #00000066
        0xCC000000.toInt(), // #000000CC
        0x99000000.toInt()  // #00000099
    )

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var activeIndex = 0 // 当前高亮的圆点

    init {
        // 每 500 毫秒切换一次
        fixedRateTimer("loadingDots", initialDelay = 0, period = 500) {
            activeIndex = (activeIndex + 1) % 3
            postInvalidate()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val centerY = height / 2f
        val startX = (width - (dotRadius * 2 * 3 + dotSpacing * 2)) / 2f

        for (i in 0 until 3) {
            // 如果是当前 index，用对应颜色，否则颜色变淡
            paint.color = colors[(i + activeIndex) % colors.size]
            val cx = startX + i * (dotRadius * 2 + dotSpacing) + dotRadius
            canvas.drawCircle(cx, centerY, dotRadius, paint)
        }
    }

    private fun dp2px(dp: Float): Float {
        return dp * resources.displayMetrics.density
    }
}