package com.coremate.opengui.common.statistics

import android.content.Context

/**
 * 事件埋点类型
 */
enum class StatisticEvent(val eventName: String) {
    SSE_START_EVENT("sse_start_event"),
    SSE_PROCESS_EVENT("sse_process_event"),
    SSE_END_EVENT("sse_end_event"),
    AI_ACTION_EVENT("ai_action_event"),
    URL_REQUEST("url_req")
}

/**
 * 自定义异常类型
 */
enum class StatisticCustomError(val errType: String) {
    API_ERR("APIException"),
    SOCKET_ERR("SOCKETException"),
    SSE_ERR("SSEException"),
    AM_ERR("AMTaskException"),
}


/// 统计管理类 (open-source stub - analytics disabled)
class StatisticsManager {

    companion object {
        lateinit var applicationContext: Context
        val instance by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            StatisticsManager()
        }
    }

    fun preInitSDK(context: Context) {
        applicationContext = context
    }

    fun initSDK(isAutoPageMode: Boolean = true) {
        // Analytics disabled in open-source version
    }

    fun onPageStart(viewName: String?) {}

    fun onPageEnd(viewName: String?) {}

    fun onKillProcess(context: Context) {}

    fun onUploadEvent(type: StatisticEvent, param: MutableMap<String, Any>) {}

    fun onUploadException(errType: StatisticCustomError, e: String) {}
}
