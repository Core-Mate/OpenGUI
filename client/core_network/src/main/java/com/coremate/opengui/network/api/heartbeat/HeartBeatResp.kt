package com.coremate.opengui.network.api.heartbeat

data class HeartBeatResp (
    val success: Boolean,
    val ttl: Int,
    val heartbeatInterval: Int,
    val executionStatus: String,
    val message: Any? = null
)