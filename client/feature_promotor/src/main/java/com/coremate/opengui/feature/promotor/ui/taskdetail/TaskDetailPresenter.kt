package com.coremate.opengui.feature.promotor.ui.taskdetail

import android.content.Context
import android.content.Intent
import android.widget.Toast
import com.google.gson.Gson
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.ui.execute.PromptExecutionActivity
import com.coremate.opengui.feature.promotor.ui.preview.PreviewSquareTaskActivity
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.task.CreateTaskReq
import com.coremate.opengui.network.api.task.TaskTemplatesResp
import com.coremate.opengui.network.api.task.UpdateTaskReq
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class TaskDetailPresenter(private val context: Context) {
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null
    private val TAG = "TaskDetailPresenter"

    init {
        apiService = RetrofitClient.create(context)
    }

    fun getTaskHistory(taskId: Int?, view: TaskDetailActivity) {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.getTaskExecuteHistory(taskId)
            }.onSuccess {
                view.updateTaskHistory(it?.body()?.items)
            }.onFailure {
                it.printStackTrace()
            }
        }
    }

    fun updateTask(taskId: Int?, title: String, prompt: String, view: TaskDetailActivity) {
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val bean = UpdateTaskReq(
                    title,
                    prompt,
                    null,
                    null
                )
                runCatching {
                    apiService?.updateTask(taskId, bean)
                }.onSuccess {
                    launch(Dispatchers.Main) {
                        view.updateTaskResult(true, it?.body())
                    }
                }.onFailure {
                    it.printStackTrace()
                    view.updateTaskResult(false, null)
                }
            } catch (e: Exception) {
                e.printStackTrace()
                view.updateTaskResult(false, null)
            }
        }
    }

    /**
     */
    fun updateTaskOnly(
        taskId: Int?,
        title: String,
        prompt: String,
        callback: (TaskTemplatesResp?) -> Unit
    ) {
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val bean = UpdateTaskReq(title, prompt, null, null)
                runCatching {
                    apiService?.updateTask(taskId, bean)
                }.onSuccess {
                    launch(Dispatchers.Main) {
                        callback(it?.body())
                    }
                }.onFailure {
                    it.printStackTrace()
                    launch(Dispatchers.Main) {
                        callback(null)
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                launch(Dispatchers.Main) {
                    callback(null)
                }
            }
        }
    }

    fun deleteTask(taskId: Int?, callback: (Boolean) -> Unit) {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.deleteTask(taskId)
            }.onSuccess {
                launch(Dispatchers.Main) {
                    callback(it?.body()?.success == true)
                }
            }.onFailure {
                it.printStackTrace()
                launch(Dispatchers.Main) {
                    callback(false)
                }
            }
        }
    }

    fun saveTask(context: Context, title: String?, prompt: String?) {
        coroutineScope.launch(Dispatchers.IO) {
            val bean = CreateTaskReq(title!!, prompt!!, null, null)
            runCatching {
                apiService?.addCustomTask(bean)
            }.onSuccess {
                launch(Dispatchers.Main) {
                    Toast.makeText(context, "Task saved", Toast.LENGTH_SHORT).show()
                }
            }.onFailure {
                it.printStackTrace()
                launch(Dispatchers.Main) {
                    Toast.makeText(context, "Failed to save task", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    fun saveTask(context: Context, title: String?, prompt: String?, callback: (Boolean) -> Unit) {
        coroutineScope.launch(Dispatchers.IO) {
            val bean = CreateTaskReq(title!!, prompt!!, null, null)
            runCatching {
                apiService?.addCustomTask(bean)
            }.onSuccess {
                launch(Dispatchers.Main) {
                    Toast.makeText(context, "Task saved", Toast.LENGTH_SHORT).show()
                    callback(true)
                }
            }.onFailure {
                it.printStackTrace()
                launch(Dispatchers.Main) {
                    Toast.makeText(context, "Failed to save task", Toast.LENGTH_SHORT).show()
                    callback(false)
                }
            }
        }
    }

    fun executeTask(context: Context, title: String?, prompt: String?) {
        coroutineScope.launch(Dispatchers.IO) {
            val bean = CreateTaskReq(title!!, prompt!!, null, null)
            runCatching {
                apiService?.addCustomTask(bean)
            }.onSuccess {
                launch(Dispatchers.Main) {
                    TaskCenter.reset(context,"Task Square - List - Preview")
                    TaskCenter.taskId = it?.body()?.id
                    TaskCenter.taskTitle = it?.body()?.taskName
                    TaskCenter.taskPrompt = it?.body()?.taskDescription
                    val intent = Intent(context, PromptExecutionActivity::class.java)
                    context.startActivity(intent)
                    (context as PreviewSquareTaskActivity).finish()
                }
            }.onFailure {
                it.printStackTrace()
                launch(Dispatchers.Main) {
                    Toast.makeText(context, "Failed to save task", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}