package com.coremate.opengui.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.Toast
import com.coremate.opengui.accessibility.actions.ClickAction
import com.coremate.opengui.accessibility.actions.DragAction
import com.coremate.opengui.accessibility.actions.FinishedAction
import com.coremate.opengui.accessibility.actions.LongPressAction
import com.coremate.opengui.accessibility.actions.OpenAppAction
import com.coremate.opengui.accessibility.actions.PressBackAction
import com.coremate.opengui.accessibility.actions.PressHomeAction
import com.coremate.opengui.accessibility.actions.ScrollAction
import com.coremate.opengui.accessibility.actions.SwipeAction
import com.coremate.opengui.accessibility.actions.TypeAction
import com.coremate.opengui.accessibility.feedback.ClickFeedbackProvider
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.config.AppConfigManager
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common_jvm.dto.ActionInputs
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.common_jvm.interfaces.ActionHandler
import com.coremate.opengui.network.upload.ImageUploader
import com.tencent.mmkv.MMKV
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.apache.commons.text.StringEscapeUtils
import java.io.ByteArrayOutputStream
import java.io.FileOutputStream

/**
 * A utility class to execute various accessibility actions based on server requests.
 */
class ActionExecutor(
    private val context: Context,
    private val imageUploader: ImageUploader,
    private val clickFeedbackProvider: ClickFeedbackProvider
) : ActionHandler { // Implement ActionHandler
    private val scope =
        CoroutineScope(Dispatchers.Default) // Or inject a specific scope if preferred
    private var lastActionIsClick = false
    private var lastClickSuccess = false
    private val mmkv = MMKV.defaultMMKV()

    override suspend fun executeAction(actionType: String, inputs: ActionInputs): Boolean {
        val gestureService = GestureService.instance
        if (gestureService == null) {
            LogManager.saveLog(
                context,
                "ActionExecutor",
                "GestureService is not connected. Cannot perform action: $actionType",
                TaskCenter.executionId ?: -1
            )
            scope.launch(Dispatchers.Main) { // Toast 必须在主线程显示
                Toast.makeText(context, "错误: 无障碍服务未连接，无法执行AI操作。", Toast.LENGTH_LONG)
                    .show()
            }
            return false
        }

        val statusMessage = when (actionType) {
            "click" -> "点击坐标: (${inputs.startX}, ${inputs.startY})"
            "long_press" -> "长按坐标: (${inputs.startX}, ${inputs.startY})"
            "type" -> "输入内容: '${inputs.content?.take(10)}...'"
            "scroll" -> "滚动方向: ${inputs.direction}"
            "open_app" -> "打开应用: ${inputs.appName}"
            "drag" -> "拖拽从 (${inputs.startX}, ${inputs.startY}) 到 (${inputs.endX}, ${inputs.endY})"
            "press_home" -> "返回主屏幕"
            "press_back" -> "返回上一页"
            "finished" -> "任务完成: ${inputs.content}"
            "call_user" -> "需要您介入，请手动操作后点击恢复。"
            else -> "未知操作: $actionType"
        }
        //记录上一个 click
        lastActionIsClick = actionType === "click"
        lastClickSuccess = false
        scope.launch { AutomationEventBus.publish(AutomationEvent.StatusUpdate("AI: $statusMessage")) }

        var success = false
        val statusBarHeight = gestureService.getStatusBarHeight() // 获取状态栏高度

        when (actionType) {
            "click" -> {
                val x = inputs.startX ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "ClickAction: startX is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val y = inputs.startY ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "ClickAction: startY is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val correctedY = y - statusBarHeight
                val correctedX = x
                LogManager.saveLog(
                    context,
                    "ActionExecutor",
                    "Original click Y: $y, Corrected Y (minus status bar $statusBarHeight): $correctedY",
                    TaskCenter.executionId ?: -1
                )
                val clickAction = ClickAction()
                success = clickAction.perform(x, y)
                lastClickSuccess = success
                clickFeedbackProvider.showClickIndicator(correctedX, correctedY, 1000L)
            }

            "swipe" -> {
                val startX = inputs.startX ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "ClickAction: startX is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val startY = inputs.startY ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "ClickAction: startY is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }

                val endX = inputs.endX ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "ClickAction: endX is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val endY = inputs.endY ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "ClickAction: endY is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }

                val correctedStartY = startY - statusBarHeight
                val correctedStartX = startX

                val correctedEndY = endY - statusBarHeight
                val correctedEndX = endX

                LogManager.saveLog(
                    context,
                    "ActionExecutor",
                    "startX = $startX, startY = $startY, endX = $endX, endY = $endY, statusBarHeight = $statusBarHeight",
                    TaskCenter.executionId ?: -1
                )
                val swipeAction = SwipeAction()
                success = swipeAction.perform(
                    correctedStartX,
                    correctedStartY,
                    correctedEndX,
                    correctedEndY
                )
                LogManager.saveLog(
                    context,
                    "ActionExecutor",
                    "swipe action perform result = $success",
                    TaskCenter.executionId ?: -1
                )
            }

            "long_press" -> {
                val x = inputs.startX ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "LongPressAction: startX is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val y = inputs.startY ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "LongPressAction: startY is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val duration = 500L // Example duration
                val correctedY = y - statusBarHeight
                LogManager.saveLog(
                    context,
                    "ActionExecutor",
                    "Original long press Y: $y, Corrected Y (minus status bar $statusBarHeight): $correctedY",
                    TaskCenter.executionId ?: -1
                )
                if (!lastActionIsClick || lastClickSuccess) {
                    val longPressAction = LongPressAction()
                    success = longPressAction.perform(x, y, duration)
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "long press action perform result = $success",
                        TaskCenter.executionId ?: -1
                    )
                    clickFeedbackProvider.showClickIndicator(x, correctedY, duration + 1000L)
                }
            }

            "type" -> {
                val content = inputs.content ?: run {
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "Action 'type' received. content is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                if (!lastActionIsClick || lastClickSuccess) {
                    val typeAction = TypeAction()
                    val unescapedContent = StringEscapeUtils.unescapeJava(content)
                    success = typeAction.perform(unescapedContent)
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "Action 'type' received. result = $success",
                        TaskCenter.executionId ?: -1
                    )
                    if (success) {
                        delay(500L)
                    }
                }
            }

            "scroll" -> {
                val startX = inputs.startX ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "ScrollAction: startX is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val startY = inputs.startY ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "ScrollAction: startY is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val correctedStartY = startY - statusBarHeight
                val directionString = inputs.direction ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "ScrollAction: direction is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val direction = try {
                    ScrollAction.ScrollDirection.valueOf(directionString.uppercase())
                } catch (e: IllegalArgumentException) {
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "Invalid scroll direction: $directionString,error = ${e.message}",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                if (!lastActionIsClick || lastClickSuccess) {
                    val scrollAction = ScrollAction()
                    success = scrollAction.perform(startX, startY, direction)
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "Action 'scroll' received. result = $success",
                        TaskCenter.executionId ?: -1
                    )
                }
            }

            "open_app" -> {
                val appName = inputs.appName ?: run {
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "Action 'open_app' received. app_name is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val packageName = AppConfigManager.instance.getSupportApp()?.let { supportAppMap ->
                    supportAppMap[appName.lowercase()]
                }
                if (packageName == null) {
                    scope.launch(Dispatchers.Main) {
                        Toast.makeText(
                            context,
                            "错误: 应用'$appName'未找到，请联系管理员添加",
                            Toast.LENGTH_LONG
                        )
                            .show()
                    }
                } else {
                    val openAppAction = OpenAppAction()
                    if (!lastActionIsClick || lastClickSuccess) {
                        success =
                            openAppAction.perform(context, packageName) // <<< 使用映射后的 packageName
                    }
                    if (success) {
                        LogManager.saveLog(
                            context,
                            "ActionExecutor",
                            "Successfully initiated launch of app: '$appName' (packageName: $packageName)",
                            TaskCenter.executionId ?: -1
                        )
                        scope.launch { AutomationEventBus.publish(AutomationEvent.StatusUpdate("AI: 已启动应用'$appName'")) }
                    } else {
                        LogManager.saveLog(
                            context,
                            "ActionExecutor",
                            "Failed to launch app: '$appName' (packageName: $packageName). App might not be installed or launch intent is missing.",
                            TaskCenter.executionId ?: -1
                        )
                        scope.launch { AutomationEventBus.publish(AutomationEvent.StatusUpdate("错误: 无法启动应用'$appName'")) }
                    }
                }
            }

            "drag" -> {
                val startX = inputs.startX ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "DragAction: startX is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val startY = inputs.startY ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "DragAction: startY is null",
                        TaskCenter.executionId ?: -1
                    )
                    return false
                }
                val endX = inputs.endX ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "DragAction: endX is null",
                        TaskCenter.executionId ?: -1
                    )

                    return false
                }
                val endY = inputs.endY ?: run {
                    LogManager.saveLog(
                        context, "ActionExecutor", "DragAction: endY is null",
                        TaskCenter.executionId ?: -1
                    )

                    return false
                }
                val correctedStartY = startY - statusBarHeight
                val correctedEndY = endY - statusBarHeight
                val dragAction = DragAction()
                if (!lastActionIsClick || lastClickSuccess) {
                    success = dragAction.perform(startX, startY, endX, endY)
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "drag action preform result = $success",
                        TaskCenter.executionId ?: -1
                    )
                }
            }

            "press_home" -> {
                if (!lastActionIsClick || lastClickSuccess) {
                    Log.d("TAG", " data type:     press_home")
                    val pressHomeAction = PressHomeAction()
                    success = pressHomeAction.perform()
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "preform press_home result = $success",
                        TaskCenter.executionId ?: -1
                    )
                } else {
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "preform press_home,lastActionIsClick = $lastActionIsClick   lastClickSuccess = $lastClickSuccess ",
                        TaskCenter.executionId ?: -1
                    )
                }
            }

            "press_back" -> {
                if (!lastActionIsClick || lastClickSuccess) {
                    val pressBackAction = PressBackAction()
                    success = pressBackAction.perform()
                    LogManager.saveLog(
                        context,
                        "ActionExecutor",
                        "preform press_back,result = $success ",
                        TaskCenter.executionId ?: -1
                    )
                }
            }

            "call_user" -> {
                LogManager.saveLog(
                    context,
                    "ActionExecutor",
                    "Action 'call_user' received. Publishing AutomationEvent.Paused.",
                    TaskCenter.executionId ?: -1
                )
                // 发布暂停事件
                scope.launch { AutomationEventBus.publish(AutomationEvent.Paused) }
                success = true
            }

            "finished" -> {
                val content = inputs.content ?: "No message provided"
                val finishedAction = FinishedAction()
                finishedAction.reportCompletion(content)
                success = true
            }

            "wait" -> {
                success = true
                LogManager.saveLog(
                    context, "ActionExecutor", "action type: $actionType",
                    TaskCenter.executionId ?: -1
                )
            }

            else -> {
                LogManager.saveLog(
                    context, "ActionExecutor", "Unknown action type: $actionType",
                    TaskCenter.executionId ?: -1
                )
                scope.launch { AutomationEventBus.publish(AutomationEvent.StatusUpdate("错误: 未知操作")) }
                return false
            }
        }
        LogManager.saveLog(
            context,
            "ActionExecutor",
            "Executed action '$actionType' with result: $success",
            TaskCenter.executionId ?: -1
        )
        if (!success && actionType != "finished") {
            scope.launch { AutomationEventBus.publish(AutomationEvent.StatusUpdate("AI: '$statusMessage' 执行失败")) }
        }
        return success
    }

    override suspend fun captureScreenshot(): MutableMap<String, Any?>? { // Implements interface method
        // Add runtime API level check here as well
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            LogManager.saveLog(
                context, "ActionExecutor",
                "Screenshot capture not supported on API level ${Build.VERSION.SDK_INT}. Requires API 30+.",
                TaskCenter.executionId ?: -1
            )
            return null
        }

        LogManager.saveLog(
            context, "ActionExecutor",
            "无障碍服务正在尝试捕获屏幕截图 | 服务是否为空： ${GestureService.instance == null} | 开关是否开启：${
                isAccessibilityServiceEnabled(
                    context
                )
            }", TaskCenter.executionId ?: -1
        )
        if (GestureService.instance == null) {
            AutomationEventBus.publish(AutomationEvent.AccessibilityServiceWarningEvent)
        }

        val bitmap = GestureService.instance?.captureScreen()
        if (bitmap != null) {
            LogManager.saveLog(
                context, "ActionExecutor",
                "Captured bitmap: width=${bitmap.width}, height=${bitmap.height}, isRecycled=${bitmap.isRecycled}, hasAlpha=${bitmap.hasAlpha()}, config=${bitmap.config}",
                TaskCenter.executionId ?: -1
            )
            val byteArrayOutputStream = ByteArrayOutputStream()
            val value = mmkv.decodeInt("Quality")
            val quality = if (value <= 0) {
                80
            } else {
                value
            }
            val width: Int = bitmap.width
            val height: Int = bitmap.height

            // 计算新尺寸
            val newWidth = width / 2
            val newHeight = height / 2
            // 创建缩放后的 Bitmap
            // filter 参数：true 表示开启双线性过滤（更平滑），false 表示最近邻插值（较模糊/锯齿）
            val scaledBitmap = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
            val successCompress =
                scaledBitmap.compress(
                    Bitmap.CompressFormat.WEBP_LOSSY,
                    quality, byteArrayOutputStream
                )
            val byteArray = byteArrayOutputStream.toByteArray()
            LogManager.saveLog(
                context, "ActionExecutor",
                "Bitmap compress success: $successCompress, byteArray size: ${byteArray.size}",
                TaskCenter.executionId ?: -1
            )
            if (byteArray.isNotEmpty()) {
                val fileName = "screenshot_${System.currentTimeMillis()}.webp"
                val result = imageUploader.uploadImage(context, byteArray, fileName)
                LogManager.saveLog(
                    context, "ActionExecutor", "Upload image result = $result",
                    TaskCenter.executionId ?: -1
                )
                val map = mutableMapOf<String, Any?>()
                map.put("width", width)
                map.put("height", height)
                map.put("result", result)
                return map
            } else {
                LogManager.saveLog(
                    context,
                    "ActionExecutor",
                    "Compressed bitmap data is empty, cannot generate Base64 URL.",
                    TaskCenter.executionId ?: -1
                )
                return null
            }
        } else {
            Toast.makeText(context, "截图失败1", Toast.LENGTH_SHORT)
                .show()
            AutomationEventBus.publish(AutomationEvent.ScreenshotFail)
            LogManager.saveLog(
                context,
                "ActionExecutor",
                "Failed to capture screenshot: GestureService instance is null or captureScreen returned null.",
                TaskCenter.executionId ?: -1
            )
            return null
        }
    }

    fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val service = "${context.packageName}/${GestureService::class.java.canonicalName}"
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        return enabledServices?.contains(service) == true
    }


    fun saveBitmapToFile(bitmap: Bitmap) {
        try {
            val filePath100 =
                context.filesDir.absolutePath + "/" + System.currentTimeMillis() + ".webp"
            FileOutputStream(filePath100).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 100, out)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}