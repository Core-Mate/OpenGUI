package com.coremate.opengui.common_jvm.dto

import com.google.gson.annotations.SerializedName

/**
 * DTO for server-sent action requests.
 */
data class ActionReqDto(
    @SerializedName("userId") val userId: String,
    @SerializedName("actionType") val actionType: String,
    @SerializedName("actionInputs") val actionInputs: ActionInputs,
    @SerializedName("task_id") val taskId: Long
)

/**
 * Inputs for the various actions.
 */
data class ActionInputs(
    @SerializedName("start_x") val startX: Float?,
    @SerializedName("start_y") val startY: Float?,
    @SerializedName("end_x") val endX: Float?,
    @SerializedName("end_y") val endY: Float?,
    @SerializedName("content") val content: String?,
    @SerializedName("direction") val direction: String?,
    @SerializedName("app_name") val appName: String?
)

/**
 * DTO for responding to server requests via ACK.
 */
data class ActionRespDto(
    @SerializedName("success") val success: Boolean,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("screenshot_uri") val screenshotUrl: String?,
    @SerializedName("error") val error: String? = null
)

data class ScreenShotActionRespDto(
    @SerializedName("success") val success: Boolean,
    @SerializedName("user_id") val user_id: String,
    @SerializedName("screenshot_uri") val screenshot_uri: String?,
    @SerializedName("scale_factor") val scale_factor: Float,
    @SerializedName("screen_width") val screen_width: Int,
    @SerializedName("screen_height") val screen_height: Int,
)

/**
 * DTO for simple chat messages.
 */
data class ChatMessageDto(
    @SerializedName("message") val message: String,
    @SerializedName("timestamp") val timestamp: Long = System.currentTimeMillis()
)