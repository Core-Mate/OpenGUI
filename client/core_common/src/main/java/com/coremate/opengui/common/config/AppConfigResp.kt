package com.coremate.opengui.common.config

import com.google.gson.annotations.SerializedName

data class AppConfigResp(
    val success: Boolean,
    val data: AppConfigData?
)

data class AppConfigData(
    @SerializedName("supportApp")
    val supportApp: List<SupportApp>?
)

data class SupportApp (
    @SerializedName("appName")
    val appName: String,
    @SerializedName("package")
    val `package`: String
)