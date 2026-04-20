package com.coremate.opengui.network.websocket

object SocketEvents {
    // Client → Server
    const val EXECUTION_READY = "execution:ready"
    const val LEASE_HEARTBEAT = "lease:heartbeat"

    // Server → Client (streaming, replaces SSE)
    const val AGENT_EVENT = "agent:event"

    // Server → Client (lifecycle)
    const val EXECUTION_STARTED = "execution:started"
    const val EXECUTION_FINISHED = "execution:finished"
    const val EXECUTION_ERROR = "execution:error"

    // Server → Client (device requests, with ACK)
    const val DEVICE_SCREENSHOT = "device:screenshot"
    const val DEVICE_ACTION = "device:action"

    // Standby (Client ↔ Server, /standby namespace)
    const val STANDBY_REGISTER = "standby:register"
    const val STANDBY_HEARTBEAT = "standby:heartbeat"
    const val STANDBY_DISPATCH = "standby:dispatch"
}
