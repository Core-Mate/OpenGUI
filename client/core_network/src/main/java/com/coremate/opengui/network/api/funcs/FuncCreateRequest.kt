package com.coremate.opengui.network.api.funcs

import com.google.gson.annotations.SerializedName

data class FuncCreateRequest(
    @SerializedName("custom_name") val customName: String,
    @SerializedName("prompt") val prompt: String,
    @SerializedName("mission_source") val missionSource: String
)