package com.coremate.opengui.network.api

import com.google.gson.annotations.SerializedName

data class AgentMessageResponse(
    @SerializedName("agentMessages") val agentMessages: List<AgentMessage>,
    @SerializedName("pagination") val pagination: Pagination
)

data class AgentMessage(
    @SerializedName("id") val id: Int,
    @SerializedName("taskId") val taskId: Int,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("eventType") val eventType: String,
    @SerializedName("content") val content: String,
    @SerializedName("usage") val usage: Usage,
    @SerializedName("eventTimestamp") val eventTimestamp: String,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String,
)

data class AgentMessageMetadata(
    @SerializedName("usage") val usage: Usage
)

data class Usage(
    @SerializedName("input_tokens") val inputTokens: Int,
    @SerializedName("total_tokens") val totalTokens: Int,
    @SerializedName("output_tokens") val outputTokens: Int
)