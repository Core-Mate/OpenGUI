package com.coremate.opengui.feature.promotor.ui.base

import android.app.Activity
import android.content.Context
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import androidx.activity.ComponentActivity
import androidx.annotation.LayoutRes
import androidx.databinding.DataBindingUtil
import androidx.databinding.ViewDataBinding
import androidx.lifecycle.LifecycleOwner


/**
 */
fun <T : ViewDataBinding> Activity.bindView(@LayoutRes layout: Int): T {
    return DataBindingUtil.setContentView(this, layout)
}

/**
 */
fun <T : ViewDataBinding> Activity.bindView(view: View): T? {
    return DataBindingUtil.bind<T>(view)
}

/**
 */
fun Activity.immediateStatusBar() {
    window.apply {
        addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN)
        addFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
        addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
        decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
}

/**
 */
fun Activity.dismissKeyBoard(view: View) {
    val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager?
    imm?.hideSoftInputFromWindow(view.windowToken, 0)
}


//endregion




/**
 */
val ComponentActivity.viewLifeCycleOwner: LifecycleOwner
    get() = this

/**
 */
val Activity.context: Context
    get() = this

//endregion
