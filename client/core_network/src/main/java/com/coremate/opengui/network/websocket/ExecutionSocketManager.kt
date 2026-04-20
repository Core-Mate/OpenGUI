package com.coremate.opengui.network.websocket

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import com.google.gson.Gson
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common.statistics.StatisticCustomError
import com.coremate.opengui.common.statistics.StatisticEvent
import com.coremate.opengui.common.statistics.StatisticsManager
import com.coremate.opengui.common.utils.AndroidLogger
import com.coremate.opengui.common_jvm.dto.ActionReqDto
import com.coremate.opengui.common_jvm.dto.ActionRespDto
import com.coremate.opengui.common_jvm.dto.ScreenShotActionRespDto
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.common_jvm.event.StopReason
import com.coremate.opengui.common_jvm.interfaces.ActionHandler
import com.coremate.opengui.common_jvm.utils.Logger
import com.tencent.mmkv.MMKV
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import com.coremate.opengui.network.api.ServerConstant
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.URISyntaxException

/**
 * Agent event received from server (replaces SSE events)
 */
data class AgentStreamEvent(
    val type: String,
    val taskExecutionId: Int,
    val from: String,
    val content: String,
    val extra: Any? = null,
    val seq: Int = 0,
    val timestamp: Long = 0
)

/**
 * Per-execution WebSocket manager.
 *
 * Replaces the old SocketManager singleton + SseClient dual-channel approach.
 * Each execution creates a new instance, connects with executionId in auth,
 * and receives ALL events (streaming + device requests) through a single WebSocket.
 *
 * Lifecycle:
 * 1. Create instance with executionId
 * 2. Call connect() — establishes WS, sends execution:ready
 * 3. Receives agent:event (streaming), device:screenshot, device:action
 * 4. Call disconnect() when execution completes
 */
class ExecutionSocketManager(
    val executionId: Long,
    private val serverUrl: String,
    private val token: String,
    private val actionHandler: ActionHandler,
    private val appContext: Context,
) {
    private val TAG = "ExecSocketMgr"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val runtimeLogger: Logger = AndroidLogger()
    private val gson = Gson()
    private var socket: Socket? = null
    private var heartbeatJob: Job? = null
    private var lastSeq = -1
    private var readySent = false

    private val SCREENSHOT_STEP_DELAY_MS = 2000L
    private val SCRIPT_STEP_DELAY_MS = 500L

    // Connection state
    enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED, ERROR }
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    // Agent event flow (replaces SSE callback)
    private val _agentEventFlow = MutableSharedFlow<AgentStreamEvent>(extraBufferCapacity = 64)
    val agentEventFlow: SharedFlow<AgentStreamEvent> = _agentEventFlow.asSharedFlow()

    // Lifecycle events
    private val _executionStarted = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val executionStarted: SharedFlow<Unit> = _executionStarted.asSharedFlow()

    private val _executionFinished = MutableSharedFlow<JSONObject>(extraBufferCapacity = 1)
    val executionFinished: SharedFlow<JSONObject> = _executionFinished.asSharedFlow()

    private val _executionError = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val executionError: SharedFlow<String> = _executionError.asSharedFlow()

    fun connect() {
        try {
            val opts = IO.Options().apply {
                reconnection = true
                transports = arrayOf("websocket", "polling")
                reconnectionAttempts = 10
                reconnectionDelay = 1000L
                reconnectionDelayMax = 5000L
                timeout = 20000L
                auth = mutableMapOf(
                    "token" to "Bearer $token",
                    "executionId" to executionId.toString()
                )
            }
            socket = IO.socket(serverUrl, opts)
            setupListeners()
            _connectionState.value = ConnectionState.CONNECTING
            socket?.connect()
            runtimeLogger.info(TAG, "Connecting for execution=$executionId")
        } catch (e: URISyntaxException) {
            e.printStackTrace()
            _connectionState.value = ConnectionState.ERROR
            StatisticsManager.instance.onUploadException(
                StatisticCustomError.SOCKET_ERR,
                e.message ?: "ExecutionSocketManager connect error"
            )
        }
    }

    private fun setupListeners() {
        // Debug logging for all events
        socket?.onAnyIncoming(object : Emitter.Listener {
            override fun call(vararg args: Any?) {
                val eventName = args.getOrNull(0) as? String ?: "Unknown"
                runtimeLogger.info(TAG, "Incoming: '$eventName' exec=$executionId")
                LogManager.saveLog(appContext, TAG,
                    "Incoming: $eventName ${Gson().toJson(args)}", executionId.toInt())
            }
        })

        // Connection events
        socket?.on(Socket.EVENT_CONNECT) {
            _connectionState.value = ConnectionState.CONNECTED
            runtimeLogger.info(TAG, "Connected for execution=$executionId, socketId=${socket?.id()}")

            if (!readySent) {
                // Only send execution:ready on initial connect, not on reconnect
                lastSeq = -1
                socket?.emit(SocketEvents.EXECUTION_READY,
                    JSONObject().put("executionId", executionId))
                runtimeLogger.info(TAG, "Sent execution:ready for execution=$executionId")
                readySent = true
            } else {
                runtimeLogger.info(TAG, "Reconnected for execution=$executionId, skipping execution:ready")
            }

            // Start lease heartbeat (needed on both connect and reconnect)
            startHeartbeat()
        }

        socket?.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = args.getOrNull(0) as? String ?: "unknown"
            _connectionState.value = ConnectionState.DISCONNECTED
            runtimeLogger.warn(TAG, "Disconnected exec=$executionId reason=$reason")
            stopHeartbeat()
        }

        socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
            val error = args.getOrNull(0) as? Exception
            _connectionState.value = ConnectionState.ERROR
            runtimeLogger.error(TAG, "Connect error exec=$executionId: ${error?.message}", error)
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(appContext, "网络连接失败，请检查网络设置", Toast.LENGTH_LONG).show()
            }
        }

        // Agent events (replaces SSE)
        socket?.on(SocketEvents.AGENT_EVENT) { args ->
            val rawData = args.getOrNull(0)
            if (rawData is JSONObject) {
                try {
                    val event = AgentStreamEvent(
                        type = rawData.optString("type", ""),
                        taskExecutionId = rawData.optInt("taskExecutionId", 0),
                        from = rawData.optString("from", ""),
                        content = rawData.optString("content", ""),
                        extra = rawData.opt("extra"),
                        seq = rawData.optInt("seq", 0),
                        timestamp = rawData.optLong("timestamp", 0)
                    )
                    // Seq gap detection
                    if (lastSeq >= 0 && event.seq != lastSeq + 1) {
                        runtimeLogger.warn(TAG,
                            "Seq gap detected: expected ${lastSeq + 1}, got ${event.seq}, exec=$executionId")
                        LogManager.saveLog(appContext, TAG,
                            "SEQ GAP: expected=${lastSeq + 1} got=${event.seq}", executionId.toInt())
                    }
                    lastSeq = event.seq
                    scope.launch { _agentEventFlow.emit(event) }
                } catch (e: Exception) {
                    runtimeLogger.error(TAG, "Failed to parse agent:event: ${e.message}", e)
                }
            }
        }

        // Execution lifecycle events
        socket?.on(SocketEvents.EXECUTION_STARTED) { args ->
            runtimeLogger.info(TAG, "Execution started: $executionId")
            scope.launch { _executionStarted.emit(Unit) }
        }

        socket?.on(SocketEvents.EXECUTION_FINISHED) { args ->
            val data = args.getOrNull(0) as? JSONObject ?: JSONObject()
            runtimeLogger.info(TAG, "Execution finished: $executionId")
            scope.launch { _executionFinished.emit(data) }
        }

        socket?.on(SocketEvents.EXECUTION_ERROR) { args ->
            val data = args.getOrNull(0) as? JSONObject
            val message = data?.optString("message", "Unknown error") ?: "Unknown error"
            runtimeLogger.error(TAG, "Execution error: $executionId - $message", null)
            scope.launch { _executionError.emit(message) }
        }

        // Device screenshot request (with ACK)
        setupScreenshotListener()

        // Device action request (with ACK)
        setupActionListener()
    }

    private fun setupScreenshotListener() {
        socket?.on(SocketEvents.DEVICE_SCREENSHOT) { args ->
            runtimeLogger.debug(TAG, "Received device:screenshot exec=$executionId")

            val ack = args.last() as? Ack
            if (ack == null) {
                runtimeLogger.error(TAG, "device:screenshot without ACK callback")
                return@on
            }

            scope.launch(Dispatchers.Main) {
                var screenshotUrl: String? = null
                var success = false
                var width = 0
                var height = 0

                try {
                    AutomationEventBus.publish(AutomationEvent.ScreenshotRequested)
                    delay(SCREENSHOT_STEP_DELAY_MS)

                    val map = actionHandler.captureScreenshot()
                    screenshotUrl = map?.get("result") as? String
                    width = (map?.get("width") as? Number)?.toInt() ?: 0
                    height = (map?.get("height") as? Number)?.toInt() ?: 0
                    success = screenshotUrl != null

                    AutomationEventBus.publish(AutomationEvent.ImageUploadComplete)
                } catch (e: Exception) {
                    runtimeLogger.error(TAG, "Screenshot capture error: ${e.message}", e)
                } finally {
                    val jsonResp = JSONObject().apply {
                        put("success", success)
                        put("screenshot_uri", screenshotUrl)
                        put("scale_factor", 0.5f)
                        put("screen_width", width)
                        put("screen_height", height)
                    }
                    try {
                        ack.call(jsonResp)
                        delay(SCRIPT_STEP_DELAY_MS)
                        runtimeLogger.info(TAG, "Screenshot ACK sent")
                    } catch (e: Exception) {
                        runtimeLogger.error(TAG, "Screenshot ACK error: ${e.message}", e)
                    }
                }
            }
        }
    }

    private fun getCurrentAppName(): String? {
        return try {
            val am = appContext.getSystemService(Context.ACTIVITY_SERVICE)
                as? android.app.ActivityManager
            val tasks = am?.getRunningTasks(1)
            val topActivity = tasks?.firstOrNull()?.topActivity
            if (topActivity != null) {
                val pm = appContext.packageManager
                val appInfo = pm.getApplicationInfo(topActivity.packageName, 0)
                pm.getApplicationLabel(appInfo).toString()
            } else {
                null
            }
        } catch (e: Exception) {
            runtimeLogger.error(TAG, "getCurrentAppName error: ${e.message}", e)
            null
        }
    }

    private fun setupActionListener() {
        socket?.on(SocketEvents.DEVICE_ACTION) { args ->
            runtimeLogger.debug(TAG, "Received device:action exec=$executionId")

            val rawData = args.getOrNull(0)
            val ack = args.last() as? Ack

            if (ack == null) {
                runtimeLogger.error(TAG, "device:action without ACK callback")
                return@on
            }

            if (rawData == null) {
                ack.call(JSONObject().put("success", false).put("error", "null data"))
                return@on
            }

            scope.launch(Dispatchers.Main) {
                var success = false
                var errorMessage: String? = null

                try {
                    val actionReqDto: ActionReqDto? = when (rawData) {
                        is String -> gson.fromJson(rawData, ActionReqDto::class.java)
                        is JSONObject -> gson.fromJson(rawData.toString(), ActionReqDto::class.java)
                        else -> throw IllegalArgumentException("Unexpected data type: ${rawData::class.java.name}")
                    }

                    if (actionReqDto == null) {
                        throw IllegalStateException("Failed to parse ActionReqDto")
                    }

                    runtimeLogger.info(TAG, "Action: ${actionReqDto.actionType}")

                    if (actionReqDto.actionType == "call_user") {
                        AutomationEventBus.publish(AutomationEvent.Paused)
                        AutomationEventBus.publish(AutomationEvent.CallUser(actionReqDto.actionInputs.content))
                        ack.call(JSONObject().put("success", true))
                        return@launch
                    }

                    AutomationEventBus.publish(AutomationEvent.EventProcessingStart)
                    delay(400)
                    success = actionHandler.executeAction(actionReqDto.actionType, actionReqDto.actionInputs)
                    AutomationEventBus.publish(AutomationEvent.EventProcessingDone)

                    if (actionReqDto.actionType == "finished") {
                        AutomationEventBus.publish(AutomationEvent.Stopped(StopReason.COMPLETED))
                    }

                    if (!success) {
                        errorMessage = "Failed to perform action: ${actionReqDto.actionType}"
                    }
                } catch (e: Exception) {
                    errorMessage = "Error: ${e.message}"
                    runtimeLogger.error(TAG, "Action error: ${e.message}", e)
                    AutomationEventBus.publish(AutomationEvent.Stopped(StopReason.ERROR))
                    AutomationEventBus.publish(AutomationEvent.ReturnToPromotorApp)
                } finally {
                    val jsonResp = JSONObject().apply {
                        put("success", success)
                        if (errorMessage != null) put("error", errorMessage)
                    }
                    try {
                        ack.call(jsonResp)
                    } catch (e: Exception) {
                        runtimeLogger.error(TAG, "Action ACK error: ${e.message}", e)
                    }
                }
            }
        }
    }

    private val HEARTBEAT_INTERVAL_MS = 5000L
    /** 连续多少次心跳无 ACK 视为连接已死，主动重连 */
    private val HEARTBEAT_MISS_THRESHOLD = 3
    private var consecutiveHeartbeatMisses = 0

    private val HEARTBEAT_ACK_TIMEOUT_MS = 10_000L

    private fun startHeartbeat() {
        stopHeartbeat()
        consecutiveHeartbeatMisses = 0
        heartbeatJob = scope.launch {
            while (isActive) {
                try {
                    val s = socket
                    if (s != null && s.connected()) {
                        // 使用带 ACK 的 emit 检测连接活性
                        val ackReceived = java.util.concurrent.atomic.AtomicBoolean(false)
                        s.emit(SocketEvents.LEASE_HEARTBEAT,
                            arrayOf(JSONObject().put("executionId", executionId)),
                            Ack {
                                ackReceived.set(true)
                                consecutiveHeartbeatMisses = 0
                                runtimeLogger.info(TAG, "Heartbeat ACK ok, exec=$executionId")
                                LogManager.saveLog(appContext, TAG,
                                    "Heartbeat ACK ok, exec=$executionId", executionId.toInt())
                            }
                        )
                        // 等待 ACK（最多 10 秒），收到后立即退出等待
                        withTimeoutOrNull(HEARTBEAT_ACK_TIMEOUT_MS) {
                            while (!ackReceived.get() && isActive) {
                                delay(200)
                            }
                        }
                        if (!ackReceived.get()) {
                            consecutiveHeartbeatMisses++
                            runtimeLogger.warn(TAG,
                                "Heartbeat ACK missed ($consecutiveHeartbeatMisses/$HEARTBEAT_MISS_THRESHOLD), exec=$executionId")
                            // 心跳失败时进行网络诊断
                            val pingBaiduResult = pingHost("www.baidu.com")
                            val pingServerResult = pingHost(ServerConstant.getURL())
                            LogManager.saveLog(appContext, TAG,
                                "Heartbeat ACK missed ($consecutiveHeartbeatMisses/$HEARTBEAT_MISS_THRESHOLD), " +
                                        "exec=$executionId | pingBaidu=$pingBaiduResult | pingServer=$pingServerResult",
                                executionId.toInt())
                            if (consecutiveHeartbeatMisses >= HEARTBEAT_MISS_THRESHOLD) {
                                runtimeLogger.warn(TAG,
                                    "Heartbeat dead, forcing reconnect for exec=$executionId")
                                // 强制断开让 Socket.IO 自动重连
                                s.disconnect()
                                consecutiveHeartbeatMisses = 0
                            }
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                    val pingBaiduResult = pingHost("www.baidu.com")
                    val pingServerResult = pingHost(ServerConstant.getURL())
                    runtimeLogger.warn(TAG, "Heartbeat emit error: ${e.message}")
                    LogManager.saveLog(appContext, TAG,
                        "Heartbeat emit error: exec=$executionId | message=${e.message} | " +
                                "localizedMessage=${e.localizedMessage} | pingBaidu=$pingBaiduResult | " +
                                "pingServer=$pingServerResult", executionId.toInt())
                }
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    /**
     * Ping 指定主机，用于心跳失败时的网络诊断。
     */
    private suspend fun pingHost(url: String): String = withContext(Dispatchers.IO) {
        val result = StringBuilder()
        try {
            val process = ProcessBuilder("ping", "-c", "4", url).start()
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                result.append(line).append("\n")
            }
            val exitCode = process.waitFor()
            if (exitCode != 0) {
                result.append("\nPing 异常退出，错误码: $exitCode")
            }
        } catch (e: Exception) {
            result.append("\n执行失败: ${e.message}")
        }
        result.toString()
    }

    fun disconnect() {
        stopHeartbeat()
        val s = socket
        socket = null
        // 先移除监听器，防止新事件进入；再断开 socket
        s?.off()
        s?.disconnect()
        _connectionState.value = ConnectionState.DISCONNECTED
        readySent = false
        // 使用 cancelChildren 而非 cancel，让 in-flight ACK 协程有机会完成
        scope.coroutineContext[Job]?.cancelChildren()
        runtimeLogger.info(TAG, "Disconnected and cleaned up exec=$executionId")
    }

    fun isConnected(): Boolean = socket?.connected() == true
}
