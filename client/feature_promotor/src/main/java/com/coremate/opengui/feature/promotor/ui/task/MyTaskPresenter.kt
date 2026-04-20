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
            "在小红书寻找租客",
            "打开小红书，帮我找到在上海需要租房的人，筛选最新的帖子（找到例如租房交流、求租等），向下滚动前20页，确认发帖人的身份看到像是中介的忽略，如果是用户本人（比如主页没有其他房源，或者没有生活信息的）评论留言5条给不同的帖子，表示我这里有些不错的房子在租，符合需求，可以试试",
            null,
            null
        )
        val bean2 = CreateTaskReq(
            "在小红书帮我找潜在的健身学员",
            "打开小红书，帮我找到在上海对健身有需求的人，给他们发私信说可以关注我，会定期推送一些健身私教课，找10个人",
            null,
            null
        )
        val bean3 = CreateTaskReq(
            "回复飞书群消息",
            "打开飞书，帮我在代码一行的全员群里看下有没有待回复消息，有的话回下消息，多说一些情况",
            null,
            null
        )
        val bean4 = CreateTaskReq(
            "在微信邀约合作伙伴",
            "打开微信，找到徐珍珍，发条消息说记得晚上约下孟总时间",
            null,
            null
        )
        val bean5 = CreateTaskReq(
            "在抖音找到合适的人推广APP",
            "打开抖音，找到上海需要找搭子的人（比如搜索上海组队剧本杀之类），在内容下评论说可以看看“soul”这个产品，从用户角度暗示这个很好用，然后下滑继续找类似的内容，回复3个",
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