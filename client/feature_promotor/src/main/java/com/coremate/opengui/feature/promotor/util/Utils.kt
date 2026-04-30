package com.coremate.opengui.feature.promotor.util

import android.app.Activity
import android.content.Context
import android.graphics.LinearGradient
import android.graphics.Rect
import android.graphics.Shader
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.TextView
import androidx.fragment.app.Fragment
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.Duration
import java.time.format.DateTimeParseException
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

fun TextView.setMultiGradientText(
    colors: IntArray,
    positions: FloatArray? = null
) {
    post {
        val paint = paint
        val width = paint.measureText(text.toString())
        val shader = LinearGradient(
            0f, 0f, width, 0f,
            colors,
            positions,
            Shader.TileMode.CLAMP
        )
        paint.shader = shader
        invalidate()
    }
}

fun EditText.setEditable(isEditable: Boolean) {

    isEnabled = isEditable


    isFocusable = isEditable
    isFocusableInTouchMode = isEditable


    isCursorVisible = isEditable


    if (!isEditable) {
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(windowToken, 0)
    }
}

fun Int.dp2px(value: Int) {

}

fun Activity.observeKeyboardChange(onChange: (isShowing: Boolean) -> Unit) {
    val rootView = this.window.decorView
    val r = Rect()
    var lastHeight = 0
    rootView.viewTreeObserver.addOnGlobalLayoutListener {
        rootView.getWindowVisibleDisplayFrame(r)
        val height = r.height()
        if (lastHeight == 0) {
            lastHeight = height
        } else {
            val diff = lastHeight - height
            if (diff > 200) {
                onChange(true)
                lastHeight = height
            } else if (diff < -200) {
                onChange(false)
                lastHeight = height
            }
        }
    }
}


/**
 */
fun Activity.hideKeyboard() {
    val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
    val view = currentFocus ?: View(this)
    imm.hideSoftInputFromWindow(view.windowToken, 0)
}

fun Activity.showKeyboard(view: View) {
    val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
    val view = currentFocus ?: View(this)
    imm.showSoftInput(view, 0)
}

/**
 */
fun Fragment.hideKeyboard() {
    view?.let { activity?.hideKeyboard() }
}

fun Context.calculateDuration(start: String?, end: String?): String? {

    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    return try {
        if(start == null || end == null) {
            return null
        }
        val startDate = sdf.parse(start)
        val endDate = sdf.parse(end)

        if (startDate == null || endDate == null) return null

        val diffMs = abs(endDate.time - startDate.time)
        val diffSec = diffMs / 1000

        when {
            diffSec < 60 -> "${diffSec} sec"
            diffSec < 3600 -> "${diffSec / 60} min ${diffSec % 60} sec"
            else -> "${diffSec / 3600} hr ${(diffSec % 3600) / 60} min"
        }
    } catch (e: Exception) {
        null
    }
}

