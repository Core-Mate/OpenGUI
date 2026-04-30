package com.coremate.opengui.network.websocket

import android.content.Context
import android.provider.Settings
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.network.api.ServerConstant
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.json.JSONObject

/**
 *
 */
class StandbySocketManager(
    private val appContext: Context,
) {
    private val TAG = "StandbySocketMgr"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var socket: Socket? = null
    private var heartbeatJob: Job? = null

    enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED, ERROR }

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    data class DispatchPayload(
        val executionId: Int,
        val taskId: Int,
        val taskName: String,
    )

    private val _dispatchFlow = MutableSharedFlow<DispatchPayload>(extraBufferCapacity = 4)
    val dispatchFlow: SharedFlow<DispatchPayload> = _dispatchFlow.asSharedFlow()

    private val deviceId: String by lazy {
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
    }

    private val deviceName: String by lazy {
        "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
    }

    fun connect() {
        try {
            val serverUrl = ServerConstant.getURL()
            val opts = IO.Options().apply {
                reconnection = true
                transports = arrayOf("websocket", "polling")
                reconnectionAttempts = Int.MAX_VALUE
                reconnectionDelay = 1000L
                reconnectionDelayMax = 30000L
                timeout = 20000L
                auth = mutableMapOf(
                    "deviceId" to deviceId
                )
            }

            socket = IO.socket("$serverUrl/standby", opts)
            setupListeners()
            _connectionState.value = ConnectionState.CONNECTING
            socket?.connect()
            LogManager.saveLog(appContext, TAG, "Connecting to standby...", -1)
        } catch (e: Exception) {
            e.printStackTrace()
            _connectionState.value = ConnectionState.ERROR
        }
    }

    fun disconnect() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        socket?.off()
        socket?.disconnect()
        socket = null
        _connectionState.value = ConnectionState.DISCONNECTED
        LogManager.saveLog(appContext, TAG, "Disconnected from standby", -1)
    }

    /**
     */
    fun reconnect() {
        disconnect()
        connect()
    }

    private fun setupListeners() {
        socket?.on(Socket.EVENT_CONNECT) {
            _connectionState.value = ConnectionState.CONNECTED
            LogManager.saveLog(appContext, TAG, "Connected to standby, socketId=${socket?.id()}", -1)


            socket?.emit(
                SocketEvents.STANDBY_REGISTER,
                JSONObject().apply {
                    put("deviceId", deviceId)
                    put("deviceName", deviceName)
                }
            )


            startHeartbeat()
        }

        socket?.on(Socket.EVENT_DISCONNECT) { args ->
            _connectionState.value = ConnectionState.DISCONNECTED
            val reason = args.getOrNull(0)?.toString() ?: "unknown"
            LogManager.saveLog(appContext, TAG, "Disconnected from standby: $reason", -1)
            heartbeatJob?.cancel()
        }

        socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
            _connectionState.value = ConnectionState.ERROR
            val error = args.getOrNull(0)?.toString() ?: "unknown"
            LogManager.saveLog(appContext, TAG, "Standby connect error: $error", -1)
        }


        socket?.on(SocketEvents.STANDBY_DISPATCH) { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val payload = DispatchPayload(
                executionId = data.optInt("executionId", -1),
                taskId = data.optInt("taskId", -1),
                taskName = data.optString("taskName", ""),
            )
            if (payload.executionId > 0) {
                LogManager.saveLog(appContext, TAG,
                    "Received dispatch: execution=${payload.executionId}, task=${payload.taskName}", -1)
                _dispatchFlow.tryEmit(payload)
            }
        }
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(30_000)
                socket?.emit(
                    SocketEvents.STANDBY_HEARTBEAT,
                    JSONObject().put("deviceId", deviceId)
                )
            }
        }
    }
}
