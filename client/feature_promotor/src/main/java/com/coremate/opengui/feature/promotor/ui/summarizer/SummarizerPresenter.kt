package com.coremate.opengui.feature.promotor.ui.summarizer

import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.task.UpdateTaskReq
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SummarizerPresenter(
    private val view: SummarizerActivity
) {

    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null

    init {
        apiService = RetrofitClient.create(view)
    }


    fun getTaskExecutionsSummarizer(executionId: Int) {
        coroutineScope.launch {
            runCatching {
                apiService?.getTaskExecutionsResult(executionId)
            }.onSuccess {
                LogManager.saveLog(view,"SummarizerPresenter","getTaskExecutionsSummarizer , ${it?.body()}",
                    TaskCenter.executionId?:-1)
                view.updateResultSummary(it?.body())
            }.onFailure {
                LogManager.saveLog(view,"SummarizerPresenter","getTaskExecutionsSummarizer , error = ${it.message}",
                    TaskCenter.executionId?:-1)
                it.printStackTrace()
            }
        }
    }

    fun updateTask(taskId: Int, bean: UpdateTaskReq) {
        coroutineScope.launch {
            runCatching {
                apiService?.updateTask(taskId, bean)
            }.onSuccess {
                if (it?.code() == 200) {
                    LogManager.saveLog(view,"SummarizerPresenter","updateTask , ${it?.body()}",
                        TaskCenter.executionId?:-1)
                    //TODO:test
//                    view.executeTask()
                }
                AutomationEventBus.publish(AutomationEvent.UpdateMyTask)
            }.onFailure {
                LogManager.saveLog(view,"SummarizerPresenter","updateTask,taskId = $taskId , error = ${it.message}",
                    TaskCenter.executionId?:-1)
                it.printStackTrace()
            }
        }
    }

    fun cancelTask(executionId: Int) {
        coroutineScope.launch {
            runCatching {
                apiService?.cancelExecution(executionId)
            }.onSuccess {
                LogManager.saveLog(view,"SummarizerPresenter",
                    "cancelTask initiated, summary will stream via WS, response=${it?.body()}",
                    TaskCenter.executionId?:-1)

            }.onFailure {
                LogManager.saveLog(view,"SummarizerPresenter","cancelTask,id = $executionId , error = ${it.message}",
                    TaskCenter.executionId?:-1)
                it.printStackTrace()

                getTaskExecutionsSummarizer(executionId)
            }
        }
    }
}
