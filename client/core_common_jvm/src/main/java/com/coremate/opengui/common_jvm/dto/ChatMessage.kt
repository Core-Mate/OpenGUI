// common_jvm/dto/ChatMessage.kt
package com.coremate.opengui.common_jvm.dto

import java.util.UUID

data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val content: String,
    val sender: Sender,
    val type: MessageType = MessageType.NORMAL,
    val state: MessageState = MessageState.NORMAL,
    val timestamp: Long = System.currentTimeMillis(),
    var displayTimestamp: String? = null,
    var taskId: Int? = null,
    var thinkPart: MutableList<MessageThinkPart> = mutableListOf(),
    var taskFeedback: String? = null,
    var taskState: String? = null
) {
    enum class Sender {
        USER, AI
    }

    enum class MessageType {
        NORMAL, THINKING, LOADING
    }


    enum class MessageState {
        NORMAL, THINKTING, THINK_DONE
    }
}