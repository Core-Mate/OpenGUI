package com.coremate.opengui.network.api

import com.google.gson.annotations.SerializedName

// 最外层响应结构
data class ChatHistoryResponse(
    @SerializedName("messages") val messages: List<ChatMessage>,
    @SerializedName("pagination") val pagination: Pagination
)

// 单条聊天消息
data class ChatMessage(
    @SerializedName("id") val id: Int,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("content") val content: String?, // content 可以为空，因为 server_chat 消息可能没有 content
    @SerializedName("isRead") val isRead: Boolean,
    @SerializedName("msgType") val msgType: String, // "server_chat", "client_chat"
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String
)

// AI 思考历史中的单条记录
data class ModelChatHistoryItem(
    @SerializedName("id") val id: Int,
    @SerializedName("taskId") val taskId: Int,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("conversationIndex") val conversationIndex: Int,
    @SerializedName("msgType") val msgType: String, // "screenshot", "thinking"
    @SerializedName("timingInfo") val timingInfo: TimingInfo?,
    @SerializedName("screenshotContext") val screenshotContext: ScreenshotContext?,
    @SerializedName("predictionSummary") val predictionSummary: String?, // AI 思考的总结
    @SerializedName("predictionData") val predictionData: List<PredictionData>?,
    @SerializedName("actionType") val actionType: String?,
    @SerializedName("actionParams") val actionParams: ActionParams?,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String
)

data class TimingInfo(
    @SerializedName("end") val end: Long,
    @SerializedName("cost") val cost: Int,
    @SerializedName("start") val start: Long
)

data class ScreenshotContext(
    @SerializedName("mime") val mime: String,
    @SerializedName("size") val size: Size,
    @SerializedName("scaleFactor") val scaleFactor: Int
)

data class Size(
    @SerializedName("width") val width: Int,
    @SerializedName("height") val height: Int
)

data class PredictionData(
    @SerializedName("thought") val thought: String?,
    @SerializedName("reflection") val reflection: String?,
    @SerializedName("action_type") val actionType: String?,
    @SerializedName("action_inputs") val actionInputs: Map<String, Any>? // 使用 Map<String, Any> 处理动态键值
)

data class ActionParams(
    @SerializedName("end_x") val endX: Int,
    @SerializedName("end_y") val endY: Int,
    @SerializedName("content") val content: String?,
    @SerializedName("start_x") val startX: Int,
    @SerializedName("start_y") val startY: Int,
    @SerializedName("app_name") val appName: String?,
    @SerializedName("direction") val direction: String?
)

data class Pagination(
    @SerializedName("page") val page: Int,
    @SerializedName("pageSize") val pageSize: Int,
    @SerializedName("total") val total: Int,
    @SerializedName("totalPages") val totalPages: Int
)