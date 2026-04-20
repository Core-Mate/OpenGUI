package com.coremate.opengui.automation.base.utils

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityNodeInfo
import androidx.annotation.Px
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.task.AMBaseStepHelper


enum class AMActionDelay(val millis: Long) {
    NONE(0),
    MINI(100),
    SHORT(300),
    MIDDLE(500),
    MIDDLE_LONG(1000),
    LONG(1500),
    MAX(3500),
}

/**
 * 事件工具
 * */
internal object AMEventUtils {

    fun sleep(delay: AMActionDelay = AMActionDelay.LONG) {
        Thread.sleep(delay.millis)
    }

    /**
     * 执行事件
     * @param times 执行次数（失败之后继续执行直到times结束）
     * @param delay 事件延时
     * @param something 回调
     * @param isInterruptIgnore 过滤中断
     * @return 返回结果枚举
     * */
    fun reProcessUntilOk(
        helper: AMBaseStepHelper,
        times: Int,
        delay: AMActionDelay,
        something: Something<Boolean>,
        isInterruptIgnore: Boolean = true
    ): SomethingEvent {
        val t = doSomethingUntilSuccess(times, delay, object : Something<Boolean> {
            override fun judgmentSuccess(result: Boolean): Boolean {
                return something.judgmentSuccess(result)
            }

            override fun work(timeIndex: Int): Boolean {
                return something.work(timeIndex)
            }

            override fun workInterruput(): Boolean {
                if (isInterruptIgnore) return false
                if (helper.isTaskPauseOrStop()) {
                    AMLog.onEDebugLog(
                        "任务停止在第${helper.currentStep}步 - 事件任务",
                    )
                    return true
                }
                return something.workInterruput()
            }
        })
        return if (helper.isTaskPauseOrStop()) {
            SomethingEvent.Result(t, !isInterruptIgnore)
        } else {
            SomethingEvent.Result(t, false)
        }
    }

    /**
     * 执行事件
     * @param times 执行次数（失败之后继续执行直到times结束）
     * @param delay 事件延时
     * @param something 回调
     * */
    internal fun <T> doSomethingUntilSuccess(
        times: Int,
        delay: AMActionDelay,
        something: Something<T>
    ): T? {
        var curIndex = 0
        val maxTimes = 1.coerceAtLeast(times) //最小1次
        while (true) {
            var result: T? = null
            if (curIndex < maxTimes) {
                result = something.work(curIndex)
                val isSuc = something.judgmentSuccess(result)
                if (isSuc) {
                    return result
                } else {
                    //增加中断
                    try {
                        if (something.workInterruput()) {
                            return result
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                    sleep(delay)
                    curIndex++
                    continue
                }
            }
            return result
        }
    }

    /**
     * 遍历父节点点击（默认尝试10次）
     * */
    fun clickFirstClickableParent(
        nodeInfo: AccessibilityNodeInfo?,
        times: Int = 10,
        delay: AMActionDelay = AMActionDelay.NONE
    ): Boolean {

        if (nodeInfo == null) {
            return false
        }
        var tempNodeInfo = nodeInfo
        return doSomethingUntilSuccess(times, delay, object : Something<Boolean> {
            override fun judgmentSuccess(result: Boolean): Boolean {
                if (!result) {
                    tempNodeInfo = tempNodeInfo?.parent
                }
                return result
            }

            override fun work(timeIndex: Int): Boolean {
                return if (tempNodeInfo == null) {
                    false
                } else if (tempNodeInfo?.isClickable != true) {
                    false
                } else {
                    tempNodeInfo?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
                }
            }
        }) ?: false
    }

    /**
     * 遍历父节点点击（默认尝试10次）
     * */
    fun clickFirstClickableParentWithSimulate(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
        times: Int = 10,
        delay: AMActionDelay = AMActionDelay.NONE
    ): Boolean {

        if (nodeInfo == null) {
            return false
        }
        var tempNodeInfo = nodeInfo
        return doSomethingUntilSuccess(times, delay, object : Something<Boolean> {
            override fun judgmentSuccess(result: Boolean): Boolean {
                if (!result) {
                    tempNodeInfo = tempNodeInfo?.parent
                }
                return result
            }

            override fun work(timeIndex: Int): Boolean {
                return if (tempNodeInfo == null) {
                    false
                } else if (tempNodeInfo?.isClickable != true) {
                    false
                } else {
                    tempNodeInfo?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
                }
            }
        }) ?: doClickDown(
            nodeInfo,
            helper,
        )
    }

    /**
     * 模拟点击
     * */
    fun doClickDown(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
    ): Boolean {
        AMLog.onEDebugLog("使用模拟点击")
        //将悬浮窗事件穿透
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(true)
        }
        sleep(AMActionDelay.MINI)
        val path = Path()
        val rect = Rect()
        nodeInfo?.getBoundsInScreen(rect)
        if (rect.right < 0) return false
        path.moveTo(
            rect.centerX().toFloat(),
            rect.centerY().toFloat()
        )

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 1)).build()
        val clickAble = SelectToSpeakService.service?.dispatchGesture(
            gesture,
            object : AccessibilityService.GestureResultCallback() {
                override fun onCancelled(param1GestureDescription: GestureDescription) {
                    super.onCancelled(param1GestureDescription)
                }

                override fun onCompleted(param1GestureDescription: GestureDescription) {
                    super.onCompleted(param1GestureDescription)
                }
            },
            null
        ) ?: false
        //将悬浮窗事件恢复
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return clickAble
    }

    fun doClickDown2(
        helper: AMBaseStepHelper? = null,
        x: Float = 0f,
        y: Float = 0f
    ): Boolean {
        AMLog.onEDebugLog("使用模拟点击")
        //将悬浮窗事件穿透
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(true)
        }
        sleep(AMActionDelay.MINI)
        val path = Path()
        path.moveTo(
            x,
            y
        )

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 1)).build()
        val clickAble = SelectToSpeakService.service?.dispatchGesture(
            gesture,
            object : AccessibilityService.GestureResultCallback() {
                override fun onCancelled(param1GestureDescription: GestureDescription) {
                    super.onCancelled(param1GestureDescription)
                }

                override fun onCompleted(param1GestureDescription: GestureDescription) {
                    super.onCompleted(param1GestureDescription)
                }
            },
            null
        ) ?: false
        //将悬浮窗事件恢复
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return clickAble
    }

    fun doClickDownByX(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
        x: Float = 0f,
    ): Boolean {
        AMLog.onEDebugLog("使用模拟点击")
        //将悬浮窗事件穿透
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(true)
        }

        sleep(AMActionDelay.MINI)
        val rect = Rect()
        val path = Path()
        nodeInfo?.getBoundsInScreen(rect)
        path.moveTo(
            rect.left + x,
            rect.centerY().toFloat()
        )

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 1)).build()
        val clickAble = SelectToSpeakService.service?.dispatchGesture(
            gesture,
            object : AccessibilityService.GestureResultCallback() {
                override fun onCancelled(param1GestureDescription: GestureDescription) {
                    super.onCancelled(param1GestureDescription)
                }

                override fun onCompleted(param1GestureDescription: GestureDescription) {
                    super.onCompleted(param1GestureDescription)
                }
            },
            null
        ) ?: false
        //将悬浮窗事件恢复
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return clickAble
    }

    fun doClickDownByY(
        helper: AMBaseStepHelper? = null,
        y: Float = 0f,
    ): Boolean {
        AMLog.onEDebugLog("使用模拟点击")
        //将悬浮窗事件穿透
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(true)
        }

        sleep(AMActionDelay.MINI)
        val path = Path()
        path.moveTo(
            200f,
            y,
        )

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 1)).build()
        val clickAble = SelectToSpeakService.service?.dispatchGesture(
            gesture,
            object : AccessibilityService.GestureResultCallback() {
                override fun onCancelled(param1GestureDescription: GestureDescription) {
                    super.onCancelled(param1GestureDescription)
                }

                override fun onCompleted(param1GestureDescription: GestureDescription) {
                    super.onCompleted(param1GestureDescription)
                }
            },
            null
        ) ?: false
        //将悬浮窗事件恢复
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return clickAble
    }

    /**
     * 模拟双击
     */
    fun doDoubleClick(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
    ): Boolean {
        AMLog.onEDebugLog("使用模拟双击")
        //将悬浮窗事件穿透
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(true)
        }
        sleep(AMActionDelay.MINI)
        val path = Path()
        val rect = Rect()
        nodeInfo?.getBoundsInScreen(rect)
        if (rect.right < 0) return false
        path.moveTo(rect.centerX().toFloat(), rect.centerY().toFloat())
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 1))
            .addStroke(GestureDescription.StrokeDescription(path, 100, 1)) // 第二次点击，延迟100ms
            .build()
        val clickAble = SelectToSpeakService.service?.dispatchGesture(
            gesture,
            object : AccessibilityService.GestureResultCallback() {
                override fun onCancelled(param1GestureDescription: GestureDescription) {
                    super.onCancelled(param1GestureDescription)
                }

                override fun onCompleted(param1GestureDescription: GestureDescription) {
                    super.onCompleted(param1GestureDescription)
                }
            },
            null
        ) ?: false
        //将悬浮窗事件恢复
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return clickAble
    }


    /**
     * 模拟长按
     * */
    fun doLongClickDown(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
    ): Boolean {
        if (nodeInfo == null) return false
        AMLog.onEDebugLog("使用模拟长按")
        //将悬浮窗事件穿透
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(true)
        }
        sleep(AMActionDelay.MINI)

        val path = Path()
        val rect = Rect()
        nodeInfo.getBoundsInScreen(rect)

        path.moveTo(rect.centerX().toFloat(), rect.centerY().toFloat())

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 800)).build()

        val clickAble = SelectToSpeakService.service?.dispatchGesture(
            gesture,
            object : AccessibilityService.GestureResultCallback() {
                override fun onCancelled(param1GestureDescription: GestureDescription) {
                    super.onCancelled(param1GestureDescription)
                }

                override fun onCompleted(param1GestureDescription: GestureDescription) {
                    super.onCompleted(param1GestureDescription)
                }
            },
            null
        ) ?: false

        //将悬浮窗事件恢复
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return clickAble
    }

    /**
     * 模拟滑动
     * */
    fun doSwipeUp(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
    ): Boolean {
        AMLog.onEDebugLog("使用模拟上滑动")
        //将悬浮窗事件穿透
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(true)
        }
        sleep(AMActionDelay.MINI)
        val path = Path()
        val rect = Rect()
        nodeInfo?.getBoundsInScreen(rect)

        val i = (rect.bottom - rect.centerY()) / 2
        val j = rect.centerX()
        val k = rect.bottom
        val m = rect.centerX()
        val n = rect.top
        path.moveTo(j.toFloat(), (k - i).toFloat())
        path.lineTo(m.toFloat(), (n + i).toFloat())

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 500)).build()

        sleep(AMActionDelay.MINI)
        val swipeAble = SelectToSpeakService.service?.dispatchGesture(
            gesture,
            object : AccessibilityService.GestureResultCallback() {
                override fun onCancelled(param1GestureDescription: GestureDescription) {
                    super.onCancelled(param1GestureDescription)
                }

                override fun onCompleted(param1GestureDescription: GestureDescription) {
                    super.onCompleted(param1GestureDescription)
                }
            },
            null
        ) ?: false

        //将悬浮窗事件恢复
        sleep(AMActionDelay.MIDDLE)
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return swipeAble
    }

    fun doSwipeSmallUp(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
        px: Float
    ): Boolean {
        AMLog.onEDebugLog("使用模拟上滑动 $px 像素")

        // 开启事件穿透（避免悬浮窗拦截）
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(true)
        }

        sleep(AMActionDelay.MINI)

        val rect = Rect()
        if (nodeInfo == null || SelectToSpeakService.service == null) return false
        nodeInfo.getBoundsInScreen(rect)

        // 创建滑动路径（垂直滑动30像素）
        val path = Path()
        val startX = rect.left + 55
        val startY = rect.centerY() + px / 2   // 中心下方 px/2 像素
        val endX = rect.left + 55
        val endY = rect.centerY() - px / 2     // 中心上方 px/2 像素

        path.moveTo(startX.toFloat(), startY.toFloat())
        path.lineTo(endX.toFloat(), endY.toFloat())

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100)) // 200ms 滑动
            .build()

        sleep(AMActionDelay.MINI)

        val swipeResult = SelectToSpeakService.service?.dispatchGesture(
            gesture,
            object : AccessibilityService.GestureResultCallback() {
                override fun onCancelled(gestureDescription: GestureDescription) {
                    super.onCancelled(gestureDescription)
                    AMLog.onEDebugLog("上滑手势被取消")
                }

                override fun onCompleted(gestureDescription: GestureDescription) {
                    super.onCompleted(gestureDescription)
                    AMLog.onEDebugLog("上滑手势完成")
                }
            },
            null
        ) ?: false

        // 恢复事件阻断状态
        sleep(AMActionDelay.MIDDLE)
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }

        return swipeResult
    }


    /**
     * 上下滑动
     * */
    fun scroll2TopOrBottom(
        listView: AccessibilityNodeInfo?,
        scroll2Top: Boolean,
        times: Int = 100
    ) {
        if (listView == null) return
        doSomethingUntilSuccess(times, AMActionDelay.SHORT, object : Something<Boolean> {
            override fun judgmentSuccess(result: Boolean): Boolean {
                return result xor true
            }

            override fun work(timeIndex: Int): Boolean {
                return if (scroll2Top) listView.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) else listView.performAction(
                    AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                )
            }
        })
    }

    /**
     * 输入框填充内容
     */
    fun setTextToEditText(nodeInfo: AccessibilityNodeInfo?, text: String): Boolean {
        if (nodeInfo == null) return false
        val arg = Bundle()
        arg.putString(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        var result = true
        if (!nodeInfo.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arg)) {
            result = nodeInfo.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arg)
        }
        return result
    }

    /**
     * 给输入框焦点
     * */
    fun setFocusToEditText(nodeInfo: AccessibilityNodeInfo?): Boolean {
        if (nodeInfo == null) return false
        return nodeInfo.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
    }

}

sealed class SomethingEvent {

    class Result(val result: Boolean?, val intercept: Boolean) : SomethingEvent()

    inline fun dealWith(action: (isSuc: Boolean, intercept: Boolean) -> Unit) {
        when (this) {
            is Result -> {
                val s = result ?: false
                if (s) {
                    //成功
                    action(true, intercept)
                } else {
                    //失败
                    action(false, intercept)
                }
                return
            }
        }
    }
}

/**
 * 执行事件回调
 * @param T 返回类型
 * */
interface Something<T> {
    //判断成功返回T
    fun judgmentSuccess(result: T): Boolean

    //工作(多次)
    fun work(timeIndex: Int): T

    //中断
    fun workInterruput(): Boolean {
        return false
    }
}