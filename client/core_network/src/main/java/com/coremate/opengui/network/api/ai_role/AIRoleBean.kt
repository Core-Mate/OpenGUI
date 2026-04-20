package com.coremate.opengui.network.api.ai_role

import com.google.gson.annotations.SerializedName

data class GetAIRoleBean(
    @Required @SerializedName("id") var id: Int?,
    @Required @SerializedName("device_id") var deviceId: String?,
    @Required @SerializedName("gender") var gender: String?,
    @Required @SerializedName("style") var style: String?,
    @Required @SerializedName("user_nickname") var userNickname: String?,
    @Required @SerializedName("personal_title") var personalTitle: String?,
    @Required @SerializedName("industry") var industry: String?,
    @Required @SerializedName("product_category") var productCategory: String?,
    @Required @SerializedName("product_features") var productFeatures: String?,
    @Required @SerializedName("target_customer_group") var targetCustomerGroup: String?,
    @Required @SerializedName("target_customer_city") var targetCustomerCity: String?,
    @Required @SerializedName("role_name") var roleName: String?,
    @SerializedName("user_avatar_url") var userAvatarUrl: String = "",
    @SerializedName("knowledge_base_ids") var knowledgeBaseIds: List<Long>? = emptyList(),
    @SerializedName("created_at") val createdAt: String?,
    @SerializedName("updated_at") val updatedAt: String?
)

data class PostAIRoleBean(
    @Required @SerializedName("user_nickname") var userNickname: String?,
    @Required @SerializedName("personal_title") var personalTitle: String?,
    @Required @SerializedName("industry") var industry: String?,
    @Required @SerializedName("product_category") var productCategory: String?,
    @Required @SerializedName("product_features") var productFeatures: String?,
    @Required @SerializedName("target_customer_group") var targetCustomerGroup: String?,
    @Required @SerializedName("target_customer_city") var targetCustomerCity: String?,
    @Required @SerializedName("role_name") var roleName: String?,
    @Required @SerializedName("user_avatar_url") var userAvatarUrl: String = "https://example.com/avatar.jpg",
    @Required @SerializedName("knowledge_base_ids") var knowledgeBaseIds: List<Long>? = arrayListOf(
        1,
        2
    ),
    @Required @SerializedName("device_id") var deviceId: String? = null,
    @Required @SerializedName("gender") var gender: String? = null,
    @Required @SerializedName("style") var style: String? = null,
)


@Target(AnnotationTarget.FIELD)
@Retention(AnnotationRetention.RUNTIME)
annotation class Required