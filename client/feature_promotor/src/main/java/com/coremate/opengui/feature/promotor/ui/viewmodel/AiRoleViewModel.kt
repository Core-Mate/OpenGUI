package com.coremate.opengui.feature.promotor.ui.viewmodel

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.coremate.opengui.automation.base.utils.AMToastUtils
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.ai_role.GetAIRoleBean
import com.coremate.opengui.network.api.ai_role.PostAIRoleBean
import com.coremate.opengui.network.api.ai_role.Required
import kotlinx.coroutines.launch

@RequiresApi(Build.VERSION_CODES.O)
class AiRoleViewModel(context: Context) : ViewModel() {
    private var apiService = RetrofitClient.create(context)
    var aiRoleLiveData = MutableLiveData<GetAIRoleBean>()
    var remoteHaveAiRoleLiveData = MutableLiveData<Boolean>()
    var saveSuccessLiveData = MutableLiveData<Boolean>()
    var aiRole = PostAIRoleBean(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "https://example.com/avatar.jpg",
        arrayListOf(1, 2),
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID),
        "男",
        ""
    )

    fun getAiRoleConfig() {
        viewModelScope.launch {
            runCatching {
                apiService.getAiRole()
            }.onSuccess {
                val body = it.body()
                if (body != null) {
                    aiRoleLiveData.value = it.body()
                    remoteHaveAiRoleLiveData.value = true
                }
            }.onFailure {
                it.printStackTrace()
                AMToastUtils.showToast("网络加载失败")
            }
        }
    }

    fun saveAiRoleConfig() {
        viewModelScope.launch {
            runCatching {
                apiService.saveAiRole(aiRole)
            }.onSuccess {
                if (it.code() == 200 || it.code() == 201) {
                    val body = it.body()
                    if (body != null) {
                        aiRoleLiveData.value = it.body()
                    }
                    saveSuccessLiveData.value = true
                }
            }.onFailure {
                it.printStackTrace()
                AMToastUtils.showToast("网络加载失败")
            }
        }
    }

    fun updateAiRoleConfig() {
        Log.d("TAG", "updateAiRoleConfig: ${Gson().toJson(aiRole)}")
        viewModelScope.launch {
            runCatching {
                apiService.updateAiRole(aiRole)
            }.onSuccess {
                if (it.code() == 200 || it.code() == 201) {
                    val body = it.body()
                    if (body != null) {
                        aiRoleLiveData.value = it.body()
                    }
                    saveSuccessLiveData.value = true
                }
            }.onFailure {
                it.printStackTrace()
                AMToastUtils.showToast("网络加载失败")
            }
        }
    }

    fun validateRequiredFields(bean: PostAIRoleBean?): Boolean {
        if (bean == null) {
            return false
        }
        val fields = bean.javaClass.declaredFields
        for (field in fields) {
            if (field.isAnnotationPresent(Required::class.java)) {
                field.isAccessible = true
                val value = field.get(bean)
                if (value == null || (value is String && value.isEmpty())) {
                    Log.d("TAG", "validateRequiredFields: ------>$field")
                    return false // 必填字段为空
                }
            }
        }
        return true
    }


    ///自定义功能使用
    var aiRoleByFuncLiveData = MutableLiveData<GetAIRoleBean?>()
    fun getAiRoleByCustomFunc() {
        viewModelScope.launch {
            runCatching {
                apiService.getAiRole()
            }.onSuccess {
                val body = it.body()
                if (body != null) {
                    aiRoleByFuncLiveData.value = it.body()
                } else {
                    aiRoleByFuncLiveData.value = null
                }
            }.onFailure {
                it.printStackTrace()
                aiRoleByFuncLiveData.value = null
                AMToastUtils.showToast("网络加载失败")
            }
        }
    }
}