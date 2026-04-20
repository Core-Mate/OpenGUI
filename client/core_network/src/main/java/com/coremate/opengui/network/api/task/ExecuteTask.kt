package com.coremate.opengui.network.api.task

data class ExecuteTaskReq(
    val deviceID: String?,
    val taskDescriptionOverride: String?,
    val executionMode: String?,
    val agentModelID: String?
)

data class ExecuteTaskResp(
    val success: Boolean,
    val executionId: Int,
    val taskId: Int,
    val message: String
)

data class PauseTaskResp(
    val success: Boolean,
    val statusCode: Int,
    val message: String
)

data class TaskExecutionsResult(
    val id: Long,
    val taskId: Long,
    val userId: Long,
    val deviceId: String,
    val executionMode: String,
    val executionStatus: String,
    val statusMessage: String,
    val executionResult: String?,
    val executionResultSummary: String?,
    val errorMessage: String?,
    val currentStep: String,
    val scheduledAt: Any?,
    val startedAt: String?,
    val finishedAt: String?,
    val tokenUsage: TokenUsage,
    val createdAt: String,
    val updatedAt: String,
)

data class TokenUsage(
    val total: Long,
)

data class TaskHistoryResp(
    val items: List<TaskHistoryRespItem>,
    val total: Long,
    val page: Long,
    val pageSize: Long,
    val totalPages: Long
)

data class TaskHistoryRespItem (
    val id: Int,
    val taskID: Long,
    val userID: Long,
    val deviceID: String,
    val executionMode: String,
    val executionStatus: String,
    val statusMessage: Any? = null,
    val executionResult: String,
    val executionResultSummary: String,
    val errorMessage: Any? = null,
    val currentStep: Any? = null,
    val scheduledAt: Any? = null,
    val startedAt: String,
    val finishedAt: String,
    val tokenUsage: TokenUsage,
    val createdAt: String,
    val updatedAt: String
)

data class TaskHistoryRespItemTokenUsage (
    val total: Long
)

data class DeleteTaskResp(val success:Boolean,val message: String)
