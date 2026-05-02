package com.coremate.opengui.automation.biz.tasks.tk.video

import com.coremate.opengui.automation.base.component.factory.AMCompModel
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseTask
import com.coremate.opengui.automation.biz.common.float.EnterFloat
import com.coremate.opengui.automation.biz.tasks.tk.bean.AMTkPublishParam
import com.coremate.opengui.automation.biz.tasks.tk.video.steps.*

internal class AMTkPublishVideoTask(amContext: AMContext) :
    AMBaseTask<AMTkPublishVideoHelper>(amContext) {

    override fun initTaskAndData(dataContainer: AMDataContainer?) {
        //Show floating window
        amContext.componentManager?.onExecute(AMCompModel(compCls = EnterFloat::class))
        //Set data
        helper.param = dataContainer?.bean as AMTkPublishParam
        //Register
        helper.registerSteps(
            AMTkPublishVideoStep1::class,
            AMTkPublishVideoStep2::class,
            AMTkPublishVideoStep3::class,
            AMTkPublishVideoStep4::class,
            AMTkPublishVideoStep5::class,
            AMTkPublishVideoStep6::class,
            AMTkPublishVideoStep7::class,
            AMTkPublishVideoStep8::class,
            AMTkPublishVideoStep9::class,
            AMTkPublishVideoStep10::class,
            AMTkPublishVideoStep11::class,
            AMTkPublishVideoStep12::class,
            AMTkPublishVideoStep13::class,
            AMTkPublishVideoStep14::class,
            AMTkPublishVideoStep15::class,
            AMTkPublishVideoStep16::class,
            AMTkPublishVideoStep17::class,
            AMTkPublishVideoStep18::class,
        )
    }

}