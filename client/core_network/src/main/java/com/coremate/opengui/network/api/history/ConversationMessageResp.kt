package com.coremate.opengui.network.api.history

import com.google.gson.annotations.SerializedName

data class ConversationMessageResp(
    @SerializedName("conversationId") val conversationId: Int,
    @SerializedName("messages") val messages: MutableList<MessageItem>,
    @SerializedName("total") val total: Int,
    @SerializedName("limit") val limit: Int,
    @SerializedName("offset") val offset: Int,
    @SerializedName("hasMore") val hasMore: Boolean
)

data class MessageItem(
    @SerializedName("id") val id: Int,
    @SerializedName("content") val content: String,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("taskId") val taskId: Int,
    @SerializedName("taskStatus") val taskStatus: TaskStatus,
    @SerializedName("metadata") val metadata: Metadata,
    @SerializedName("agentMessages") val agentMessages: MutableList<AgentMessage>,
)

enum class TaskStatus(val value: String) {
    @SerializedName("completed")
    COMPLETED("completed"),
    
    @SerializedName("failed")
    FAILED("failed"),

    @SerializedName("cancelled")
    CANCELLED("cancelled"),

    @SerializedName("pending")
    PENDING("pending"),

    @SerializedName("running")
    RUNNING("running")
}

data class Metadata(
    @SerializedName("msgType") val msgType: String,
    @SerializedName("senderId") val senderId: String,
)

data class AgentMessage(
    @SerializedName("id") val id: Int,
    @SerializedName("content") val content: String,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("metadata") val metadata: AgentMessageMetadata,
)

data class AgentMessageMetadata(
    @SerializedName("messageId") val messageId: String,
)