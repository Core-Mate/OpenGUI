package com.coremate.opengui.feature.promotor.common

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.provider.Settings
import android.util.Log
import com.google.gson.Gson
import com.coremate.opengui.accessibility.actions.PressHomeAction
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.statistics.StatisticCustomError
import com.coremate.opengui.common.statistics.StatisticEvent
import com.coremate.opengui.common.statistics.StatisticsManager
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.feature.promotor.viewmodel.FinalStateEnum
import com.coremate.opengui.feature.promotor.viewmodel.MessageTypeEnum
import com.coremate.opengui.feature.promotor.viewmodel.Task
import com.coremate.opengui.feature.promotor.viewmodel.UIMessageBean
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common_jvm.event.StopReason
import com.coremate.opengui.feature.promotor.ui.AIFloatWindowManager
import com.coremate.opengui.feature.promotor.ui.execute.PromptExecutionActivity
import com.coremate.opengui.feature.promotor.ui.summarizer.SummarizerActivity
import com.coremate.opengui.feature.promotor.ui.window.TaskState
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.ServerConstant
import com.coremate.opengui.network.api.task.ExecuteTaskReq
import com.coremate.opengui.network.api.task.ResumeTaskReq
import com.coremate.opengui.common_jvm.interfaces.ActionHandler
import com.coremate.opengui.network.websocket.AgentStreamEvent
import com.coremate.opengui.network.websocket.ExecutionSocketManager
import com.tencent.mmkv.MMKV
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.atomic.AtomicBoolean


@SuppressLint("HardwareIds")
object MessageController {
    private val TAG = "MessageController"
    private var apiService: ApiService? = null
    private var messageUpdateCallback: MessageUpdateCallback? = null
    private var tabCheckCallback: TabCheckCallback? = null
    private var messageList = ArrayList<UIMessageBean>()
    private const val PAGE_SIZE = 20
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    var messagePageFlow = MutableStateFlow(1)
    private var actionHandler: ActionHandler? = null

    fun getActionHandler(): ActionHandler? = actionHandler
    private var executionSocketManager: ExecutionSocketManager? = null
    private var agentEventCollectionJob: Job? = null
    private var lifecycleCollectionJob: Job? = null
    private var token: String? = null
    private val _executionConnectState = MutableStateFlow<Boolean?>(false)
    val executionConnectState: StateFlow<Boolean?> = _executionConnectState.asStateFlow()
    const val SSE_TYPE_CONNECTED = 1
    const val SSE_TYPE_REASONING_START = 2
    const val SSE_TYPE_REASONING_DELTA = 3
    const val SSE_TYPE_REASONING_END = 4
    const val SSE_TYPE_TEXT_START = 5
    const val SSE_TYPE_TEXT_DELTA = 6
    const val SSE_TYPE_TEXT_END = 7
    const val SSE_TYPE_FINISH = 9


    const val UPDATE_MSG_FINAL_STATE = 11
    const val SSE_TYPE_TOOL_CALL = 12
    private var context: Context? = null
    private lateinit var deviceId: String
    private var callGuiAgentTag = false
    private var supervisorStarted = false
    private var periodicRequestJob: Job? = null
    private val isSending = AtomicBoolean(false)


    fun init(context: Context) {
        this.context = context
    }

    fun init(
        context: Context,
        actionHandler: ActionHandler,
        tabCheckCallback: TabCheckCallback,
    ) {
        MessageController.context = context.applicationContext
        deviceId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        )
        MessageController.tabCheckCallback = tabCheckCallback
        MessageController.actionHandler = actionHandler
        apiService = RetrofitClient.create(context)
        token = null
    }

    /**
     * Start collecting agent events from the ExecutionSocketManager.
     * This replaces the old SSE callback setup.
     */
    private fun startAgentEventCollection(execSocketManager: ExecutionSocketManager) {
        agentEventCollectionJob?.cancel()
        lifecycleCollectionJob?.cancel()
        agentEventCollectionJob = coroutineScope.launch {
            execSocketManager.agentEventFlow.collect { event ->
                try {
                    val type = event.type
                    val from = event.from
                    val extra = event.extra
                    val content = event.content
                    val taskExecutionId = event.taskExecutionId

                    // Ignore events not for the current execution
                    if (TaskCenter.executionId != taskExecutionId) {
                        LogManager.saveLog(
                            context ?: return@collect,
                            TAG,
                            "$TAG | agentEventFlow | Not the current message(expected=${TaskCenter.executionId}, got=$taskExecutionId)，return",
                            TaskCenter.executionId ?: -1
                        )
                        return@collect
                    }

                    // Update task state based on 'from' field
                    when (from) {
                        "plan_supervisor" -> TaskCenter.currentTaskState = TaskCenter.TaskState.PLAN
                        "executor" -> TaskCenter.currentTaskState = TaskCenter.TaskState.EXECUTE
                        "summarizer" -> TaskCenter.currentTaskState = TaskCenter.TaskState.SUMMARY
                        else -> TaskCenter.currentTaskState = TaskCenter.TaskState.NONE
                    }

                    when (type) {
                        "connected" -> {
                            TaskCenter.currentTaskState = TaskCenter.TaskState.PLAN
                            callGuiAgentTag = false
                            supervisorStarted = false
                            val taskId = event.taskExecutionId.toLong()
                            val subTask = Task(
                                id = null, type = "thought", content = "", taskState = null
                            )
                            val message = Message.obtain()
                            message.what = SSE_TYPE_CONNECTED
                            message.obj = UIMessageBean(
                                id = taskId,
                                content = "",
                                type = MessageTypeEnum.SERVER,
                                finalState = FinalStateEnum.THINKING,
                                summary = "",
                                subTask = mutableListOf(subTask)
                            )
                            handler.sendMessage(message)
                            _executionConnectState.value = true
                            val eventParams = mutableMapOf<String, Any>(
                                "PROCESS" to "Receive agent:event, type = $type, taskExecutionId = $taskExecutionId"
                            )
                            StatisticsManager.instance.onUploadEvent(
                                StatisticEvent.SSE_PROCESS_EVENT, eventParams
                            )
                        }

                        "reasoning-start" -> {
                            val message = Message.obtain()
                            message.what = SSE_TYPE_REASONING_START
                            handler.sendMessage(message)
                            val eventParams = mutableMapOf<String, Any>(
                                "PROCESS" to "Receive agent:event, type = $type, taskExecutionId = $taskExecutionId"
                            )
                            StatisticsManager.instance.onUploadEvent(
                                StatisticEvent.SSE_PROCESS_EVENT, eventParams
                            )
                        }

                        "reasoning-delta" -> {
                            if (!supervisorStarted && from == "plan_supervisor") {
                                supervisorStarted = true
                                phaseUpdateCallback?.onSupervisorStart()
                            }
                            val message = Message.obtain()
                            message.what = SSE_TYPE_REASONING_DELTA
                            message.obj = content
                            handler.sendMessage(message)
                        }

                        "reasoning-end" -> {
                            val message = Message.obtain()
                            message.what = SSE_TYPE_REASONING_END
                            handler.sendMessage(message)
                            val eventParams = mutableMapOf<String, Any>(
                                "PROCESS" to "Receive agent:event, type = $type, taskExecutionId = $taskExecutionId"
                            )
                            StatisticsManager.instance.onUploadEvent(
                                StatisticEvent.SSE_PROCESS_EVENT, eventParams
                            )
                        }

                        "text-start" -> {
                            if ("summarizer" == from) {
                                AutomationEventBus.publish(AutomationEvent.ReturnToPromotorApp)
                                val message = Message.obtain()
                                message.what = SSE_TYPE_TEXT_START
                                message.obj = JSONObject().apply {
                                    put("from", from)
                                    put("extra", event.extra)
                                }.toString()
                                handler.sendMessage(message)
                            }
                        }

                        "text-delta" -> {
                            if (!supervisorStarted && from == "plan_supervisor") {
                                supervisorStarted = true
                                phaseUpdateCallback?.onSupervisorStart()
                            }
                            val message = Message.obtain()
                            message.what = SSE_TYPE_TEXT_DELTA
                            // Build a JSON string matching old SSE format for handler compatibility
                            message.obj = JSONObject().apply {
                                put("content", content)
                                put("from", from)
                                put("extra", event.extra)
                            }.toString()
                            handler.sendMessage(message)
                        }

                        "text-end" -> {
                            val message = Message.obtain()
                            message.what = SSE_TYPE_TEXT_END
                            handler.sendMessage(message)
                            val eventParams = mutableMapOf<String, Any>(
                                "PROCESS" to "Receive agent:event, type = $type, taskExecutionId = $taskExecutionId"
                            )
                            StatisticsManager.instance.onUploadEvent(
                                StatisticEvent.SSE_PROCESS_EVENT, eventParams
                            )
                        }

                        "tool-call" -> {
                            if (from == "plan_supervisor") {
                                val toolName = try {
                                    JSONObject(content).optString("toolName", "")
                                } catch (e: Exception) {
                                    ""
                                }
                                if (toolName.isNotEmpty()) {
                                    val message = Message.obtain()
                                    message.what = SSE_TYPE_TOOL_CALL
                                    message.obj = toolName
                                    handler.sendMessage(message)
                                }
                            }
                        }

                        "call_gui_agent" -> {
                            if (!callGuiAgentTag) {
                                coroutineScope.launch {
                                    guiAgentCallback?.guiAgentCallback()
                                    callGuiAgentTag = true
                                    val pressHomeAction = PressHomeAction()
                                    pressHomeAction.perform()
                                    AIFloatWindowManager.getExecuteTaskWindow()
                                        ?.updateContent("Task running", "call_gui_agent")
                                    AIFloatWindowManager.getExecuteTaskWindow()
                                        ?.reset("call_gui_agent")
                                    AIFloatWindowManager.getExecuteTaskWindow()
                                        ?.show("call_gui_agent")
                                    AIFloatWindowManager.getExecuteTaskWindow()
                                        ?.startShrinkTimeDown("call_gui_agent")
                                    AIFloatWindowManager.getGradientWindow()
                                        ?.show("call_gui_agent")

                                }
                            }
                        }

                        "gui-action-thought" -> {
                            coroutineScope.launch {
                                AIFloatWindowManager.updateExecuteTaskWindow(content)
                            }
                        }

                        "finish" -> {
                            coroutineScope.launch {
                                try {
                                    when (from) {
                                        "summarizer" -> {
                                            summaryCallback?.updateResultSummary(
                                                "finish",
                                                "",
                                                true,
                                                event.extra as JSONObject
                                            )
                                        }

//                                        "plan_generator" -> {

//                                            SocketManager.connect("plan_generator - finish")
//                                            val pressHomeAction = PressHomeAction()
//                                            pressHomeAction.perform()
//                                            AIFloatWindowManager.getExecuteTaskWindow()
//                                                ?.setCurrentTaskState(TaskState.PLAYING)
//                                            AIFloatWindowManager.getSlideExpandWindow()
//                                                ?.updateContent("Task running")
//                                            TaskCenter.currentTaskState =
//                                                TaskCenter.TaskState.EXECUTE
//                                            AIFloatWindowManager.getExecuteTaskWindow()
//                                                ?.loopFakeOperation()
//                                        }
                                        "plan_supervisor" -> {
                                            phaseUpdateCallback?.onPlanningComplete()
                                            AIFloatWindowManager.getExecuteTaskWindow()
                                                ?.setCurrentTaskState(TaskState.PLAYING)
                                            AIFloatWindowManager.getSlideExpandWindow()
                                                ?.updateContent("Task running")
                                            TaskCenter.currentTaskState =
                                                TaskCenter.TaskState.EXECUTE
//                                            AIFloatWindowManager.getExecuteTaskWindow()
//                                                ?.loopFakeOperation()
                                        }

                                        else -> {
                                            AutomationEventBus.publish(AutomationEvent.ReturnToPromotorApp)
                                        }
                                    }
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }
                            }
                        }

                        "error" -> {
                            coroutineScope.launch {
                                AutomationEventBus.publish(AutomationEvent.Stopped(StopReason.COMPLETED))
                                AutomationEventBus.publish(AutomationEvent.ErrorReturnToPromotorApp)
                            }
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        // Collect execution lifecycle events (finish/error)
        lifecycleCollectionJob = coroutineScope.launch {
            launch {
                execSocketManager.executionFinished.collect {
                    val ctx = context ?: return@collect
                    LogManager.saveLog(
                        ctx, TAG,
                        "execution:finished received, exec=${TaskCenter.executionId}",
                        TaskCenter.executionId ?: -1
                    )
                    TaskCenter.executionId = null
                    TaskCenter.currentTaskState = TaskCenter.TaskState.NONE
                    AIFloatWindowManager.dismissAllWindow()
                    val msg = Message.obtain()
                    msg.what = SSE_TYPE_FINISH
                    handler.sendMessage(msg)
                    _executionConnectState.value = false
                    // Auto-cleanup socket when execution finishes
                    coroutineScope.launch { cleanupSocket() }
                }
            }
            launch {
                execSocketManager.executionError.collect { errorMessage ->
                    val ctx = context ?: return@collect
                    LogManager.saveLog(
                        ctx, TAG,
                        "execution:error received: $errorMessage, exec=${TaskCenter.executionId}",
                        TaskCenter.executionId ?: -1
                    )
                    TaskCenter.executionId = null
                    TaskCenter.currentTaskState = TaskCenter.TaskState.NONE
                    AutomationEventBus.publish(AutomationEvent.Stopped(StopReason.ERROR))
                    AutomationEventBus.publish(AutomationEvent.ErrorReturnToPromotorApp)
                    _executionConnectState.value = false
                    // Auto-cleanup socket when execution errors
                    coroutineScope.launch { cleanupSocket() }
                }
            }
        }
    }

    private var guiAgentCallback: PromptExecutionActivity.GuiAgentCallback? = null
    fun setGuiAgentCallback(callback: PromptExecutionActivity.GuiAgentCallback) {
        guiAgentCallback = callback
    }

    private var phaseUpdateCallback: PhaseUpdateCallback? = null
    fun setPhaseUpdateCallback(callback: PhaseUpdateCallback) {
        phaseUpdateCallback = callback
    }

    fun setOnHistoryDataListener(listener: OnHistoryDataListener) {
        historyDataListeners.add(listener)
    }

    private val historyDataListeners: MutableList<OnHistoryDataListener> =
        mutableListOf<OnHistoryDataListener>()

    private fun updateLastMessageFinalState(state: FinalStateEnum) {
        messageUpdateCallback?.updateLastMessageFinalState(state)
    }

    private fun updateThoughtContent(content: String) {
        messageUpdateCallback?.updateLastMessageThought(content)
    }

    private fun updateSummaryContent(debugFrom: String, content: String, extra: JSONObject) {
        summaryCallback?.updateResultSummary(debugFrom, content, false, extra)
    }

    private fun addNewMessageToList(msg: UIMessageBean) {
        messageUpdateCallback?.addNewMessage(msg)
    }

    suspend fun sendMessage() {
        sendMessage("")
    }

    fun sendMessage(tag: String) {

        if (!isSending.compareAndSet(false, true)) {
            Log.d(TAG, "sendMessage: already sending, skipping duplicate call")
            return
        }
        TaskCenter.isSummarizing = false
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val currentTaskId = TaskCenter.taskId
                if (currentTaskId == null) {
                    val ctx = context ?: return@launch
                    LogManager.saveLog(
                        ctx,
                        "MessageController",
                        "MessageController | sendMessage | executeTask was not started: TaskCenter.taskId == null",
                        TaskCenter.executionId ?: -1
                    )
                    cleanupSocket()
                    return@launch
                }
                val ctx = context ?: return@launch
                LogManager.saveLog(
                    ctx,
                    "MessageController",
                    "MessageController | sendMessage | message sent |id = ${TaskCenter.taskId} | prompt = ${TaskCenter.taskTitle}",
                    TaskCenter.executionId ?: -1
                )
                runCatching {
                    apiService?.executeTask(
                        TaskCenter.taskId!!,
                        ExecuteTaskReq(deviceId, null, null, null)
                    )
                }.onSuccess {
                    if (it?.body() != null && it.body()!!.success) {
                        TaskCenter.executionId = it.body()!!.executionId
                        AIFloatWindowManager.getExecuteTaskWindow()
                            ?.setCurrentTaskState(TaskState.PLAYING)

                        // Connect per-execution WebSocket (replaces old SSE + shared socket)
                        val execId = it.body()!!.executionId?.toLong() ?: return@onSuccess
                        val currentActionHandler = actionHandler
                        if (currentActionHandler != null) {
                            connectExecutionSocket(execId, currentActionHandler)
                        }

                        LogManager.saveLog(
                            ctx,
                            "MessageController",
                            "MessageController | sendMessage | ${TaskCenter.taskTitle} sent successfully |executionId = ${it?.body()?.executionId} ",
                            TaskCenter.executionId ?: -1
                        )
                    }
                }.onFailure {
                    it.printStackTrace()
                    LogManager.saveLog(
                        ctx,
                        "MessageController",
                        "MessageController | sendMessage | ${TaskCenter.taskTitle} send failed | message = ${it.message} | localizedMessage = ${it.localizedMessage}",
                        TaskCenter.executionId ?: -1
                    )
                    StatisticsManager.instance.onUploadException(
                        StatisticCustomError.API_ERR, it.message ?: "message send API error"
                    )
                }
            } finally {
                isSending.set(false)
            }
        }
    }

    /**
     * Create and connect the per-execution WebSocket after executeTask
     * returns an executionId.
     */
    fun connectExecutionSocket(executionId: Long, actionHandler: ActionHandler) {
        val serverUrl = ServerConstant.getURL()
        val currentToken = token ?: ""

        agentEventCollectionJob?.cancel()
        agentEventCollectionJob = null
        lifecycleCollectionJob?.cancel()
        lifecycleCollectionJob = null
        executionSocketManager?.disconnect()
        executionSocketManager = null
        messageList.clear()
        val appCtx = context ?: return
        val execSocket = ExecutionSocketManager(
            executionId = executionId,
            serverUrl = serverUrl,
            token = currentToken,
            actionHandler = actionHandler,
            appContext = appCtx
        )
        executionSocketManager = execSocket
        startAgentEventCollection(execSocket)
        execSocket.connect()
    }

    fun pauseTask() {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.newPauseTask(TaskCenter.executionId)
            }.onSuccess {
                Log.d("TAG", "pauseTask: ------->${Gson().toJson(it?.body())}")
            }.onFailure {
                it.printStackTrace()
            }
        }
    }


    fun resumeTask(message: String?) {
        coroutineScope.launch(Dispatchers.IO) {
            kotlin.runCatching {
                apiService?.newResumeTask(ResumeTaskReq(message), TaskCenter.executionId)
            }.onSuccess {
                Log.d("TAG", "resumeTask: ------->${Gson().toJson(it?.body())}")

                if (it?.isSuccessful != true) {
                    Log.w("TAG", "resumeTask: HTTP error ${it?.code()}")
                    return@onSuccess
                }
                // Reconnect socket if disconnected during pause
                if (executionSocketManager?.isConnected() != true) {
                    val execId = TaskCenter.executionId?.toLong() ?: return@onSuccess
                    val currentActionHandler = actionHandler ?: return@onSuccess
                    connectExecutionSocket(execId, currentActionHandler)
                }
            }.onFailure {
                it.printStackTrace()
            }
        }
    }

    fun setMessageUpdateCallback(callback: MessageUpdateCallback) {
        messageUpdateCallback = callback
    }

    fun stopAutomationTask(from: String, onComplete: (() -> Unit)? = null) {

        val targetExecId = TaskCenter.executionId?.toLong()
        coroutineScope.launch(Dispatchers.IO) {
            val ctx = context
            // Cancel API now returns immediately (async cancel).
            // Socket stays alive so WS can stream the summary to SummarizerActivity.
            // Socket will be auto-cleaned up when server sends execution:finished,
            // or manually by SummarizerActivity/cancelNetConnection.
            runCatching {
                apiService?.cancelExecution(TaskCenter.executionId)
            }.onSuccess {
                if (ctx != null) {
                    LogManager.saveLog(
                        ctx,
                        "MessageController",
                        "MessageController | stopAutomationTask | cancel started (async)，from = $from, code = ${it?.code()}  body = ${it?.body()}",
                        TaskCenter.executionId ?: -1
                    )
                }
                val eventParams = mutableMapOf<String, Any>(
                    "URL_REQ" to "MessageController | stopAutomationTask | cancel started (async)，from = $from, code = ${it?.code()}  body = ${it?.body()}"
                )
                StatisticsManager.instance.onUploadEvent(StatisticEvent.URL_REQUEST, eventParams)
                AIFloatWindowManager.dismissAllWindow()
                _executionConnectState.value = false
                val msg = Message.obtain()
                msg.what = UPDATE_MSG_FINAL_STATE
                msg.obj = FinalStateEnum.INTERRUPT
                handler.sendMessage(msg)
            }.onFailure {
                it.printStackTrace()
                if (ctx != null) {
                    LogManager.saveLog(
                        ctx,
                        "MessageController",
                        "MessageController | stopAutomationTask | stop task API call failed，${it.message}",
                        TaskCenter.executionId ?: -1
                    )
                }
                StatisticsManager.instance.onUploadException(
                    StatisticCustomError.API_ERR, it.message ?: "cancel task API error"
                )
                AIFloatWindowManager.dismissAllWindow()
                _executionConnectState.value = false
                val msg = Message.obtain()
                msg.what = UPDATE_MSG_FINAL_STATE
                msg.obj = FinalStateEnum.INTERRUPT
                handler.sendMessage(msg)

                cleanupSocket(targetExecId)
            }
            onComplete?.invoke()
        }
    }

    /**
     * No-op: Heartbeat is now handled inside ExecutionSocketManager via lease:heartbeat.
     */
    fun startHeartBeatRequest(context: Context) {
        // Heartbeat is managed by ExecutionSocketManager
    }

    /**
     * No-op: Heartbeat is now handled inside ExecutionSocketManager via lease:heartbeat.
     */
    fun stopHeartBeatRequest() {
        // Heartbeat is managed by ExecutionSocketManager
    }

    /**
     * @deprecated Heartbeat is now handled inside ExecutionSocketManager
     */
    fun sendHeartbeat(context: Context) {
        // No-op: heartbeat is managed by ExecutionSocketManager
    }

    suspend fun pingBaidu(url: String): String = withContext(Dispatchers.IO) {
        val result = StringBuilder()
        try {
            val process = ProcessBuilder("ping", "-c", "4", url).start()
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                result.append(line).append("\n")
            }
            Log.d(TAG, "pingBaidu$result")
            val exitCode = process.waitFor()
            if (exitCode != 0) {
                result.append("\nPing exited abnormally, error code: $exitCode")
            }
        } catch (e: Exception) {
            result.append("\nExecution Failed: ${e.message}")
        }
        result.toString()
    }

    fun cancelAndGotoSummarizer() {
        val ctx = context ?: return
        val intent = Intent(ctx, SummarizerActivity::class.java)
        intent.putExtra("from", "CancelTask")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
    }

    fun cancelNetConnection(from: String) {
        val ctx = context
        if (ctx != null) {
            LogManager.saveLog(
                ctx,
                "MessageController",
                "MessageController | close network connection | from = $from",
                TaskCenter.executionId ?: -1
            )
        }
        // Disconnect per-execution WebSocket
        cleanupSocket()
    }

    /**
     * Detach UI callbacks when Activity is destroyed.
     * Socket and lifecycle collection stay alive for background execution.
     * Socket cleanup happens automatically on execution finish/error,
     * or explicitly via stopAutomationTask() on user cancel.
     */
    fun detachUI() {
        val ctx = context
        if (ctx != null) {
            LogManager.saveLog(
                ctx,
                "MessageController",
                "MessageController | detachUI | detach UI callback and keep socket connected",
                TaskCenter.executionId ?: -1
            )
        }
        messageUpdateCallback = null
        guiAgentCallback = null
        phaseUpdateCallback = null
        summaryCallback = null
        tabCheckCallback = null
        historyDataListeners.clear()
    }

    /**
     * Clean up socket and all collection jobs.
     *
     */
    private fun cleanupSocket(forExecutionId: Long? = null) {
        val currentExecId = executionSocketManager?.executionId
        if (forExecutionId != null && currentExecId != null && currentExecId != forExecutionId) {
            val ctx = context
            if (ctx != null) {
                LogManager.saveLog(
                    ctx, TAG,
                    "cleanupSocket skipped: target=$forExecutionId but current socket belongs to $currentExecId",
                    TaskCenter.executionId ?: -1
                )
            }
            return
        }
        executionSocketManager?.disconnect()
        executionSocketManager = null
        agentEventCollectionJob?.cancel()
        agentEventCollectionJob = null
        lifecycleCollectionJob?.cancel()
        lifecycleCollectionJob = null
    }

    /**
     * Check if there's an active socket connection for the current execution.
     */
    fun hasActiveSocket(): Boolean = executionSocketManager?.isConnected() == true

    private var isBackground = false;

    fun setBackgroundStatus(isBackground: Boolean) {
        MessageController.isBackground = isBackground
    }

    fun getBackgroundStatus(): Boolean {
        return isBackground
    }

    private var handler: Handler = object : Handler(Looper.getMainLooper()) {
        override fun handleMessage(msg: Message) {
            super.handleMessage(msg)
            when (msg.what) {
                SSE_TYPE_CONNECTED -> {
                    val message = msg.obj as UIMessageBean
                    addNewMessageToList(message)
                }

                SSE_TYPE_REASONING_START -> {
                    updateThoughtContent("\n\n")
                }

                SSE_TYPE_REASONING_DELTA -> {
                    val content = msg.obj as String
                    updateThoughtContent(content)
                }

                SSE_TYPE_REASONING_END -> {
                    updateThoughtContent("\n")
                }

                SSE_TYPE_TEXT_START -> {
                    try {
                        val data = msg.obj as String
                        val jsonObject = JSONObject(data)
                        val from = jsonObject.optString("from")
                        val extra = jsonObject.optJSONObject("extra")
                        if (from.equals("summarizer")) {
                            updateSummaryContent("start", "", extra)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                SSE_TYPE_TEXT_DELTA -> {
                    val data = msg.obj as String
                    val jsonObject = JSONObject(data)
                    val content = jsonObject.optString("content")
                    val from = jsonObject.optString("from")
                    val extra = jsonObject.optJSONObject("extra")
                    if (from.equals("summarizer")) {
                        updateSummaryContent("delta", content, extra)
                    } else {
                        updateThoughtContent(content)
                    }
                }

                SSE_TYPE_TEXT_END -> {
                    updateThoughtContent("\n")
                }

                SSE_TYPE_TOOL_CALL -> {
                    val toolName = msg.obj as String
                    phaseUpdateCallback?.onToolCall(toolName)
                }

                SSE_TYPE_FINISH -> {
                    AIFloatWindowManager.dismissAllWindow()
                    updateLastMessageFinalState(FinalStateEnum.TASK_SUCCESS)
                    // Execution socket cleanup is handled by stopAutomationTask / cancelNetConnection
                }

                UPDATE_MSG_FINAL_STATE -> {
                    updateLastMessageFinalState(msg.obj as FinalStateEnum)
                }
            }
        }
    }

    private var summaryCallback: SummaryCallback? = null

    fun setSummaryCallback(callback: SummaryCallback) {
        this.summaryCallback = callback
    }

    interface MessageUpdateCallback {
        fun addNewMessage(chatMessages: UIMessageBean)
        fun updateLastMessageThought(content: String)
        fun updateLastMessageSummary(content: String)
        fun updateLastMessageFinalState(state: FinalStateEnum)
    }

    interface SummaryCallback {
        fun updateResultSummary(
            debugFrom: String,
            summary: String?,
            isFinish: Boolean,
            extra: JSONObject?
        )
    }


    /**
     */
    interface TabCheckCallback {
        fun onCheck(tabIndex: Int)
    }

    /**
     */
    interface OnHistoryDataListener {
        fun listener(dataList: ArrayList<UIMessageBean>)
    }

    interface PhaseUpdateCallback {
        fun onSupervisorStart()
        fun onToolCall(toolName: String)
        fun onPlanningComplete()
    }
}