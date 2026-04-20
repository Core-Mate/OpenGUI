package com.coremate.opengui.feature.promotor.ui.preview

import android.content.Context
import android.content.Intent
import android.widget.Toast
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.ui.execute.PromptExecutionActivity
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.task.CreateTaskReq
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class PreviewPresenter(context: Context) {
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null

    init {
        apiService = RetrofitClient.create(context)
    }

    fun saveTask(context: Context, title: String?, prompt: String?) {
        coroutineScope.launch(Dispatchers.IO) {
            val bean = CreateTaskReq(title!!, prompt!!, null, null)
            runCatching {
                apiService?.addCustomTask(bean)
            }.onSuccess {
                launch(Dispatchers.Main) {
                    Toast.makeText(context, "保存任务成功", Toast.LENGTH_SHORT).show()
                }
            }.onFailure {
                it.printStackTrace()
                launch(Dispatchers.Main) {
                    Toast.makeText(context, "保存任务失败", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    fun saveTask(context: Context, title: String?, prompt: String?,callback: (Boolean) -> Unit) {
        coroutineScope.launch(Dispatchers.IO) {
            val bean = CreateTaskReq(title!!, prompt!!, null, null)
            runCatching {
                apiService?.addCustomTask(bean)
            }.onSuccess {
                launch(Dispatchers.Main) {
                    Toast.makeText(context, "保存任务成功", Toast.LENGTH_SHORT).show()
                    callback(true)
                }
            }.onFailure {
                it.printStackTrace()
                launch(Dispatchers.Main) {
                    Toast.makeText(context, "保存任务失败", Toast.LENGTH_SHORT).show()
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
                    TaskCenter.reset(context,"任务广场 - 列表 - 预览")
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
                    Toast.makeText(context, "保存任务失败", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}