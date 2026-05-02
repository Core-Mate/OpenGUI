package com.coremate.opengui.automation.biz.tasks.common.check.steps.wx

import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.biz.tasks.common.check.AMCommonAutoReplyHelper
import com.coremate.opengui.automation.biz.tasks.common.check.bean.AMCommonAutoReplyParam
import com.coremate.opengui.automation.biz.tasks.common.check.steps.AMCommonAutoListener
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps.AMRedAutoReplyStep1
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps.AMRedAutoReplyStep2
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps.AMRedAutoReplyStep3
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps.AMRedAutoReplyStep4
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps.AMRedAutoReplyStep5
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps.AMRedAutoReplyStep6
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps.AMRedAutoReplyStep7
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps.AMTkAutoReplyStep1
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps.AMTkAutoReplyStep2
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps.AMTkAutoReplyStep3
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps.AMTkAutoReplyStep4
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps.AMTkAutoReplyStep5
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps.AMTkAutoReplyStep6
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps.AMTkAutoReplyStep7
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps.AMWxAutoReplyStep1
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps.AMWxAutoReplyStep2
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps.AMWxAutoReplyStep3
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps.AMWxAutoReplyStep4
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps.AMWxAutoReplyStep5
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps.AMWxAutoReplyStep6
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps.AMWxAutoReplyStep7

internal class AMWxAutoReplyHelper : AMBaseStepHelper(), AMCommonAutoListener {

    var commonHelper: AMCommonAutoReplyHelper? = null
    var param: AMCommonAutoReplyParam? = null
    var isTemporary = false

    var tempNodeList = mutableListOf<AccessibilityNodeInfo>()

    var nickName = ""
    var replyContent = ""

    ///Whether this is the current app
    fun isOngoing() = (commonHelper?.curApp == AMTargetApp.WX || !isTemporary)

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

    override fun onContinue() {
        isTemporary = false
        onStartStep()
    }

    override fun onTemporarySuspension() {
        isTemporary = true
    }
}