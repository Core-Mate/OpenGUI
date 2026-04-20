package com.coremate.opengui.feature.promotor.viewmodel

data class UIMessageBean(
    var id: Long?,
    var content: String = "",
    var type: MessageTypeEnum?,
    var finalState: FinalStateEnum?,
    var summary: String = "",
    var subTask: MutableList<Task>? = mutableListOf(),
    var isExpand: Boolean = false
)

data class Task(
    var id: Int?,
    var type: String,
    var content: String?,
    var taskState: String?
)

enum class MessageTypeEnum {
    USER, SERVER, TIMESTAMP, FOOTER
}

enum class FinalStateEnum {
    THINKING, THINK_SUCCESS, TASK_SUCCESS, FAIL, INTERRUPT
}