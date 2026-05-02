package com.coremate.opengui.automation.biz.tasks.common.check.steps.tk

import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.biz.tasks.common.check.AMCommonAutoReplyHelper
import com.coremate.opengui.automation.biz.tasks.common.check.bean.AMCommonAutoReplyParam
import com.coremate.opengui.automation.biz.tasks.common.check.steps.AMCommonAutoListener

internal class AMTkAutoReplyHelper : AMBaseStepHelper(), AMCommonAutoListener {

    var commonHelper: AMCommonAutoReplyHelper? = null
    var param: AMCommonAutoReplyParam? = null

    var isTemporary = false

    var tempNodeList = mutableListOf<AccessibilityNodeInfo>()

    var nickName = ""
    var replyContent = ""

    ///Whether this is the current app
    fun isOngoing() = (commonHelper?.curApp == AMTargetApp.TK || !isTemporary)

    public override fun onObserveTaskResume() {
        when (currentStep) {
            1, 2, 3 -> {
                get(currentStep - 1)?.onExecute(isResume = true)
            }

            else -> {
                //All other steps are handled in step 4
                forthStep()?.onExecute(isResume = true)
            }
        }
    }

    override fun bindCommon(helper: AMCommonAutoReplyHelper) {
        commonHelper = helper
        commonHelper?.executorService?.let {
            executorService = it
        }
        commonHelper?.amContext?.let {
            amContext = it
        }
        param = commonHelper?.param
    }

    override fun onContinue() {
        isTemporary = false
        onStartStep()
    }

    override fun onTemporarySuspension() {
        isTemporary = true
    }
}