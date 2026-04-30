package com.coremate.opengui.feature.promotor.ui.task

import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.task.CreateTaskReq
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MyTaskPresenter(val view: MyTaskFragment) {
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null

    init {
        apiService = RetrofitClient.create(view.requireContext())
    }

    fun getTasks(
        page: Int,
        pageSize: Int,
        category: String?,
        platform: String?,
        keyword: String?,
        isLoadMore: Boolean = false
    ) {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.getMyTask(page, pageSize, category, platform, keyword)
            }.onSuccess {
                if (it?.body()?.items?.isEmpty() == true) {
                    view.updateTaskList(emptyList(), isLoadMore, true)
                } else {
                    view.updateTaskList(it?.body()?.items, isLoadMore, false)
                }
            }.onFailure {
                it.printStackTrace()
                view.updateTaskList(null, isLoadMore, false)
            }
        }
    }

    fun deleteTask(taskId: Int, callback: DeleteTaskCallback) {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.deleteTask(taskId)
            }.onSuccess {
                if (it?.body()?.success == true) {
                    callback.callback(true)
                } else {
                    callback.callback(false)
                }
            }.onFailure {
                it.printStackTrace()
                callback.callback(false)
            }
        }
    }

    fun searchTask(key: String) {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.getMyTask(1, 200, null, null, key)
            }.onSuccess {
                if (it?.body()?.items?.isEmpty() != true) {
                    view.updateSearchResult(it?.body()?.items)
                }
            }.onFailure {
                it.printStackTrace()
                view.updateSearchResult(null)
            }
        }
    }

    interface DeleteTaskCallback {
        fun callback(success: Boolean)
    }

    fun addCustomTask() {
        val list = ArrayList<CreateTaskReq>()
        val bean1 = CreateTaskReq(
            "Find tenants on Xiaohongshu",
            "Open Xiaohongshu, find recent posts from people looking to rent in Shanghai, skip agents, and leave friendly comments on 5 different suitable posts saying I have some good rental options they can check out.",
            null,
            null
        )
        val bean2 = CreateTaskReq(
            "Find potential fitness students on Xiaohongshu",
            "Open Xiaohongshu, find 10 people in Shanghai who may need fitness coaching, and send a short DM inviting them to follow me for regular personal training tips.",
            null,
            null
        )
        val bean3 = CreateTaskReq(
            "Reply to Feishu group messages",
            "Open Feishu, check the company group for messages that need a reply, and respond with useful context if needed.",
            null,
            null
        )
        val bean4 = CreateTaskReq(
            "Invite a partner on WeChat",
            "Open WeChat, find Xu Zhenzhen, and send a message reminding them to schedule time with Meng tonight.",
            null,
            null
        )
        val bean5 = CreateTaskReq(
            "Find suitable people on Douyin to promote the app",
            "Open Douyin, search for Shanghai people looking for companions or groups, leave natural comments recommending Soul from a user perspective, and reply to 3 relevant posts.",
            null,
            null
        )
        list.add(bean1)
        list.add(bean2)
        list.add(bean3)
        list.add(bean4)
        list.add(bean5)
        coroutineScope.launch(Dispatchers.IO) {
            list.forEach {
                runCatching {
                    apiService?.addCustomTask(it)
                }.onSuccess {
                }.onFailure {
                    it.printStackTrace()
                }
            }

            getTasks(1, 20, null, null, null, false)
        }
    }
}