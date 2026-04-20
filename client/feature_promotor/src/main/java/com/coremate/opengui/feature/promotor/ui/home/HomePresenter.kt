package com.coremate.opengui.feature.promotor.ui.home

import android.content.Context
import android.util.Log
import com.coremate.opengui.common.config.AppConfigManager
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class HomePresenter(private val context: Context) {
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null

    init {
        apiService = RetrofitClient.create(context)
    }

    fun loadAppConfig(view: HomeActivity) {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.loadAppConfig()
            }.onSuccess {
                if(it?.code() == 200){
                    Log.d("TAG", "e: ${it.body()}")
                    AppConfigManager.instance.updateConfig(it.body()?.data)
                }
            }.onFailure {
                it.printStackTrace()
            }
        }
    }
}