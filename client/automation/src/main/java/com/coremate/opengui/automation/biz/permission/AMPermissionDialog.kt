package com.coremate.opengui.automation.biz.permission

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView
import androidx.annotation.CallSuper
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.R
import com.coremate.opengui.automation.base.utils.AMPermissionUtils
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.automation.databinding.DialogAtPermissionBinding

class AMPermissionDialog(val dContext: Context) : Dialog(dContext, R.style.MyDialog) {

    private val binding = DialogAtPermissionBinding.inflate(layoutInflater)

    private var floatPermission = false
        get() {
            field = AMPermissionUtils.hasAlertWindowPermission(dContext)
            return field
        }

    private var accessibilityPermission = false
        get() {
            field = AMPermissionUtils.hasAccessibilityPermission(
                dContext,
                SelectToSpeakService::class.java
            )
            return field
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(binding.root)
        setCanceledOnTouchOutside(true)
        setCancelable(true)
        updateUIOrFinish(false)
        initEvent()
    }

    /**
     * 更新UI
     * 1、初始化调用
     * 3、悬浮权限回调调用
     * 4、辅助权限回调调用
     * */
    fun updateUIOrFinish(isCheckFinish: Boolean) {
        changeBtnState(binding.tvFloatBt, floatPermission)
        changeBtnState(binding.tvFzBt, accessibilityPermission)
        if (isCheckFinish) {
            if (floatPermission && accessibilityPermission) {
                Handler(Looper.getMainLooper()).postDelayed({
                    dismiss()
                }, 300)
            }
        }
    }

    /**
     * 事件
     * */
    private fun initEvent() {
        binding.ivClose.setOnClickListener {
            dismiss()
        }

        binding.tvFloatBt.setOnClickListener {
            if (!floatPermission) {
                AMPermissionUtils.openAlertWindowSetting(
                    dContext as Activity,
                    999
                )
            }
        }

        binding.tvFzBt.setOnClickListener {
            if (!accessibilityPermission) {
                AMPermissionUtils.openAccessibilitySetting(dContext)
            }
        }
    }

    /**
     * 更改按钮状态
     * */
    private fun changeBtnState(textView: TextView, isHasPermission: Boolean) {
        textView.apply {
            if (isHasPermission) {
                setTextColor(context.resources.getColor(R.color.color_primary))
                text = "已开启"
            } else {
                setTextColor(context.resources.getColor(R.color.text_primary))
                text = "去开启"
            }
        }
    }

    @CallSuper
    override fun show() {
        super.show()
        val layoutParams: WindowManager.LayoutParams? = window?.attributes

        layoutParams?.gravity = Gravity.CENTER
        layoutParams?.width = WindowManager.LayoutParams.MATCH_PARENT
        layoutParams?.height = AMScreenUtils.screenHeight() - AMScreenUtils.getStatusBarHeight()
        window?.decorView?.setPadding(0, 0, 0, 0)
        window?.setDimAmount(0.4f)
        window?.attributes = layoutParams
    }


    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            updateUIOrFinish(true)
        }
    }
}