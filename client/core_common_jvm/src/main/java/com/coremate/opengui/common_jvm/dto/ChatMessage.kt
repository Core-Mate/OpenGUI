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
        NORMAL, THINKING, LOADING // 普通消息，思考中消息
    }

    //以下为新增，为兼容旧代码，上面部分暂不删除
    enum class MessageState {
        NORMAL, THINKTING, THINK_DONE // 普通消息（用户发送的消息） 、思考中、思考完成
    }
}