package com.coremate.opengui.feature.promotor.ui.mine.payrecord

/**
 * 单条消费记录（与 Web ConsumptionRecordPage ConsumptionEntry 对应）
 */
data class ConsumptionEntry(
    val id: String,
    val appName: String,
    val taskTitle: String,
    val timeRange: String,
    val points: Double
)
