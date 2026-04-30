package com.coremate.opengui.feature.promotor.ui.mine.payrecord

/**
 */
data class ConsumptionRecordByDate(
    val date: String,
    val dateLabel: String,
    val totalPoints: Double,
    val entries: List<ConsumptionEntry>
)
