package com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps

import android.text.TextUtils
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import androidx.recyclerview.widget.RecyclerView
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.node.tk.IAMWidgetTK
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.AMTkAutoReplyHelper

/**
 * 第3步：遍历消息列表
 */
internal class AMTkAutoReplyStep3(index: Int, helper: AMTkAutoReplyHelper) :
    AMBaseStep<AMTkAutoReplyHelper>(index, helper) {

    //已经加入的好友信息
    private var alreadyAddFriends = mutableListOf<String>()

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }

        SelectToSpeakService.service?.changeAccessibilityFlags(true)
        AMEventUtils.sleep(AMActionDelay.SHORT)
        //清空临时列表
        alreadyAddFriends.clear()
        helper.tempNodeList.clear()
        while (true) {
            if (!helper.isOngoing() || helper.isTaskPauseOrStop()) {
                return condition
            }
            //根节点
            var rootNode = AMCore.instance.amContext?.rootNode()
            if (rootNode == null) {
                AMEventUtils.sleep(AMActionDelay.MIDDLE)
                rootNode = AMCore.instance.amContext?.rootNode()
            }
            //列表节点
            val listViewNode =
                AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetTK.msgList().resourceId)
                    ?: throw AMTaskException.business("列表为空")

            ///是否要滑动到最顶部
            var isNoCanSlide = false
            if (data?.extra is Boolean) {
                isNoCanSlide = data.extra as Boolean
            }
            //滑动到最顶部
            while (true) {
                if (!helper.isOngoing() || helper.isTaskPauseOrStop()) {
                    return condition
                }
                if (!listViewNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) {
                    break
                }
            }

            for (i in 0..<listViewNode.childCount) {
                val tvNodeInfo = listViewNode.getChild(i)
                //1.判断节点是否为空
                if (tvNodeInfo.className.toString() != Button::class.java.name) continue
                val nameInfo = AMNodeUtils.getFirstNodeById(
                    tvNodeInfo,
                    IAMWidgetTK.contactNickName().resourceId
                )
                //2.判断用户昵称是否为空 (name可能会重复,先忽略)
                val name = nameInfo?.text.toString()
                if (TextUtils.isEmpty(name)) continue

                //3.过滤非红点的节点
                val numRedInfo = AMNodeUtils.getFirstNodeById(
                    tvNodeInfo,
                    IAMWidgetTK.messageNumRedItem().resourceId
                )

                val numRedInfo2 = AMNodeUtils.getFirstNodeById(
                    tvNodeInfo,
                    IAMWidgetTK.messageNumRedItem2().resourceId
                )

//                val redInfo = AMNodeUtils.getFirstNodeById(
//                    tvNodeInfo,
//                    IAMWidgetTK.messageRedItem().resourceId
//                )
                if (numRedInfo == null && numRedInfo2 == null) {
                    continue
                }
                //4.过滤已经添加的节点
                if (alreadyAddFriends.contains(name)) {
                    continue
                }
                //添加到总数组
                alreadyAddFriends.add(name)
                //添加到临时数组
                helper.tempNodeList.add(tvNodeInfo)

            }
            //当临时列表不为空时，执行第4步
            if (helper.tempNodeList.isNotEmpty()) {
                helper.executorService.execute {
                    if (helper.isOngoing()) {
                        helper.forthStep()?.onExecute()
                    }
                }
                return condition
            }
            //滑动
            if (listViewNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) {
                AMEventUtils.sleep(AMActionDelay.MIDDLE)
                continue
            } else {
                AMLog.onEDebugLog("跳出第3步，回复完成")
                break
            }
        }

        ///回到第2步继续
        helper.executorService.execute {
            if (helper.isOngoing()) {
                helper.secondStep()?.onExecute()
            }
        }

        return condition
    }


    override fun onDestroy() {
    }

}