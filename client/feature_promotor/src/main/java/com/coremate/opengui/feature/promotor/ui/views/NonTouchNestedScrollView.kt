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


            MeasureSpec.makeMeasureSpec(maxHeightPx, MeasureSpec.AT_MOST)
        } else {
            heightMeasureSpec
        }
        super.onMeasure(widthMeasureSpec, limited)
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {

        return false
    }

    override fun onTouchEvent(motionEvent: MotionEvent): Boolean {

        return false
    }
}