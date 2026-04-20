package com.coremate.opengui.feature.promotor.ui.views

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import androidx.core.widget.NestedScrollView
import com.coremate.opengui.feature.promotor.R

class NonTouchNestedScrollView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : NestedScrollView(context, attrs) {
    var maxHeightPx: Int = 0

    init {
        if (attrs != null) {
            val a = context.obtainStyledAttributes(attrs, R.styleable.NonTouchNestedScrollView)
            maxHeightPx = a.getDimensionPixelSize(R.styleable.NonTouchNestedScrollView_maxHeight, 0)
            a.recycle()
        }
        isNestedScrollingEnabled = false
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val limited = if (maxHeightPx > 0 && maxHeightPx < Int.MAX_VALUE) {
            // 只有当 maxHeightPx 是一个合理的限制值时才使用它
            // 如果设置为 Int.MAX_VALUE，则使用原始的 heightMeasureSpec，不进行限制
            MeasureSpec.makeMeasureSpec(maxHeightPx, MeasureSpec.AT_MOST)
        } else {
            heightMeasureSpec
        }
        super.onMeasure(widthMeasureSpec, limited)
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        // 不拦截，交给父级（RecyclerView）
        return false
    }

    override fun onTouchEvent(motionEvent: MotionEvent): Boolean {
        // 不处理触摸，返回 false 让事件上传
        return false
    }
}