package com.coremate.opengui.common_jvm.dto

data class MessageThinkPart(
    val actionState: ActionStatus = ActionStatus.IN_PROGRESS,
    val thinkCount: String? = null
) {
    enum class ActionStatus {
        INIT,
        COMPLETED,
        IN_PROGRESS,
        FAIL,
        INTERRUPT
    }
}