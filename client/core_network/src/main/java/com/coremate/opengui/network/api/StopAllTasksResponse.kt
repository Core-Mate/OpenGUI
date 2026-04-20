package com.coremate.opengui.network.api

import com.google.gson.annotations.SerializedName

data class StopAllTasksResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("data") val data: StopAllTasksData?
)

data class StopAllTasksData(
    @SerializedName("stoppedCount") val stoppedCount: Int,
    @SerializedName("stoppedTasks") val stoppedTasks: List<String>, // 假设任务ID是字符串
    @SerializedName("failedCount") val failedCount: Int,
    @SerializedName("failedTasks") val failedTasks: List<String> // 假设任务ID是字符串
)