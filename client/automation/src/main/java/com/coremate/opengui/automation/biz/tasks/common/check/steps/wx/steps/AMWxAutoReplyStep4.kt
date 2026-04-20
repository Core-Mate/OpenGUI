package com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps

import android.accessibilityservice.AccessibilityService
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.event.wx.AMWxPageEvent
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.AMWxAutoReplyHelper

/**
 * 第4步：分发子任务
 */
internal class AMWxAutoReplyStep4(index: Int, helper: AMWxAutoReplyHelper) :
    AMBaseStep<AMWxAutoReplyHelper>(index, helper) {

    override val isDispatcher: Boolean
        get() = true

    //记录循环过滤索引
    private var tempIndex = 0

    init {
        subStepIndex = 5
    }


    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }

        var isCanNext = true
        for (i in 0 until helper.tempNodeList.size) {
            if (condition.isIntercept || !helper.isOngoing()) {
                return condition
            }
            if (i >= tempIndex) {
                val nodeInfo = helper.tempNodeList[i]
                AMLog.onEDebugLog("当前子步骤${subStepIndex}")
                //第5步 - 点击进入
                if (subStepIndex == 5) {
                    val nameInfo = AMNodeUtils.getFirstNodeById(
                        nodeInfo,
                        IAMWidgetWX.contactNickName().resourceId
                    )
                    helper.nickName = nameInfo?.text.toString()
                    isCanNext =
                        onExecuteSubStep(
                            helper.fiveStep(),
                            AMDataContainer(bean = nodeInfo)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second

                }

                //第6步 - 传参数给AI，获取评论
                if (subStepIndex in 5..6 && isCanNext) {
                    isCanNext =
                        onExecuteSubStep(
                            helper.sixStep(),
                            AMDataContainer(bean = nodeInfo).withExtra(i)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second
                }

                //第7步 - 自动回复
                if (subStepIndex in 5..7 && isCanNext) {
                    isCanNext =
                        onExecuteSubStep(
                            helper.sevenStep(),
                            AMDataContainer(bean = nodeInfo).withExtra(i)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second
                }

                //回到首页
                AMWxPageEvent.back2WeChatHomePage(object : IAMPageEvent.IAMTaskCallBack {
                    override fun action(): Boolean {
                        return helper.isTaskPauseOrStop() || !helper.isOngoing()
                    }
                }, helper)


                subStepIndex = 5
                //增加过滤索引
                tempIndex++
            }
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        helper.executorService.execute {
            //回到第3步
            tempIndex = 0
            AMLog.onEDebugLog("回到第3步")
            helper.thirdStep()?.onExecute(data=AMDataContainer().withExtra(true))
        }
        return condition
    }

    override fun onDestroy() {
    }

}