package com.coremate.opengui.network.api.mission_schedules

import com.google.gson.annotations.SerializedName

data class AddMissionSchedulesRequestBean(
    @SerializedName("mission_id") val missionId: Int,
    @SerializedName("start_time") val startTime: String,
    @SerializedName("end_time") val endTime: String,
    @SerializedName("card_style") val cardStyle: String,
    @SerializedName("device_id") val deviceId: String
)