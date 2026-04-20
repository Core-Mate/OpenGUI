package com.coremate.opengui.network.api.mission_schedules

import com.google.gson.annotations.SerializedName

data class MissionSchedulesBean(
    @SerializedName("id") val id: Int,
    @SerializedName("user_id") val userId: Int,
    @SerializedName("mission_id") val missionId: Int,
    @SerializedName("start_time") val startTime: String,
    @SerializedName("end_time") val endTime: String,
    @SerializedName("is_enabled") val is_enabled: Boolean,
    @SerializedName("card_style") val cardStyle: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String
) {
    companion object {
        const val TYPE_HAS_TIME = 0
        const val TYPE_NO_TIME = 1
    }
}

data class UIMissionSchedulesBean(
    val timeTag: String,
    val isExecuting:Boolean = false,
    val missionName:String?,
    val missionSchedulesBean: MissionSchedulesBean?
)