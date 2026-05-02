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
 * Event utilities
 * */
internal object AMEventUtils {

    fun sleep(delay: AMActionDelay = AMActionDelay.LONG) {
        Thread.sleep(delay.millis)
    }

    /**
 * Execute event
 * @param times execution count; continue after failures until times is exhausted
 * @param delay event delay
 * @param something callback
 * @param is Interrupt Ignore ignore interruption
 * @return result enum
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
 * Execute event
 * @param times execution count; continue after failures until times is exhausted
 * @param delay event delay
 * @param something callback
     * */
    internal fun <T> doSomethingUntilSuccess(
        times: Int,
        delay: AMActionDelay,
        something: Something<T>
    ): T? {
        var curIndex = 0
        val maxTimes = 1.coerceAtLeast(times) // At least one attempt.
        while (true) {
            var result: T? = null
            if (curIndex < maxTimes) {
                result = something.work(curIndex)
                val isSuc = something.judgmentSuccess(result)
                if (isSuc) {
                    return result
                } else {
                    //Add interruption
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
 * Traverse parent nodes and tap, up to 10 attempts by default
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
 * Traverse parent nodes and tap, up to 10 attempts by default
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
 * Simulate tap
     * */
    fun doClickDown(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
    ): Boolean {
        AMLog.onEDebugLog("使用模拟点击")
        //Enable floating-window event pass-through
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
        //Restore floating-window event handling
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
        //Enable floating-window event pass-through
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
        //Restore floating-window event handling
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
        //Enable floating-window event pass-through
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
        //Restore floating-window event handling
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
        //Enable floating-window event pass-through
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
        //Restore floating-window event handling
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return clickAble
    }

    /**
 * Simulate double tap
     */
    fun doDoubleClick(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
    ): Boolean {
        AMLog.onEDebugLog("使用模拟双击")
        //Enable floating-window event pass-through
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
            .addStroke(GestureDescription.StrokeDescription(path, 100, 1)) // Second tap, delayed by 100 ms.
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
        //Restore floating-window event handling
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return clickAble
    }


    /**
 * Simulate Long press
     * */
    fun doLongClickDown(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
    ): Boolean {
        if (nodeInfo == null) return false
        AMLog.onEDebugLog("使用模拟长按")
        //Enable floating-window event pass-through
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

        //Restore floating-window event handling
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }
        return clickAble
    }

    /**
 * Simulate Swipe
     * */
    fun doSwipeUp(
        nodeInfo: AccessibilityNodeInfo?,
        helper: AMBaseStepHelper? = null,
    ): Boolean {
        AMLog.onEDebugLog("使用模拟上滑动")
        //Enable floating-window event pass-through
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

        //Restore floating-window event handling
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

        // Enable event pass-through to avoid floating-window interception
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(true)
        }

        sleep(AMActionDelay.MINI)

        val rect = Rect()
        if (nodeInfo == null || SelectToSpeakService.service == null) return false
        nodeInfo.getBoundsInScreen(rect)

        // Create swipe path with 30 px vertical movement
        val path = Path()
        val startX = rect.left + 55
        val startY = rect.centerY() + px / 2   // px / 2 below center.
        val endX = rect.left + 55
        val endY = rect.centerY() - px / 2     // px / 2 above center.

        path.moveTo(startX.toFloat(), startY.toFloat())
        path.lineTo(endX.toFloat(), endY.toFloat())

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100)) // 200 ms swipe.
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

        // Restore event blocking state
        sleep(AMActionDelay.MIDDLE)
        Handler(Looper.getMainLooper()).post {
            helper?.amContext?.changeCompEventStrike(false)
        }

        return swipeResult
    }


    /**
 * Vertical swipe
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
 * Fill input field content
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
 * Focus the input field
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
                    //Success
                    action(true, intercept)
                } else {
                    //Failure
                    action(false, intercept)
                }
                return
            }
        }
    }
}

/**
 * Execute event callback
 * @param T return type
 * */
interface Something<T> {
    //Check Success BackT
    fun judgmentSuccess(result: T): Boolean

    //Work multiple times
    fun work(timeIndex: Int): T

    //Interrupt
    fun workInterruput(): Boolean {
        return false
    }
}
