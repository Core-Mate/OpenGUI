package com.coremate.opengui.feature.promotor.util

import android.content.Context
import android.text.TextUtils
import android.util.Log
import android.widget.Toast

fun Context.getStatusBarHeight(): Int {
    val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (resourceId > 0) {
        resources.getDimensionPixelSize(resourceId)
    } else {
        0
    }
}

fun Any.log() {
    Log.d("", this.toString())
}

fun Any.log(tag: String) {
    Log.d(tag, this.toString())
}

fun String.toast(context: Context?, duration: Int = Toast.LENGTH_SHORT){
    context?.let {
        if(!TextUtils.isEmpty(this)) {
            Toast.makeText(context, this, duration).show()
        }
    }
}

