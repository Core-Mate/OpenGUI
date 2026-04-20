package com.coremate.opengui.network.api

import com.google.gson.annotations.SerializedName

data class LoginResponse(
    @SerializedName("user") val user: UserBean,
    @SerializedName("token") val token: String
)

data class UserBean(
    @SerializedName("id") val id: Int,
    @SerializedName("phoneNumber") val phoneNumber: String,
    @SerializedName("createdAt") val createdAt: String
)