package com.coremate.opengui.network.api

import com.google.gson.annotations.SerializedName

class AbortAllTaskRequest(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("reason") val reason: String
)