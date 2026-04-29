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
//        scope.launch { AutomationEventBus.publish(AutomationEvent.StatusUpdate("AI: Accessibility service connected")) }
        statusBarHeight = getStatusBarHeight()
        logger.info("GestureService", "Accessibility service connected.")
        LogManager.saveLog(applicationContext, "GestureService", "Accessibility service connected", TaskCenter.executionId?:-1)
    }

    override fun onLowMemory() {
        super.onLowMemory()
        LogManager.saveLog(applicationContext, "GestureService", "Accessibility service onLowMemory", TaskCenter.executionId?:-1)
    }

    override fun onUnbind(intent: Intent?): Boolean {
        LogManager.saveLog(applicationContext, "GestureService", "Accessibility service onUnbind", TaskCenter.executionId?:-1)
        Toast.makeText(this@GestureService,"Accessibility service unbound", Toast.LENGTH_SHORT).show()
        return super.onUnbind(intent)
    }

    /**
     * Returns the status bar height in pixels, or 0 if it cannot be resolved.
     */
    fun getStatusBarHeight(): Int {
        if (statusBarHeight != -1) {
            return statusBarHeight
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
        LogManager.saveLog(applicationContext, "GestureService", "Accessibility service interrupted; the system may revoke the permission", TaskCenter.executionId?:-1)
        Toast.makeText(this@GestureService,"Accessibility service interrupted", Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        HapticFeedbackHelper.vibrate(this, 3000)
//        instance = null
        scope.launch { AutomationEventBus.publish(AutomationEvent.StatusUpdate("Exit app")) }
        LogManager.saveLog(applicationContext, "GestureService", "Accessibility service onDestroy ${Thread.currentThread().name}", TaskCenter.executionId?:-1)
        Toast.makeText(this@GestureService,"Accessibility service destroyed", Toast.LENGTH_SHORT).show()
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
        logger.info("GestureService", "Attempting to type text: '$text'")
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

        // Try the currently focused input node first.
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

        // Fall back to scanning all nodes when the focused node is missing or not editable.
        if (editableNode == null) {
            val queue: Queue<AccessibilityNodeInfo> = LinkedList()
            queue.add(rootNode)
            val visitedNodes = mutableSetOf<AccessibilityNodeInfo>()

            while (queue.isNotEmpty()) {
                val node = queue.poll()
                if (node != null && !visitedNodes.contains(node)) {
                    visitedNodes.add(node)

                    // Check whether the node is editable and supports ACTION_SET_TEXT.
                    val canSetText =
                        node.actionList?.any { it.id == AccessibilityNodeInfo.ACTION_SET_TEXT }
                            ?: false

                    if (node.isEditable && canSetText) {
                        editableNode = node
                        logger.debug(
                            "GestureService",
                            "performTypeText: Found editable node by traversal: $node, Text: ${node.text}"
                        )
                        break
                    }

                    // Traverse child nodes.
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

        // Try ACTION_SET_TEXT.
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
                            "Accessibility service captured bitmap successfully", TaskCenter.executionId?:-1
                        )
                        hardwareBuffer.close()
                    }

                    override fun onFailure(errorCode: Int) {
                        // On failure, print an error and resume with null.
                        LogManager.saveLog(
                            applicationContext, "ActionExecutor",
                            "Accessibility service screen capture failed with error code: $errorCode", TaskCenter.executionId?:-1
                        )
                        continuation.resume(null)
                    }
                }
            )

            // If the coroutine is cancelled, there's nothing extra to do.
            continuation.invokeOnCancellation { throwable ->
                LogManager.saveLog(
                    applicationContext, "ActionExecutor",
                    "Accessibility service screen capture was cancelled: ${throwable?.message}", TaskCenter.executionId?:-1
                )
                System.err.println("Screen capture was cancelled: ${throwable?.message}")
            }
        }
    }
}
