package com.coremate.opengui.automation.base.component.manager

import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.component.factory.AMCompModel
import com.coremate.opengui.automation.base.component.factory.AMFloatFactory
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.context.IAMCompForeBackObserver
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMTaskState
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMUtils

internal class AMCompManager(private val amContext: AMContext) :
    IAMCompEventListener, IAMCompForeBackObserver {

    //组件栈
    private val componentStack = mutableListOf<AMCompModel>()

    fun onExecute(
        comp: AMCompModel,
        dataContainer: AMDataContainer? = null,
        listener: IAMCompEventListener? = null
    ) {
        if (AMContext.isInTargetApp) {
            AMLog.onEDebugLog("显示悬浮窗口")
            showComponent(comp, true, dataContainer, listener)
        } else {
            AMLog.onEDebugLog("等进入目标app - 显示悬浮窗口")
            showComponent(comp, false, dataContainer, listener)
        }
    }

    /**
     * 显示组件
     * @param targetModel 目标组件模型
     * @param isShow 是否直接显示出来
     * @param dataContainer 数据
     * */
    private fun showComponent(
        targetModel: AMCompModel,
        isShow: Boolean = true,
        dataContainer: AMDataContainer? = null,
        listener: IAMCompEventListener?
    ) {
        val component =
            AMFloatFactory().create(targetModel, amContext, dataContainer, listener ?: this)
        if (isShow) {
            component.show()
        }
        componentStack.add(targetModel.apply {
            this.component = component
        })
    }

    //获取所有组件
    fun allComponent(): MutableList<AMCompModel> {
        return componentStack
    }


    /////////////////////////////////////////////////////////////////////////////////
    //
    //                      IAMCompEventListener
    //
    /////////////////////////////////////////////////////////////////////////////////

    override fun onStartComp() {
        amContext.processListener?.onProcessTaskResume()
    }

    override fun onPauseComp() {
        amContext.processListener?.onProcessTaskPause(true)
    }

    override fun onStopComp() {
        AMLog.onEDebugLog("确定停止任务")
        amContext.taskManager.setTaskState(AMTaskState.STOP, true)
    }

    /**
     * 返回app
     * */
    override fun onBackApp() {
        AMUtils.jumpToPageInApp(
            SelectToSpeakService.service,
            amContext.activity
        )
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                      IAMComponentForeBackObserver
    //
    /////////////////////////////////////////////////////////////////////////////////

    //进入目标app前台（判断显示悬浮组件）
    override fun onBecameForegroundInTargetApp() {
        if (componentStack.isNotEmpty() && amContext.taskManager.isStartTool) {
            componentStack.forEach {
                if (!it.isShow() && !it.isHiddenSelf()) {
                    it.component?.show()
                }
            }
        }
    }

    //进入目标后台
    override fun onBecameBackgroundInTargetApp() {
        //....
    }

    fun onDestroy() {
        //隐藏所有
        componentStack.forEach {
            if (it.component != null) {
                it.component?.dismiss()
            }
        }
        componentStack.clear()
    }


}