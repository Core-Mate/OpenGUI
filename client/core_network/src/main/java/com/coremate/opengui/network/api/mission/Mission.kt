package com.coremate.opengui.network.api.mission

import com.google.gson.annotations.SerializedName


data class MissionBean(
    @SerializedName("id") val id: Int,
    @SerializedName("user_id") val userId: Int,
    @SerializedName("mission_config_id") val missionConfigId: String,
    @SerializedName("custom_name") val customName: String,
    @SerializedName("prompt") val prompt: String,
    @SerializedName("custom_parameters") val customParameters: String,
    @SerializedName("mission_source") val missionSource: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String,
)

data class UIMissionBean(
    var checked: Boolean,
    val missionBean: MissionBean
)

data class ChatMessageRequest(
    @SerializedName("content") val content: String,
)

data class ChatMessageResp(
    @SerializedName("success") val success: Boolean,
    @SerializedName("taskId") val taskId: String?
)