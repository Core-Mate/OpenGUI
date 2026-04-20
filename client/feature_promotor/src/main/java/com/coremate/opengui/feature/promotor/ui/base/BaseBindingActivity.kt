package com.coremate.opengui.feature.promotor.ui.base

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowInsetsControllerCompat
import androidx.viewbinding.ViewBinding


abstract class BaseBindingActivity<VB : ViewBinding>(open val block:(LayoutInflater)->VB) : AppCompatActivity(){

    protected val binding by lazy { block(layoutInflater) }

    private val TAG = javaClass.name
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView
            .setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
        window.setStatusBarColor(Color.TRANSPARENT)
        val wic = WindowInsetsControllerCompat(window, window.decorView)
        wic.setAppearanceLightStatusBars(true)

        setContentView(binding.root)
        initParam()
        initView()
        initEvent()
    }

    abstract fun initView()
    abstract fun initEvent()
    abstract fun initParam()
}
