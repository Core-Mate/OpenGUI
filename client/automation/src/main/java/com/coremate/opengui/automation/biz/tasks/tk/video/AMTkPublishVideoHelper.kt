package com.coremate.opengui.automation.biz.tasks.tk.video

import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.biz.tasks.tk.bean.AMTkPublishParam

internal class AMTkPublishVideoHelper : AMBaseStepHelper() {

    var param: AMTkPublishParam? = null

    override fun onObserveTaskResume() {
        get(currentStep - 1)?.onExecute(isResume = true)
    }
}