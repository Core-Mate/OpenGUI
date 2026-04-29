package com.coremate.opengui.feature.promotor.ui.window

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.animation.ObjectAnimator
import android.animation.AnimatorSet
import android.provider.Settings
import android.widget.FrameLayout
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.databinding.WindowGradientBinding
import com.coremate.opengui.feature.promotor.ui.AIFloatWindowManager

class GradientWindow(context: Context) : FrameLayout(context) {
    private val binding: WindowGradientBinding
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    @Volatile private var isShowing = false

    private val TAG = "GradientWindow"

    init {
        val themedContext = ContextThemeWrapper(context, R.style.Theme_Promotor_Feature)
        binding = WindowGradientBinding.inflate(LayoutInflater.from(themedContext), this, true)

//        startBreathAnimation(binding.topMaskBg)
        startBreathAnimation(binding.bottomMaskBg)

        AIFloatWindowManager.registerGradientWindow(this)
    }

    private fun checkPermission(): Boolean {
        val hasAccessibilityServicePermission = isAccessibilityServiceEnabled(binding.imgAccessibility.context)
        val hasDrawOverlaysPermission = Settings.canDrawOverlays(binding.imgAccessibility.context)
        if(hasAccessibilityServicePermission){
            binding.imgAccessibility.setImageResource(R.mipmap.icon_accessibility_enable)
        }else{
            binding.imgAccessibility.setImageResource(R.mipmap.icon_accessibility_disable)
        }
        if(hasDrawOverlaysPermission){
            binding.imgFloatingWindow.setImageResource(R.mipmap.icon_floating_window_enable)
        }else{
            binding.imgFloatingWindow.setImageResource(R.mipmap.icon_floating_window_disable)
        }
        return hasAccessibilityServicePermission && hasDrawOverlaysPermission
    }

    private fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val service = "${context.packageName}/${GestureService::class.java.canonicalName}"
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        return enabledServices?.contains(service) == true
    }


    private fun startBreathAnimation(target: View) {

        val scaleX = ObjectAnimator.ofFloat(target, View.SCALE_X, 0.96f, 1.04f).apply {
            duration = 1800
            repeatCount = ObjectAnimator.INFINITE
            repeatMode = ObjectAnimator.REVERSE
        }


        val alpha = ObjectAnimator.ofFloat(target, View.ALPHA, 0.3f, 1.0f).apply {
            duration = 1800
            repeatCount = ObjectAnimator.INFINITE
            repeatMode = ObjectAnimator.REVERSE
        }

        AnimatorSet().apply {
            interpolator = AccelerateDecelerateInterpolator()
            playTogether(scaleX,  alpha)
            start()
        }
    }

    private val layoutParamsForShow: WindowManager.LayoutParams by lazy {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,

            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS or
                    WindowManager.LayoutParams.FLAG_LAYOUT_INSET_DECOR,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            x = 0
            y = 0
        }
    }

    @Synchronized
    fun show(from: String) {
        LogManager.saveLog(
            context,
            TAG,
            "$TAG | gradient frame show | from = $from | isShowing = $isShowing | currentTaskState = ${TaskCenter.currentTaskState}"
            ,
            TaskCenter.executionId?:-1)
        if (!isShowing && TaskCenter.currentTaskState == TaskCenter.TaskState.EXECUTE) {
            checkPermission()
            windowManager.addView(this, layoutParamsForShow)
            isShowing = true
        }
    }

    @Synchronized
    fun dismiss(from: String) {
        LogManager.saveLog(
            context,
            TAG,
            "$TAG | gradient frame hide | from = $from | isShowing = $isShowing",
            TaskCenter.executionId?:-1
        )
        if (isShowing) {
            try {
                windowManager.removeView(this)
                isShowing = false
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
