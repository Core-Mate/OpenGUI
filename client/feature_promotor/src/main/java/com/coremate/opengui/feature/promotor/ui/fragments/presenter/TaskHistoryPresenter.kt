package com.coremate.opengui.feature.promotor.ui.fragments.presenter

import com.coremate.opengui.feature.promotor.ui.fragments.TaskHistoryFragment
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class TaskHistoryPresenter(val view: TaskHistoryFragment) {
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null

    init {
        apiService = RetrofitClient.create(view.requireContext())
    }

    fun getTaskHistory(id:Int?) {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.getTaskExecuteHistory(id)
            }.onSuccess {
                view.updateHistoryList(it?.body())
            }.onFailure {
                it.printStackTrace()
            }
        }
    }


}