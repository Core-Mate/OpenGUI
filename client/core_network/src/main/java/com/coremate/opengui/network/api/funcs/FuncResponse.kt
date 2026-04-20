package com.coremate.opengui.network.api.funcs

import com.google.gson.annotations.SerializedName
import java.io.Serializable

data class FuncResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String
)

data class FuncPlatformBean(
    val name: String,
    val functions: List<FuncItemBean>,
    val iconName: String? = null,
)

data class FuncItemBean(
    @SerializedName("id")
    val id: Int? = null,
    @SerializedName("user_id")
    val userId: Int? = null,
    @SerializedName("created_at")
    val createdAt: String? = null,
    @SerializedName("custom_name")
    val customName: String? = null,
    @SerializedName("custom_parameters")
    val customParameters: Any? = null,
    @SerializedName("mission_config_id")
    val missionConfigId: Any? = null,
    @SerializedName("mission_source")
    val missionSource: String? = null,
    @SerializedName("prompt")
    val prompt: String? = null,
): Serializable