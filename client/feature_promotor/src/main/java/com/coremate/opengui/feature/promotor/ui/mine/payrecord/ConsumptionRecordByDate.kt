package com.coremate.opengui.feature.promotor.ui.mine.payrecord

/**
 * 按日期分组的消费记录（与 Web ConsumptionRecordPage ConsumptionRecordByDate 对应）
 */
data class ConsumptionRecordByDate(
    val date: String,
    val dateLabel: String,
    val totalPoints: Double,
    val entries: List<ConsumptionEntry>
)
