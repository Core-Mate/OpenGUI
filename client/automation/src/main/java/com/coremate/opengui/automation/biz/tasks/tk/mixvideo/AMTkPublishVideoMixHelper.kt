package com.coremate.opengui.automation.biz.tasks.tk.mixvideo

import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.biz.tasks.tk.bean.AMTkPublishParam

internal class AMTkPublishVideoMixHelper : AMBaseStepHelper() {

    var param: AMTkPublishParam? = null

    override fun onObserveTaskResume() {
        get(currentStep - 1)?.onExecute(isResume = true)
    }
}