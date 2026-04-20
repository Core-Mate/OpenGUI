package com.coremate.opengui.common_jvm.dto

data class MessageThinkPart(
    val actionState: ActionStatus = ActionStatus.IN_PROGRESS,
    val thinkCount: String? = null
) {
    enum class ActionStatus {
        INIT, //工具调用初始态
        COMPLETED, //工具调用完成
        IN_PROGRESS, //工具调用中
        FAIL, //工具调用失败
        INTERRUPT //工具调用被打断
    }
}