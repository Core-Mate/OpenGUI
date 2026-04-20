package com.coremate.opengui.automation.biz.tasks.common.check.steps

import com.coremate.opengui.automation.biz.tasks.common.check.AMCommonAutoReplyHelper

internal interface AMCommonAutoListener {

    fun bindCommon(helper: AMCommonAutoReplyHelper)
    //继续
    fun onContinue()
    //暂时停止
    fun onTemporarySuspension()

}