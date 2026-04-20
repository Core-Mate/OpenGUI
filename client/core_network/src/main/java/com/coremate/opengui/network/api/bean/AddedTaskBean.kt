package com.coremate.opengui.network.api.bean

import android.graphics.Color
import com.google.gson.annotations.SerializedName

data class UITaskBean(
    val type: Int,
    val taskBean: TaskBean?,
    val cardColor:Int = Color.parseColor("#d6d6"),
    val timeTag:String
){
    companion object {
        const val TYPE_HAS_TIME = 0
        const val TYPE_NO_TIME = 1
    }
}

data class TaskBean(
    @SerializedName("id") val id: Int,
    @SerializedName("user_id") val userId: Int,
    @SerializedName("mission_name") val missionName: String,
    @SerializedName("description") val description: String,
    @SerializedName("parameters") val parameters: TaskParameters,
    @SerializedName("mission_type") val missionType: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String,
)

data class TaskParameters(
    @SerializedName("like_count") val likeCount: Int,
    @SerializedName("auto_like") val autoLike: Boolean,
    @SerializedName("min_duration") val minDuration: Int,
    @SerializedName("max_duration") val maxDuration: Int,
    @SerializedName("post_content") val postContent: String,
    @SerializedName("image_urls") val imageUrls: ArrayList<String>
)