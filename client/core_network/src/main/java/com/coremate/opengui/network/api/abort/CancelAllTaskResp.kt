package com.coremate.opengui.network.api.abort

import com.google.gson.annotations.SerializedName
import com.coremate.opengui.network.api.ai_role.Required

data class  CancelAllTaskResp (
    @Required @SerializedName("success") var success: Boolean?,
    @Required @SerializedName("message") var message: String?,
    @Required @SerializedName("totalTasks") var totalTasks: Int?,
    @Required @SerializedName("cancelledTasks") var cancelledTasks: Int?,
    @Required @SerializedName("failedTasks") var failedTasks: Int?,
    @Required @SerializedName("details") var details: Array<Details>?
)

data class Details(
    @Required @SerializedName("taskId") var taskId: Int?,
    @Required @SerializedName("success") var success: Boolean?,
    @Required @SerializedName("message") var message: String?,
)