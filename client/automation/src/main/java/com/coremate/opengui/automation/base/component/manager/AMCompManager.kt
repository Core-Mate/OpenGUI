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

    //Component stack
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
 * Show Component
 * @param target Model Target Component model
 * @param isShow whether to show immediately
 * @param data Container data
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

    //Get all components
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
 * Return to app
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

    //Enter target app foreground and decide whether to show floating components
    override fun onBecameForegroundInTargetApp() {
        if (componentStack.isNotEmpty() && amContext.taskManager.isStartTool) {
            componentStack.forEach {
                if (!it.isShow() && !it.isHiddenSelf()) {
                    it.component?.show()
                }
            }
        }
    }

    //Enter target background
    override fun onBecameBackgroundInTargetApp() {
        //....
    }

    fun onDestroy() {
        //Hide all
        componentStack.forEach {
            if (it.component != null) {
                it.component?.dismiss()
            }
        }
        componentStack.clear()
    }


}