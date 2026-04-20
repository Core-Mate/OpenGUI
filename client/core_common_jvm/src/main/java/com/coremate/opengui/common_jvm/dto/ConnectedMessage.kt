package com.coremate.opengui.common_jvm.dto

data class ConnectedMessage(
    val message: String,
    val socketId: String,
    val deviceId: String
)