package com.coremate.opengui.accessibility

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Path
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.annotation.RequiresPermission
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common.utils.AndroidLogger
import com.coremate.opengui.common.utils.HapticFeedbackHelper
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.common_jvm.utils.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.LinkedList
import java.util.Queue
import kotlin.coroutines.resume

class GestureService : AccessibilityService() {

    companion object {
        // A static reference to the service instance for easy access
        var instance: GestureService? = null
    }

    private val scope = CoroutineScope(Dispatchers.Default) // CoroutineScope for publishing events
    private val logger: Logger = AndroidLogger()
    private var statusBarHeight: Int = -1

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
//        scope.launch { AutomationEventBus.publish(AutomationEvent.StatusUpdate("AI: 无障碍服务已连接")) }
        statusBarHeight = getStatusBarHeight()
        logger.info("GestureService", "Accessibility service connected.")
        LogManager.saveLog(applicationContext, "GestureService", "无障碍服务已连接", TaskCenter.executionId?:-1)
    }

    override fun onLowMemory() {
        super.onLowMemory()
        LogManager.saveLog(applicationContext, "GestureService", "无障碍服务  onLowMemory", TaskCenter.executionId?:-1)
    }

    override fun onUnbind(intent: Intent?): Boolean {
        LogManager.saveLog(applicationContext, "GestureService", "无障碍服务  onUnbind", TaskCenter.executionId?:-1)
        Toast.makeText(this@GestureService,"无障碍服务 Unbind", Toast.LENGTH_SHORT).show()
        return super.onUnbind(intent)
    }

    /**
     * 获取状态栏高度的方法。
     * @return 状态栏高度（像素），如果无法获取则返回 0。
     */
    fun getStatusBarHeight(): Int {
        if (statusBarHeight != -1) {
            return statusBarHeight // 使用缓存值
        }
        var result = 0
        val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
        if (resourceId > 0) {
            result = resources.getDimensionPixelSize(resourceId)
        }
        return result
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event?.let {
            if (it.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                val packageName = it.packageName?.toString() ?: "unknown_app"
                val appName = try {
                    packageManager.getApplicationLabel(
                        packageManager.getApplicationInfo(
                            packageName,
                            0
                        )
                    ).toString()
                } catch (e: Exception) {
                    packageName
                }
                scope.launch {
                    AutomationEventBus.publish(
                        AutomationEvent.AppChanged(
                            packageName,
                            appName
                        )
                    )
                }
                logger.debug("GestureService", "Window state changed to: $appName ($packageName)")
            }

        }
    }


    override fun onInterrupt() {
//        instance = null
        HapticFeedbackHelper.vibrate(this, 3000)
        LogManager.saveLog(applicationContext, "GestureService", "无障碍服务  onInterrupt,系统希望收回无障碍权限", TaskCenter.executionId?:-1)
        Toast.makeText(this@GestureService,"无障碍服务被中断", Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        HapticFeedbackHelper.vibrate(this, 3000)
//        instance = null
        scope.launch { AutomationEventBus.publish(AutomationEvent.StatusUpdate("退出APP")) }
        LogManager.saveLog(applicationContext, "GestureService", "无障碍服务  onDestroy   ${Thread.currentThread().name}", TaskCenter.executionId?:-1)
        Toast.makeText(this@GestureService,"无障碍服务被销毁", Toast.LENGTH_SHORT).show()
        super.onDestroy()
    }

    /**
     * Performs a click gesture at the specified coordinates.
     * This is the core function that executes the gesture.
     *
     * @param x The x-coordinate for the click.
     * @param y The y-coordinate for the click.
     * @param duration The duration of the click in milliseconds.
     */
    fun performClick(x: Float, y: Float, duration: Long = 10L): Boolean {
        val path = Path().apply {
            moveTo(x, y)
        }
        val gestureBuilder = GestureDescription.Builder()
        gestureBuilder.addStroke(GestureDescription.StrokeDescription(path, 0, duration))

        val success = dispatchGesture(gestureBuilder.build(), null, null)
        return success
    }

    /**
     * Performs a long press gesture at the specified coordinates.
     *
     * @param x The x-coordinate for the long press.
     * @param y The y-coordinate for the long press.
     * @param duration The duration of the press in milliseconds.
     */
    fun performLongPress(x: Float, y: Float, duration: Long): Boolean {
        val path = Path().apply {
            moveTo(x, y)
        }
        val gestureBuilder = GestureDescription.Builder()
        gestureBuilder.addStroke(GestureDescription.StrokeDescription(path, 0, duration))

        val success = dispatchGesture(gestureBuilder.build(), null, null)
        return success
    }

    /**
     * Performs a swipe gesture from a start point to an end point.
     *
     * @param startX The starting x-coordinate.
     * @param startY The starting y-coordinate.
     * @param endX The ending x-coordinate.
     * @param endY The ending y-coordinate.
     * @param duration The time the swipe will take in milliseconds.
     */
    fun performSwipe(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        duration: Long
    ): Boolean {
        val path = Path().apply {
            moveTo(startX, startY) // Move to the start point
            lineTo(endX, endY)   // Draw a line to the end point
        }
        val gestureBuilder = GestureDescription.Builder()
        gestureBuilder.addStroke(GestureDescription.StrokeDescription(path, 0, duration))

        return dispatchGesture(gestureBuilder.build(), null, null)
    }


    /**
     * Performs a global back action, simulating a press of the system's back button.
     *
     * @return True if the action was successfully performed, false otherwise.
     */
    fun performGlobalBack(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    /**
     * Performs a global home action, simulating a press of the system's home button.
     *
     * @return True if the action was successfully performed, false otherwise.
     */
    fun performGlobalHome(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_HOME)
    }

    /**
     * Performs a type (text input) action into the currently focused editable field.
     * This method attempts to find the focused editable node and set its text.
     *
     * @param text The text content to type.
     * @return True if the text was successfully set, false otherwise.
     */
    fun performTypeText(text: String): Boolean {
        // Get the root node of the current window
        logger.info("GestureService", "Attempting to type text: '$text'") // 每次调用时记录
        val rootNode = rootInActiveWindow
        if (rootNode == null) {
            logger.error(
                "GestureService",
                "performTypeText: rootInActiveWindow is null. Accessibility Service might not be active or window info not available."
            )
            return false
        }
        logger.debug("GestureService", "performTypeText: Root node found: $rootNode")

        var editableNode: AccessibilityNodeInfo? = null

        // 尝试查找当前具有输入焦点的节点
        val focusedNode = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focusedNode != null) {
            logger.debug(
                "GestureService",
                "performTypeText: Found focused node. Is editable: ${focusedNode.isEditable}, Text: ${focusedNode.text}"
            )
            if (focusedNode.isEditable) {
                editableNode = focusedNode
                logger.debug(
                    "GestureService",
                    "performTypeText: Focused node is editable, will use it."
                )
            } else {
                logger.warn(
                    "GestureService",
                    "performTypeText: Focused node is not editable. Falling back to traversal search."
                )
            }
        } else {
            logger.debug(
                "GestureService",
                "performTypeText: No input focused node found. Starting traversal search for editable node."
            )
        }

        // 回退逻辑：如果未找到焦点节点或焦点节点不可编辑，则遍历所有节点查找可编辑节点
        if (editableNode == null) {
            val queue: Queue<AccessibilityNodeInfo> = LinkedList()
            queue.add(rootNode)
            val visitedNodes = mutableSetOf<AccessibilityNodeInfo>() // 避免循环引用和重复访问

            while (queue.isNotEmpty()) {
                val node = queue.poll()
                if (node != null && !visitedNodes.contains(node)) {
                    visitedNodes.add(node) // 标记为已访问

                    // 检查节点是否可编辑并且支持 ACTION_SET_TEXT 动作
                    // ACTION_SET_TEXT 动作需要通过 performAction 来判断其可用性，如果其enabled属性为false，则performAction会返回false
                    val canSetText =
                        node.actionList?.any { it.id == AccessibilityNodeInfo.ACTION_SET_TEXT }
                            ?: false

                    if (node.isEditable && canSetText) { // 增加检查 actionList
                        editableNode = node
                        logger.debug(
                            "GestureService",
                            "performTypeText: Found editable node by traversal: $node, Text: ${node.text}"
                        )
                        break // 找到一个可编辑节点，停止搜索
                    }

                    // 遍历子节点
                    for (i in 0 until node.childCount) {
                        val child = node.getChild(i)
                        if (child != null) {
                            queue.add(child)
                        }
                    }
                }
            }
        }


        if (editableNode == null) {
            logger.error(
                "GestureService",
                "performTypeText: No editable field found or focused to type into."
            )
            return false
        }

        val arguments = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }

        // 尝试执行 ACTION_SET_TEXT
        val performResult =
            editableNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
        if (performResult) {
            logger.info(
                "GestureService",
                "performTypeText: Successfully performed ACTION_SET_TEXT on node: $editableNode"
            )
        } else {
            logger.error(
                "GestureService",
                "performTypeText: Failed to perform ACTION_SET_TEXT on node: $editableNode. Node might not be ready or action is not supported for this specific view."
            )
        }
        return performResult
    }

    /**
     * Captures the current screen content.
     * This method is asynchronous and should be called from a coroutine.
     * It requires Android R (API 30) or higher.
     *
     * @return A Bitmap of the screen capture, or null if it fails or is unsupported.
     */
    @RequiresApi(Build.VERSION_CODES.R)
    suspend fun captureScreen(): Bitmap? {
        // suspendCancellableCoroutine is a modern way to wrap callback-based APIs into suspend functions.
        return suspendCancellableCoroutine { continuation ->
            takeScreenshot(
                Display.DEFAULT_DISPLAY,
                mainExecutor, // An executor to run the callback on the main thread
                object : TakeScreenshotCallback {
                    override fun onSuccess(screenshot: ScreenshotResult) {
                        // On success, resume the coroutine with the bitmap.
                        // We need to copy to a software bitmap to make it usable/mutable.
                        val hardwareBuffer = screenshot.hardwareBuffer
                        val bitmap =
                            Bitmap.wrapHardwareBuffer(hardwareBuffer, screenshot.colorSpace)
                                ?.copy(Bitmap.Config.ARGB_8888, false)
                        continuation.resume(bitmap)
                        LogManager.saveLog(
                            applicationContext, "ActionExecutor",
                            "无障碍服务   Captured bitmap success", TaskCenter.executionId?:-1
                        )
                        hardwareBuffer.close()
                    }

                    override fun onFailure(errorCode: Int) {
                        // On failure, print an error and resume with null.
                        LogManager.saveLog(
                            applicationContext, "ActionExecutor",
                            "无障碍服务  Screen capture failed with error code: $errorCode", TaskCenter.executionId?:-1
                        )
                        continuation.resume(null)
                    }
                }
            )

            // If the coroutine is cancelled, there's nothing extra to do.
            continuation.invokeOnCancellation { throwable ->
                LogManager.saveLog(
                    applicationContext, "ActionExecutor",
                    "无障碍服务 Screen capture was cancelled: ${throwable?.message}", TaskCenter.executionId?:-1
                )
                System.err.println("Screen capture was cancelled: ${throwable?.message}")
            }
        }
    }
}