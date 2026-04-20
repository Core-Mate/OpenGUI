package com.coremate.opengui.automation.biz.tasks.tk.mixvideo

import com.coremate.opengui.automation.base.component.factory.AMCompModel
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseTask
import com.coremate.opengui.automation.biz.common.float.EnterFloat
import com.coremate.opengui.automation.biz.tasks.tk.bean.AMTkPublishParam
import com.coremate.opengui.automation.biz.tasks.tk.mixvideo.steps.*

internal class AMTkPublishVideoMixTask(amContext: AMContext) :
    AMBaseTask<AMTkPublishVideoMixHelper>(amContext) {

    override fun initTaskAndData(dataContainer: AMDataContainer?) {
        //弹出悬浮窗
        amContext.componentManager?.onExecute(AMCompModel(compCls = EnterFloat::class))
        //设置数据
        helper.param = dataContainer?.bean as AMTkPublishParam
        //注册
        helper.registerSteps(
            AMTkPublishVideoMixStep1::class,
            AMTkPublishVideoMixStep2::class,
            AMTkPublishVideoMixStep3::class,
            AMTkPublishVideoMixStep4::class,
            AMTkPublishVideoMixStep5::class,
            AMTkPublishVideoMixStep6::class,
            AMTkPublishVideoMixStep7::class,
            AMTkPublishVideoMixStep8::class,
            AMTkPublishVideoMixStep9::class,
            AMTkPublishVideoMixStep10::class,
            AMTkPublishVideoMixStep11::class
        )
    }

}