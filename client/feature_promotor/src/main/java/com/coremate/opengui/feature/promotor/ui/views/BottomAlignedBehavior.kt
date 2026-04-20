package com.coremate.opengui.feature.promotor.ui.views

import android.view.View
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.widget.NestedScrollView

class BottomAlignedBehavior : CoordinatorLayout.Behavior<NestedScrollView>() {

    override fun layoutDependsOn(
        parent: CoordinatorLayout,
        child: NestedScrollView,
        dependency: View
    ): Boolean {
        return dependency is NestedScrollView
    }

    override fun onDependentViewChanged(
        parent: CoordinatorLayout,
        child: NestedScrollView,
        dependency: View
    ): Boolean {
        child.scrollTo(0, child.getChildAt(0).height)
        return true
    }
}