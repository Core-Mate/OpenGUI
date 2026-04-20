package com.coremate.opengui.common.push

import com.google.gson.annotations.SerializedName

data class PushReqBean(
    @SerializedName("type") val type: String,
    @SerializedName("user_device_log_id") val userDeviceLogId: Int,
    @SerializedName("log_start_at") val logStartAt: String,
    @SerializedName("log_end_at") val logEndAt: String
)