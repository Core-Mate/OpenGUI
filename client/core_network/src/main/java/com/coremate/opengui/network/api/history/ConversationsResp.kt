package com.coremate.opengui.network.api.history

import com.google.gson.annotations.SerializedName

data class ConversationsResp (
    @SerializedName("id") val id: Int,
    @SerializedName("createdBy") val createdBy: String,
    @SerializedName("conversationExtra") val conversationExtra: ConversationExtra,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String
)

data class ConversationExtra(
    @SerializedName("title") val title: String,
    @SerializedName("category") val category: String,
)