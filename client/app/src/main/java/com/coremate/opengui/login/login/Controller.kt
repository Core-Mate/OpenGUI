package com.coremate.opengui.login.login

import android.content.Context
import com.coremate.opengui.login.login.fragment.VerificationCodeFragment
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.login.VerifyCodeRequestBean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class Controller(context: Context) {

    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null

    init {
        apiService = RetrofitClient.create(context)
    }

    fun verifyCode(phone: String, code: String, aff: String, view: VerificationCodeFragment) {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                val affParam = aff.ifBlank { null }
                apiService?.verifyCode(VerifyCodeRequestBean(phone, code, affParam))
            }.onSuccess {
                if (it?.code() == 200) {
                    view.loginResult(it.body())
                } else {
                    view.loginResult(null)
                }
            }.onFailure {
                it.printStackTrace()
                view.loginResult(null)
            }
        }
    }
}
