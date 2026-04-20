package com.coremate.opengui.feature.promotor.ui.views

import android.content.Context
import android.util.AttributeSet
import android.widget.LinearLayout

class MaxHeightLinearLayout @JvmOverloads constructor(
    ctx: Context, attrs: AttributeSet? = null
) : LinearLayout(ctx, attrs) {
    var maxHeightPx: Int = 0
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val maxSpec = if (maxHeightPx > 0)
            MeasureSpec.makeMeasureSpec(maxHeightPx, MeasureSpec.AT_MOST)
        else heightMeasureSpec
        super.onMeasure(widthMeasureSpec, maxSpec)
    }
}