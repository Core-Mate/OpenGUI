package com.coremate.opengui.network.api.task

import java.io.Serializable

data class TaskTemplatesResp(
    val id: Int,
    val userID: Long,
    val taskName: String,
    val taskDescription: String,
    val relatedPlatforms: List<String>,
    val category: String,
    val totalExecutions: Long,
    val successCount: Long,
    val failCount: Long,
    val createdAt: String,
    val updatedAt: String,
    val publishedAt: Any? = null,
    val lastExecution: Any? = null,
    val isTemplate: Boolean
) : Serializable

/**
 * 创建任务请求
 */
data class CreateTaskReq(
    val taskName: String,
    val taskDescription: String,
    val relatedPlatforms: List<String>?,
    val category: String?
)

/**
 * 创建任务响应
 */
data class CreateTaskResp(
    val id: Int,
    val userID: Long,
    val taskName: String,
    val taskDescription: String,
    val relatedPlatforms: List<String>,
    val category: String,
    val totalExecutions: Long,
    val successCount: Long,
    val failCount: Long,
    val createdAt: String,
    val updatedAt: String,
    val publishedAt: Any? = null,
    val lastExecution: Any? = null
)

/**
 * 获取任务列表请求
 */
data class GetTaskListReq(
    val page: Int,
    val pageSize: Int,
    val category: String,
    val platform: String,
    val keyword: String
)

/**
 * 获取任务列表响应
 */
data class TaskListResp(
    val items: List<TaskListRespItem>,
    val total: Long,
    val page: Long,
    val pageSize: Long,
    val totalPages: Long
)

data class TaskListRespItem(
    val id: Int,
    val userID: Long,
    val taskName: String,
    val taskDescription: String,
    val relatedPlatforms: List<String>,
    val category: String,
    val totalExecutions: Long,
    val successCount: Long,
    val failCount: Long,
    val createdAt: String,
    val updatedAt: String,
    val lastExecution: TaskListRespLastExecution?
) : Serializable

data class TaskListRespLastExecution(
    val id: Int,
    val status: String,
    val result: String,
    val finishedAt: String
) : Serializable

/**
 * 获取任务详情请求
 */
data class GetTaskDetailsReq(
    val id: Long,
    val userID: Long,
    val taskName: String,
    val taskDescription: String,
    val relatedPlatforms: List<String>,
    val category: String,
    val totalExecutions: Long,
    val successCount: Long,
    val failCount: Long,
    val createdAt: String,
    val updatedAt: String,
    val lastExecution: GetTaskDetailsReqLastExecution
)

data class GetTaskDetailsReqLastExecution(
    val id: Long,
    val status: String,
    val result: String,
    val finishedAt: String
)


/**
 * 获取任务详情响应
 */
data class GetTaskDetailsResp(
    val statusCode: Long,
    val message: String
)

/**
 * 更新任务请求
 */
data class UpdateTaskReq(
    val taskName: String?,
    val taskDescription: String?,
    val relatedPlatforms: List<String>?,
    val category: String?
)

/**
 * 删除任务请求
 */
data class DeleteTaskReq(
    val success: Boolean,
    val message: String
)

data class ResumeTaskReq(val feedback: String?)