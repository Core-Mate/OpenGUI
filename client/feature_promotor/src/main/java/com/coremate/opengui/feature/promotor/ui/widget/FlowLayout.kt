package com.coremate.opengui.feature.promotor.ui.widget

import android.content.Context
import android.util.AttributeSet
import android.view.View
import android.view.ViewGroup

/**
 * 流式布局：子 View 从左到右排列，空间不足时自动换行。
 * 用于历史记录、热门关键词等 chip 的自动换行展示。
 */
class FlowLayout @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : ViewGroup(context, attrs, defStyleAttr) {

    /** 子 View 之间的水平间距（px） */
    var horizontalSpacing: Int = 0
        set(value) {
            field = value.coerceAtLeast(0)
        }

    /** 子 View 之间的垂直间距（px） */
    var verticalSpacing: Int = 0
        set(value) {
            field = value.coerceAtLeast(0)
        }

    private val rowHeights = mutableListOf<Int>()
    private val childPositions = mutableListOf<Pair<Int, Int>>()

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val widthMode = MeasureSpec.getMode(widthMeasureSpec)
        val widthSize = MeasureSpec.getSize(widthMeasureSpec)
        val paddingHorizontal = paddingLeft + paddingRight
        val availableWidth = (widthSize - paddingHorizontal).coerceAtLeast(0)

        rowHeights.clear()
        childPositions.clear()

        var currentRowTop = paddingTop
        var currentRowHeight = 0
        var currentX = paddingLeft
        var maxWidth = 0

        for (i in 0 until childCount) {
            val child = getChildAt(i)
            if (child.visibility == View.GONE) continue

            measureChild(child, widthMeasureSpec, heightMeasureSpec)
            val lp = child.layoutParams as? MarginLayoutParams ?: MarginLayoutParams(0, 0)
            val childWidth = child.measuredWidth + lp.leftMargin + lp.rightMargin
            val childHeight = child.measuredHeight + lp.topMargin + lp.bottomMargin

            if (currentX + childWidth > paddingLeft + availableWidth && currentX > paddingLeft) {
                currentRowTop += currentRowHeight + verticalSpacing
                currentX = paddingLeft
                currentRowHeight = 0
            }

            childPositions.add(Pair(currentX, currentRowTop))
            currentRowHeight = maxOf(currentRowHeight, childHeight)
            currentX += childWidth + horizontalSpacing
            maxWidth = maxOf(maxWidth, currentX - horizontalSpacing - paddingLeft + paddingRight)
        }

        rowHeights.add(currentRowHeight)
        val totalHeight = currentRowTop + currentRowHeight + paddingBottom
        val resolvedWidth = when (widthMode) {
            MeasureSpec.EXACTLY -> widthSize
            else -> (maxWidth + paddingHorizontal).coerceAtMost(widthSize)
        }
        val resolvedHeight = resolveSize(totalHeight, heightMeasureSpec)
        setMeasuredDimension(resolvedWidth, resolvedHeight)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        var index = 0
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            if (child.visibility == View.GONE) continue
            if (index >= childPositions.size) break
            val (x, y) = childPositions[index]
            val lp = child.layoutParams as? MarginLayoutParams ?: MarginLayoutParams(0, 0)
            val left = x + lp.leftMargin
            val top = y + lp.topMargin
            child.layout(left, top, left + child.measuredWidth, top + child.measuredHeight)
            index++
        }
    }

    override fun generateLayoutParams(attrs: AttributeSet?): LayoutParams {
        return MarginLayoutParams(context, attrs)
    }

    override fun generateLayoutParams(p: LayoutParams?): LayoutParams {
        return if (p is MarginLayoutParams) MarginLayoutParams(p) else MarginLayoutParams(p)
    }

    override fun generateDefaultLayoutParams(): LayoutParams {
        return MarginLayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
    }
}
