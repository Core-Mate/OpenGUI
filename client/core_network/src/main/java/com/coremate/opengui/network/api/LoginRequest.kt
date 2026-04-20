package com.coremate.opengui.network.api

import com.google.gson.annotations.SerializedName

class LoginRequest (
    @SerializedName("phoneNumber") val phoneNumber: String,
    @SerializedName("activation_code") val activationCode: String
)