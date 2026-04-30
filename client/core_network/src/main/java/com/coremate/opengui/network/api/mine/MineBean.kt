package com.coremate.opengui.network.api.mine

import com.google.gson.annotations.SerializedName

data class MyBalanceRespItem (
    val remaining: Long,
    val totalPurchased: Long,
    val totalUsed: Long,
    val freeCredits: Long,
    var isCheckin:Boolean?,
    @SerializedName("checkinCredit")
    var checkinCredit:Long?
)

data class MyCheckinRespItem (
    @SerializedName("isCheckin")
    var isCheckin:Boolean?,
    @SerializedName("getCredit")
    var getCredit:Long?,
    @SerializedName("remaining")
    var remaining:Long?,
)
