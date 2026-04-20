package com.coremate.opengui.network.api.login

import com.google.gson.annotations.SerializedName

data class LoginResponseBean(
    @SerializedName("user") val user: User,
    @SerializedName("token") val token: String
)

data class User(
    @SerializedName("id") val id: Int,
    @SerializedName("phoneNumber") val phoneNumber: String,
    @SerializedName("createdAt") val createdAt: String
)

data class VerificationCodeResp(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("code") val code: Int
)

data class UserV2(
    @SerializedName("id") val id: Int,
    @SerializedName("name") val name: String,
    @SerializedName("phoneNumber") val phoneNumber: String,
    @SerializedName("email") val email: String,
    @SerializedName("image") val image: String,
    @SerializedName("role") val role: String,
    @SerializedName("tenantId") val tenantId: Int,
)

data class VerifyCodeResp(
    @SerializedName("user") val user: UserV2,
    @SerializedName("token") val token: String,
    @SerializedName("finishOnboarding") val finishOnboarding: Boolean
)

data class OnboardingStatusResp(
    @SerializedName("finishOnboarding") val finishOnboarding: Boolean
)
