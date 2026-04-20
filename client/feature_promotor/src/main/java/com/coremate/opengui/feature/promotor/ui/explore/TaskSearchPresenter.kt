package com.coremate.opengui.feature.promotor.ui.explore

import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class TaskSearchPresenter (val view: ExploreFragment) {
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null

    init {
        apiService = RetrofitClient.create(view.requireContext())
    }

    fun getTaskTemplates() {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.getTaskTemplatesResp()
            }.onSuccess {
                view.updateTaskList(it?.body())
            }.onFailure {
                it.printStackTrace()
            }
        }
    }
}