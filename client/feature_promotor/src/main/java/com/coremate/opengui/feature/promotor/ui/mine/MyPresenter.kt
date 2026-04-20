package com.coremate.opengui.feature.promotor.ui.mine

import com.coremate.opengui.common.utils.AndroidLogger
import com.coremate.opengui.common_jvm.utils.Logger
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MyPresenter(val view: MyFragment) {
    companion object {
        private const val TAG = "MyPresenter"
    }

    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val runtimeLogger: Logger = AndroidLogger()
    private var apiService: ApiService? = null

    init {
        apiService = RetrofitClient.create(view.requireContext())
    }

    fun getMyBalance(source: String = "unknown") {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.getUserBalance()
            }.onSuccess { response ->
                if (response == null) {
                    runtimeLogger.warn(TAG, "getMyBalance[$source] response is null")
                    return@onSuccess
                }

                if (response.isSuccessful) {
                    val body = response.body()
                    runtimeLogger.info(
                        TAG,
                        "getMyBalance[$source] success: code=${response.code()}, remaining=${body?.remaining}, isCheckin=${body?.isCheckin}, checkinCredit=${body?.checkinCredit}"
                    )
                    view.updateBalance(body)
                } else {
                    runtimeLogger.warn(
                        TAG,
                        "getMyBalance[$source] failed: code=${response.code()}, message=${response.message()}"
                    )
                }
            }.onFailure { throwable ->
                runtimeLogger.error(
                    TAG,
                    "getMyBalance[$source] exception: ${throwable.message}",
                    throwable
                )
            }
        }
    }

    fun onCheckin() {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.userCheckin()
            }.onSuccess { response ->
                if (response == null) {
                    runtimeLogger.warn(TAG, "onCheckin response is null")
                    view.onCheckinErr()
                    return@onSuccess
                }

                if (response.isSuccessful) {
                    val body = response.body()
                    runtimeLogger.info(
                        TAG,
                        "onCheckin success: code=${response.code()}, isCheckin=${body?.isCheckin}, getCredit=${body?.getCredit}, remaining=${body?.remaining}"
                    )
                    view.onCheckinSuc(body)
                } else {
                    runtimeLogger.warn(
                        TAG,
                        "onCheckin failed: code=${response.code()}, message=${response.message()}"
                    )
                    view.onCheckinErr()
                }
            }.onFailure { throwable ->
                view.onCheckinErr()
                runtimeLogger.error(
                    TAG,
                    "onCheckin exception: ${throwable.message}",
                    throwable
                )
            }
        }
    }
}
