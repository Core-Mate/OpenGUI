package com.coremate.opengui.automation.base.component

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.annotation.CallSuper
import androidx.viewbinding.ViewBinding
import com.coremate.opengui.automation.base.component.factory.AMCompModel
import com.coremate.opengui.automation.base.component.manager.IAMCompEventListener
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.utils.AMUtils

/**
 * Floating window
 * */
abstract class AMBaseFloatWindow<BD : ViewBinding, SD : AMCompRepository>(context: Context) :
    FrameLayout(context),
    IAMComponent {

    //Floating attributes
    val windowParams: WindowManager.LayoutParams by lazy {
        val type: Int = if (Build.VERSION.SDK_INT < 24) {
            WindowManager.LayoutParams.TYPE_PHONE
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams()
        params.type = type
        params.format = PixelFormat.TRANSLUCENT
        params
    }

    //Current floating tags type
    var curWindowTags: Int? = null

    private var interactTranslationX = 0f
    private var interactTranslationY = 0f

    //Current model
    internal lateinit var curModel: AMCompModel

    //Context
    internal lateinit var amContext: AMContext

    protected var binding: BD
    protected var repository: SD

    //External event interface
    internal var listener: IAMCompEventListener? = null

    init {
        binding = this.setBinding()
        repository = AMUtils.getT(this, 1) as SD
        //Initial coordinates
        interactTranslationX = repository.startX.toFloat()
        interactTranslationY = repository.startY.toFloat()
        repository.wpX = interactTranslationX.toInt()
        repository.wpY = interactTranslationY.toInt()
    }

    abstract fun setBinding(): BD

    open fun openDragMove(): Boolean = false

    @CallSuper
    override fun initUIAndData(dataContainer: AMDataContainer?) {

    }

    /**
 * Drag behavior
     * */
    open fun setDragMoveSelf() {
        if (openDragMove()) {
            this.setOnTouchListener(object : OnTouchListener {

                var params = windowParams
                var xDown = 0f
                var yDown = 0f

                var interactorTranslationXWhenDown = 0f
                var interactorTranslationYWhenDown = 0f

                override fun onTouch(v: View?, event: MotionEvent): Boolean {
                    when (event.action) {
                        MotionEvent.ACTION_DOWN -> {
                            xDown = event.rawX
                            yDown = event.rawY
                            interactorTranslationXWhenDown = interactTranslationX
                            interactorTranslationYWhenDown = interactTranslationY
                        }

                        MotionEvent.ACTION_MOVE -> {
                            val dx = event.rawX - xDown
                            val dy = event.rawY - yDown
                            interactTranslationX =
                                interactorTranslationXWhenDown + dx
                            interactTranslationY =
                                interactorTranslationYWhenDown + dy

                            params.x = interactTranslationX.toInt()
                            params.y = interactTranslationY.toInt()
                            repository.wpX = params.x
                            repository.wpY = params.y
                            amContext.windowManager.updateView(this@AMBaseFloatWindow)
                        }

                        else -> {}
                    }
                    return false
                }

            })
        }
    }

    fun recoverWindowFlgas() {
        windowParams.flags = curWindowTags ?: AMWindowManager.NORMAL_FLAGS
    }

    @CallSuper
    override fun show() {
        curModel.changeShow(true)
        curModel.changeHiddenSelf(false)
    }

    /**
 * Hide
     * */
    @CallSuper
    override fun dismiss() {
        curModel.changeShow(false)
        amContext.windowManager.remove(this)
    }

    @CallSuper
    override fun setHiddenSelf() {
        dismiss()
        curModel.changeHiddenSelf(true)
    }

    /**
 * Destroy
     * */
    open fun onDestroy() {

    }

}