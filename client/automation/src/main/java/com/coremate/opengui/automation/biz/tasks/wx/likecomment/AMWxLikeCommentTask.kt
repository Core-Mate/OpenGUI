package com.coremate.opengui.automation.biz.tasks.wx.likecomment

import com.coremate.opengui.automation.base.component.factory.AMCompModel
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseTask
import com.coremate.opengui.automation.biz.common.float.EnterFloat
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentParam
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps.*

internal class AMWxLikeCommentTask(amContext: AMContext) :
    AMBaseTask<AMWxLikeCommentHelper>(amContext) {

    override fun initTaskAndData(dataContainer: AMDataContainer?) {
        //弹出悬浮窗
        amContext.componentManager?.onExecute(AMCompModel(compCls = EnterFloat::class))
        //设置数据
        helper.param = dataContainer?.bean as AMWxLikeCommentParam
        //注册
        helper.registerSteps(
            AMWxLikeCommentStep1::class,
            AMWxLikeCommentStep2::class,
            AMWxLikeCommentStep3::class,
            AMWxLikeCommentStep4::class,
            AMWxLikeCommentStep5::class,
            AMWxLikeCommentStep6::class,
            AMWxLikeCommentStep7::class,
            AMWxLikeCommentStep8::class,
            AMWxLikeCommentStep9::class,
            AMWxLikeCommentStep10::class,
            AMWxLikeCommentStep11::class
        )
    }

}