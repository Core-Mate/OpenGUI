package com.coremate.opengui.network.api.task

import com.google.gson.annotations.SerializedName

data class Extra(
    @SerializedName("extraResult")
    val extraResult: ExtraResult?
)

data class ExtraResult(
    val success: Boolean,
    @SerializedName("fail_reason")
    val failReason: String,
    val task: String,
    val notes: String
)