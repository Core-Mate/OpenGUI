package com.coremate.opengui.feature.promotor.ui

import android.content.Context
import android.graphics.Rect
import android.view.View
import androidx.recyclerview.widget.RecyclerView

open class VerticalSpacingItemDecoration(private val spacing: Int) : RecyclerView.ItemDecoration() {

    override fun getItemOffsets(
        outRect: Rect,
        view: View,
        parent: RecyclerView,
        state: RecyclerView.State
    ) {
        super.getItemOffsets(outRect, view, parent, state)

        val spacingPx = dpToPx(spacing, parent.context)
        // 设置左、上、右、下四个方向的间距（这里统一设置为spacingPx的值）
        outRect.left = spacingPx
        outRect.right = spacingPx
        outRect.top = spacingPx
        outRect.bottom = spacingPx
    }

    private fun dpToPx(dp: Int, context: Context): Int {
        val density = context.resources.displayMetrics.density
        return (dp * density).toInt()
    }
}