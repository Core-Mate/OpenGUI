package com.coremate.opengui.automation.biz.tasks.common.check.steps

import com.coremate.opengui.automation.biz.tasks.common.check.AMCommonAutoReplyHelper

internal interface AMCommonAutoListener {

    fun bindCommon(helper: AMCommonAutoReplyHelper)
    //Continue
    fun onContinue()
    //Temporarily stop
    fun onTemporarySuspension()

}