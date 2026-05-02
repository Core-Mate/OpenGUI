package com.coremate.opengui.automation.biz.tasks.common.check

import com.coremate.opengui.automation.base.component.factory.AMCompModel
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseTask
import com.coremate.opengui.automation.biz.common.float.EnterFloat
import com.coremate.opengui.automation.biz.tasks.common.check.bean.AMCommonAutoReplyParam
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.AMRedAutoReplyHelper
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps.*
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.AMTkAutoReplyHelper
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps.*
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.AMWxAutoReplyHelper
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps.*


internal class AMCommonAutoReplyTask(amContext: AMContext) :
    AMBaseTask<AMCommonAutoReplyHelper>(amContext) {


    override fun initTaskAndData(dataContainer: AMDataContainer?) {
        //Show floating window
        amContext.componentManager?.onExecute(AMCompModel(compCls = EnterFloat::class))
        //Set data
        helper.param = dataContainer?.bean as AMCommonAutoReplyParam
        //Set child helper
        helper.initSub()

    }

}