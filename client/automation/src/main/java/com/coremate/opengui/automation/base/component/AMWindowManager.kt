package com.coremate.opengui.automation.base.component

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build.VERSION
import android.os.Build.VERSION_CODES
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.TextView
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.AMServiceManager
import com.coremate.opengui.automation.R
import com.coremate.opengui.automation.base.context.IAMSubManagerLifeCycle
import com.coremate.opengui.automation.base.utils.AMScreenUtils

internal class AMWindowManager : IAMSubManagerLifeCycle {

    companion object {

        const val KEY_BOARD_FLAGS = (WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL)

        const val NORMAL_FLAGS = (WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM)

        private const val TOUCH_FLAGS = (
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        or WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM)
    }

    private var mWindowManager: WindowManager? = null
        get() {
            if (field == null) {
                field =
                    if (VERSION.SDK_INT > VERSION_CODES.R && SelectToSpeakService.service != null) {
                        SelectToSpeakService.service?.getSystemService(Context.WINDOW_SERVICE) as WindowManager
                    } else {
                        AMServiceManager.applicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
                    }
            }
            return field
        }

    private var toastView: TextView? = null


    /**
 * Add view
     * */
    fun add(
        component: AMBaseFloatWindow<*, *>,
        x: Int,
        y: Int,
        width: Int,
        height: Int,
        gravity: Int,
        flags: Int = NORMAL_FLAGS,
        windowAnimations: Int = 0
    ) {
        if (component.parent != null) return
        val params = component.windowParams
        if (VERSION.SDK_INT > VERSION_CODES.R && SelectToSpeakService.service != null) {
            params.type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
        } else {
            params.type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        }
        params.gravity = gravity
        params.x = x
        params.y = y
        params.width = width
        params.height = height
        params.flags = flags
        component.curWindowTags = flags
        params.windowAnimations = windowAnimations
        if (component.parent != null) return
        mWindowManager?.addView(component, params)
    }

    /**
 * Remove view
     * */
    fun remove(component: AMBaseFloatWindow<*, *>) {
        if (component.parent != null) {
            mWindowManager?.removeView(component)
        }
    }

    /**
 * Whether events pass through
     * */
    fun changeEventStrike(component: AMBaseFloatWindow<*, *>?, isStrike: Boolean) {
        component?.let {
            if (isStrike) {
                it.windowParams.flags = TOUCH_FLAGS
            } else {
                it.recoverWindowFlgas();
            }
            mWindowManager?.updateViewLayout(it, it.windowParams)
        }
    }

    /**
 * Change view position
     * */
    fun updateView(component: AMBaseFloatWindow<*, *>) {
        mWindowManager?.updateViewLayout(component, component.windowParams)
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                      Tool Method
    //
    /////////////////////////////////////////////////////////////////////////////////

    /**
 * Toast prompt
     * */
    fun showToast(msg: String) {

        if (toastView == null) {
            toastView = toastView(msg)
            toastView?.let {
                mWindowManager?.addView(it, toastParam())
                Handler(Looper.getMainLooper()).postDelayed(Runnable {
                    mWindowManager?.removeViewImmediate(
                        it
                    )
                    toastView = null
                }, 2000)
            }
        } else {
            toastView?.text = msg
        }
    }

    private fun toastView(msg: String): TextView {
        val context = AMServiceManager.applicationContext
        val textView = TextView(context)
        textView.setBackgroundResource(R.drawable.shape_at_toast_bg)
        textView.text = msg
        textView.gravity = Gravity.CENTER
        textView.setTextColor(Color.parseColor("#FFFFFF"))
        textView.textSize = 15f
        textView.setPadding(
            AMScreenUtils.dp2px(12f),
            AMScreenUtils.dp2px(8f),
            AMScreenUtils.dp2px(12f),
            AMScreenUtils.dp2px(8f),
        )
        return textView
    }

    private fun toastParam(): WindowManager.LayoutParams {
        val type: Int = if (VERSION.SDK_INT < 24) {
            WindowManager.LayoutParams.TYPE_PHONE
        } else if (VERSION.SDK_INT >= VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val params = WindowManager.LayoutParams()
        params.type = type
        params.flags = (WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM
                or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL)

        params.format = PixelFormat.TRANSLUCENT
        params.width = ViewGroup.LayoutParams.WRAP_CONTENT
        params.height = ViewGroup.LayoutParams.WRAP_CONTENT
        params.gravity = Gravity.CENTER
        return params
    }

    override fun onDestroy() {
        mWindowManager = null
    }


}