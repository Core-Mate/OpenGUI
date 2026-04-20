package com.coremate.opengui.network.api.login

import com.google.gson.annotations.SerializedName

data class LoginRequestBean(
    @SerializedName("phoneNumber") val phoneNumber: String,
    @SerializedName("activation_code") val activationCode: String,
    @SerializedName("device_token") val deviceToken: String
)

data class RequestVerificationCode(
    @SerializedName("phoneNumber") val phoneNumber: String
)

data class VerifyCodeRequestBean(
    @SerializedName("phoneNumber") val phoneNumber: String,
    @SerializedName("code") val code: String,
    @SerializedName("aff") val aff: String? = null
)
