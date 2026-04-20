package com.coremate.opengui.network.api.ai_role

import com.google.gson.annotations.SerializedName

data class DefaultModel(
    @SerializedName("defaultAgentModelId") val defaultAgentModelId: String
)
