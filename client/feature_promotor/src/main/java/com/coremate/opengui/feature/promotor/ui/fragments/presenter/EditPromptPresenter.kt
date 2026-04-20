package com.coremate.opengui.feature.promotor.ui.fragments.presenter

import android.content.Intent
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.ui.fragments.EditPromptFragment
import com.coremate.opengui.feature.promotor.ui.execute.PromptExecutionActivity
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.task.CreateTaskReq
import com.coremate.opengui.network.api.task.UpdateTaskReq
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class EditPromptPresenter(val view: EditPromptFragment) {
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null

    init {
        apiService = RetrofitClient.create(view.requireContext())
    }

    fun updateTask(taskId: Int?, prompt: String) {
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val bean = UpdateTaskReq(
                    null,
                    prompt,
                    null,
                    null
                )
                runCatching {
                    apiService?.updateTask(taskId, bean)
                }.onSuccess {
                    launch(Dispatchers.Main) {
                        TaskCenter.reset(view.requireContext(), "编辑任务弹窗 - 更新任务")
                        TaskCenter.taskId = it?.body()?.id
                        TaskCenter.taskTitle = it?.body()?.taskName
                        TaskCenter.taskPrompt = it?.body()?.taskDescription
                        view.updateTaskResult(true)
                    }
                }.onFailure {
                    it.printStackTrace()
                    view.updateTaskResult(false)
                }
            } catch (e: Exception) {
                e.printStackTrace()
                view.updateTaskResult(false)
            }
        }
    }

    fun createTask(title: String, prompt: String) {
        coroutineScope.launch(Dispatchers.IO) {
            val bean = CreateTaskReq(title, prompt, null, null)
            runCatching {
                apiService?.addCustomTask(bean)
            }.onSuccess {
                launch(Dispatchers.Main) {
                    TaskCenter.reset(view.requireContext(),"编辑任务弹窗 - 创建新任务")
                    TaskCenter.taskId = it?.body()?.id
                    TaskCenter.taskTitle = it?.body()?.taskName
                    TaskCenter.taskPrompt = it?.body()?.taskDescription
                    view.createTaskResult(true)
                }
            }.onFailure {
                it.printStackTrace()
                view.createTaskResult(false)
            }
        }
    }

    fun executeTask() {
        try {
            coroutineScope.launch(Dispatchers.Main) {
                val intent = Intent(view.requireContext(), PromptExecutionActivity::class.java)
                view.activity?.startActivity(intent)
                view.dismiss()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun createAndExecuteTask(title: String, prompt: String) {
        coroutineScope.launch(Dispatchers.IO) {
            val bean = CreateTaskReq(title, prompt, null, null)
            runCatching {
                apiService?.addCustomTask(bean)
            }.onSuccess {
                launch(Dispatchers.Main) {
                    TaskCenter.taskId = it?.body()?.id
                    TaskCenter.taskTitle = it?.body()?.taskName
                    TaskCenter.taskPrompt = it?.body()?.taskDescription
                    executeTask()
                }
            }.onFailure {
                it.printStackTrace()
                view.createTaskResult(false)
            }
        }
    }

    fun updateAndExecuteTask(taskId: Int, prompt: String) {
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val bean = UpdateTaskReq(
                    null,
                    prompt,
                    null,
                    null
                )
                runCatching {
                    apiService?.updateTask(taskId, bean)
                }.onSuccess {
                    launch(Dispatchers.Main) {
                        TaskCenter.reset(view.requireContext(),"编辑任务弹窗 - 更新任务")
                        TaskCenter.taskId = it?.body()?.id
                        TaskCenter.taskTitle = it?.body()?.taskName
                        TaskCenter.taskPrompt = it?.body()?.taskDescription
                        executeTask()
                    }
                }.onFailure {
                    it.printStackTrace()
                    view.updateTaskResult(false)
                }
            } catch (e: Exception) {
                e.printStackTrace()
                view.updateTaskResult(false)
            }
        }
    }
}