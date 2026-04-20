package com.coremate.opengui.network.api

import com.google.gson.annotations.SerializedName

data class TaskControlResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String
)